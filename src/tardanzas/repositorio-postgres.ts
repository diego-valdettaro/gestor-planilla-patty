import { and, asc, desc, eq, gte, isNotNull, lt, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { invalidarAprobacionesDeAsistencia, bloquearPeriodos } from "@/periodos/aprobaciones";
import { asistenciasEsperadas, colaboradores, periodosPlanilla, politicasDePenalizacionPorTardanzas, politicasTardanzasGrupo, sedes, tardanzas } from "@/db/schema";

import { calcularMinutosDeTardanza, calcularMinutosPenalizados, type PoliticaDePenalizacionPorTardanzas, type RepositorioDeTardanzas, type SolicitudDePoliticaPorGrupo } from "./politica-de-penalizacion";

export class RepositorioPostgresDeTardanzas implements RepositorioDeTardanzas {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async guardarPolitica(politica: PoliticaDePenalizacionPorTardanzas): Promise<void> {
    await this.db.insert(politicasDePenalizacionPorTardanzas).values(politica);
  }

  async obtenerGrupo(nombre: string): Promise<{ nombre: string; gestionaAsistencia: boolean } | undefined> {
    const [grupo] = await this.db.select({ nombre: schema.grupos.nombre, gestionaAsistencia: schema.grupos.gestionaAsistencia })
      .from(schema.grupos).where(eq(schema.grupos.nombre, nombre));
    return grupo;
  }

  async listarPoliticasDeGrupo() {
    return this.db.select().from(politicasTardanzasGrupo).orderBy(asc(politicasTardanzasGrupo.grupo));
  }

  async guardarPoliticaDeGrupo(politica: SolicitudDePoliticaPorGrupo & { configuradaPorId: string; configuradaEn: Date }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await bloquearPeriodos(tx);
      // El primer chequeo del caso de uso es informativo; este bloqueo vuelve a validar la bandera en el mismo
      // orden que los períodos antes de persistir, serializando con una desactivación concurrente del grupo.
      const [grupo] = await tx.select({ nombre: schema.grupos.nombre, gestionaAsistencia: schema.grupos.gestionaAsistencia })
        .from(schema.grupos).where(eq(schema.grupos.nombre, politica.grupo)).for("update");
      if (!grupo) throw new Error("El grupo no existe.");
      if (!grupo.gestionaAsistencia) throw new Error("El grupo no gestiona asistencia.");
      await tx.insert(politicasTardanzasGrupo).values({ ...politica, conflicto: false })
        .onConflictDoUpdate({
          target: politicasTardanzasGrupo.grupo,
          set: {
            toleranciaEnMinutos: politica.toleranciaEnMinutos,
            tardanzasAcumuladas: politica.tardanzasAcumuladas,
            horasPenalizadas: politica.horasPenalizadas,
            conflicto: false,
            configuradaPorId: politica.configuradaPorId,
            configuradaEn: politica.configuradaEn,
          },
        });

      const asistencias = await tx.select({
        id: asistenciasEsperadas.id,
        dni: asistenciasEsperadas.dni,
        fecha: asistenciasEsperadas.fecha,
        periodoInicio: periodosPlanilla.inicio,
        periodoFin: periodosPlanilla.fin,
        entradaReal: asistenciasEsperadas.entradaReal,
        instantanea: asistenciasEsperadas.instantaneaDeTurno,
        tardanzaId: tardanzas.id,
        minutosDeTardanza: tardanzas.minutosDeTardanza,
        minutosPenalizados: tardanzas.minutosPenalizados,
      }).from(asistenciasEsperadas)
        .innerJoin(colaboradores, eq(colaboradores.dni, asistenciasEsperadas.dni))
        .innerJoin(periodosPlanilla, and(
          lte(periodosPlanilla.inicio, asistenciasEsperadas.fecha),
          gte(periodosPlanilla.fin, asistenciasEsperadas.fecha),
          eq(periodosPlanilla.estado, "abierto"),
        ))
        .leftJoin(tardanzas, eq(tardanzas.asistenciaId, asistenciasEsperadas.id))
        .where(and(eq(colaboradores.grupo, politica.grupo), eq(asistenciasEsperadas.estado, "confirmada"), isNotNull(asistenciasEsperadas.entradaReal)))
        .orderBy(asc(asistenciasEsperadas.dni), asc(asistenciasEsperadas.fecha));

      const politicaCalculable = {
        toleranciaEnMinutos: politica.toleranciaEnMinutos,
        tardanzasAcumuladas: politica.tardanzasAcumuladas,
        horasPenalizadas: politica.horasPenalizadas,
      };
      for (const asistencia of asistencias) {
        const entradaProgramada = asistencia.instantanea?.entradaProgramada;
        if (!asistencia.entradaReal || !entradaProgramada) continue;
        const minutos = calcularMinutosDeTardanza(entradaProgramada, asistencia.entradaReal);
        const esTardanza = minutos > politica.toleranciaEnMinutos;
        let cambio = false;
        if (!esTardanza) {
          if (asistencia.tardanzaId) {
            await tx.delete(tardanzas).where(eq(tardanzas.id, asistencia.tardanzaId));
            cambio = true;
          }
        } else {
          const anteriores = await tx.select({ id: tardanzas.id }).from(tardanzas)
            .innerJoin(asistenciasEsperadas, eq(tardanzas.asistenciaId, asistenciasEsperadas.id))
            .where(and(
              eq(asistenciasEsperadas.dni, asistencia.dni),
              gte(asistenciasEsperadas.fecha, asistencia.periodoInicio),
              lte(asistenciasEsperadas.fecha, asistencia.periodoFin),
              lt(asistenciasEsperadas.fecha, asistencia.fecha),
            ));
          const minutosPenalizados = calcularMinutosPenalizados(anteriores.length + 1, politicaCalculable);
          if (asistencia.tardanzaId) {
            if (asistencia.minutosDeTardanza !== minutos || asistencia.minutosPenalizados !== minutosPenalizados) {
              await tx.update(tardanzas).set({ minutosDeTardanza: minutos, minutosPenalizados })
                .where(eq(tardanzas.id, asistencia.tardanzaId));
              cambio = true;
            }
          } else {
            await tx.insert(tardanzas).values({ asistenciaId: asistencia.id, minutosDeTardanza: minutos, minutosPenalizados, politicaVersion: 1 });
            cambio = true;
          }
        }
        if (cambio) {
          await invalidarAprobacionesDeAsistencia(tx, {
            dnis: [asistencia.dni], desde: asistencia.fecha, hasta: asistencia.fecha,
            motivo: `Cambió el resultado de asistencia al ajustar la política de tardanzas del grupo ${politica.grupo}.`,
            soloAbiertos: true,
          });
        }
      }
    });
  }

  async buscarPoliticaVigente(sede: string, fecha: string, dni?: string) {
    return buscarPoliticaVigente(this.db, sede, fecha, dni);
  }

  async contarTardanzas(dni: string, inicio: string, fin: string): Promise<number> {
    const filas = await this.db.select({ id: tardanzas.id }).from(tardanzas)
      .innerJoin(asistenciasEsperadas, eq(tardanzas.asistenciaId, asistenciasEsperadas.id))
      .where(and(eq(asistenciasEsperadas.dni, dni), gte(asistenciasEsperadas.fecha, inicio), lte(asistenciasEsperadas.fecha, fin)));
    return filas.length;
  }
}


export async function buscarPoliticaVigente(
  db: Pick<NodePgDatabase<typeof schema>, "select">,
  sede: string,
  fecha: string,
  dni?: string,
) {
  let grupo: string | null | undefined;
  if (dni) {
    const [persona] = await db.select({ grupo: colaboradores.grupo }).from(colaboradores).where(eq(colaboradores.dni, dni));
    if (!persona) throw new Error(`No existe la persona ${dni} para consultar su política de tardanzas.`);
    grupo = persona.grupo;
  } else {
    const [sedeActual] = await db.select({ grupo: sedes.grupo }).from(sedes).where(eq(sedes.nombre, sede));
    grupo = sedeActual?.grupo;
  }
  if (dni && !grupo) throw new Error(`La persona ${dni} no tiene un grupo para consultar su política de tardanzas.`);
  if (grupo) {
    const [politicaDeGrupo] = await db.select().from(politicasTardanzasGrupo).where(eq(politicasTardanzasGrupo.grupo, grupo));
    if (politicaDeGrupo) {
      if (politicaDeGrupo.conflicto) throw new Error(`El grupo ${grupo} tiene conflictos en su política de tardanzas y requiere selección manual.`);
      if (politicaDeGrupo.toleranciaEnMinutos === null || politicaDeGrupo.tardanzasAcumuladas === null || politicaDeGrupo.horasPenalizadas === null || !politicaDeGrupo.configuradaPorId || !politicaDeGrupo.configuradaEn) {
        throw new Error(`El grupo ${grupo} no tiene una política de tardanzas completa.`);
      }
      return {
        sede,
        toleranciaEnMinutos: politicaDeGrupo.toleranciaEnMinutos,
        tardanzasAcumuladas: politicaDeGrupo.tardanzasAcumuladas,
        horasPenalizadas: politicaDeGrupo.horasPenalizadas,
        version: 1,
        vigenteDesde: "0001-01-01",
        configuradaPorId: politicaDeGrupo.configuradaPorId,
        configuradaEn: politicaDeGrupo.configuradaEn,
      };
    }
    if (dni) throw new Error(`El grupo ${grupo} no tiene política de tardanzas configurada.`);
  }
  const [politica] = await db.select().from(politicasDePenalizacionPorTardanzas)
    .where(and(eq(politicasDePenalizacionPorTardanzas.sede, sede), lte(politicasDePenalizacionPorTardanzas.vigenteDesde, fecha)))
    .orderBy(desc(politicasDePenalizacionPorTardanzas.vigenteDesde)).limit(1);
  return politica;
}
