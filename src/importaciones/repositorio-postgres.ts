import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import type { MotivoPlanificadoDeNoAsistencia, TipoDeEstadoManual } from "@/asistencias/estado-manual";
import {
  asistenciasEsperadas,
  colaboradores,
  estadosManuales,
  horasExtra,
  importacionesSemanales,
  sedes,
  marcasCrudas,
  periodosPlanilla,
  reemplazosDeAsistenciaImportada,
  tardanzas,
  turnosPublicados,
} from "@/db/schema";

import type { AsistenciaExistente, ImportacionDeAsistencias, RepositorioDeImportaciones } from "./importar-semana-por-sede";

export class RepositorioPostgresDeImportaciones implements RepositorioDeImportaciones {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async buscarColaborador(idHuellero: string): Promise<{ idHuellero: string } | undefined> {
    const [colaborador] = await this.db.select({ idHuellero: colaboradores.idHuellero })
      .from(colaboradores).where(eq(colaboradores.idHuellero, idHuellero));
    return colaborador;
  }

  async buscarSede(nombre: string): Promise<string | undefined> {
    const sedesCoincidentes = await this.db.select({ nombre: sedes.nombre }).from(sedes)
      .where(and(eq(sedes.activa, true), sql`lower(btrim(${sedes.nombre})) = lower(btrim(${nombre}))`));
    return sedesCoincidentes.length === 1 ? sedesCoincidentes[0].nombre : undefined;
  }

  async buscarTurnoPublicado(idHuellero: string, fecha: string): Promise<{
    idHuellero: string;
    fecha: string;
    sede: string | null;
    descanso: boolean;
    motivoNoAsistencia: MotivoPlanificadoDeNoAsistencia | null;
  } | undefined> {
    const [turno] = await this.db.select({
      idHuellero: turnosPublicados.idHuellero,
      fecha: turnosPublicados.fecha,
      sede: turnosPublicados.sede,
      descanso: turnosPublicados.descanso,
      motivoNoAsistencia: turnosPublicados.motivoNoAsistencia,
    })
      .from(turnosPublicados).where(and(eq(turnosPublicados.idHuellero, idHuellero), eq(turnosPublicados.fecha, fecha)));
    return turno;
  }

  async perteneceAPeriodoAbierto(fecha: string): Promise<boolean> {
    const [periodo] = await this.db.select({ id: periodosPlanilla.id }).from(periodosPlanilla)
      .where(and(eq(periodosPlanilla.estado, "abierto"), lte(periodosPlanilla.inicio, fecha), gte(periodosPlanilla.fin, fecha)));
    return Boolean(periodo);
  }

  async buscarAsistenciasExistentes(identidades: Array<{ idHuellero: string; fecha: string }>): Promise<AsistenciaExistente[]> {
    if (!identidades.length) return [];
    const filas = await this.db.select({
      id: asistenciasEsperadas.id,
      idHuellero: asistenciasEsperadas.idHuellero,
      fecha: asistenciasEsperadas.fecha,
      estado: asistenciasEsperadas.estado,
      entradaPropuesta: asistenciasEsperadas.entradaPropuesta,
      salidaPropuesta: asistenciasEsperadas.salidaPropuesta,
      entradaReal: asistenciasEsperadas.entradaReal,
      salidaReal: asistenciasEsperadas.salidaReal,
    }).from(asistenciasEsperadas).where(or(...identidades.map(({ idHuellero, fecha }) =>
      and(eq(asistenciasEsperadas.idHuellero, idHuellero), eq(asistenciasEsperadas.fecha, fecha)),
    )));

    const idsManuales = filas.filter((fila) => fila.estado === "manual").map((fila) => fila.id);
    const estadosManualesPorAsistencia = await this.buscarUltimoEstadoManualPorAsistencia(idsManuales);

    return filas.map((fila) => ({
      idHuellero: fila.idHuellero,
      fecha: fila.fecha,
      asistenciaId: fila.id,
      estado: fila.estado,
      entradaPropuesta: fila.entradaPropuesta,
      salidaPropuesta: fila.salidaPropuesta,
      entradaReal: fila.entradaReal,
      salidaReal: fila.salidaReal,
      estadoManual: estadosManualesPorAsistencia.get(fila.id),
    }));
  }

  private async buscarUltimoEstadoManualPorAsistencia(
    asistenciaIds: string[],
  ): Promise<Map<string, { tipo: TipoDeEstadoManual; comentario: string }>> {
    if (!asistenciaIds.length) return new Map();
    const registros = await this.db.select({
      asistenciaId: estadosManuales.asistenciaId,
      tipo: estadosManuales.tipo,
      comentario: estadosManuales.comentario,
      registradoEn: estadosManuales.registradoEn,
    }).from(estadosManuales).where(inArray(estadosManuales.asistenciaId, asistenciaIds));

    const masReciente = new Map<string, { tipo: TipoDeEstadoManual; comentario: string; registradoEn: Date }>();
    for (const registro of registros) {
      const actual = masReciente.get(registro.asistenciaId);
      if (!actual || registro.registradoEn > actual.registradoEn) masReciente.set(registro.asistenciaId, registro);
    }
    return new Map([...masReciente].map(([asistenciaId, { tipo, comentario }]) => [asistenciaId, { tipo, comentario }]));
  }

  async guardar(importacion: ImportacionDeAsistencias): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [guardada] = await tx.insert(importacionesSemanales).values({
        archivoNombre: importacion.archivo.nombre, archivoUbicacion: importacion.archivo.ubicacion, archivoHashSha256: importacion.archivo.hashSha256,
        usuarioId: importacion.usuarioId, importadaEn: importacion.importadaEn,
      }).returning({ id: importacionesSemanales.id });
      if (importacion.marcasCrudas.length) {
        await tx.insert(marcasCrudas).values(importacion.marcasCrudas.map((marca) => ({ ...marca, importacionId: guardada.id })));
      }
      for (const propuesta of importacion.propuestas) {
        const [actualizada] = await tx.insert(asistenciasEsperadas).values(propuesta).onConflictDoUpdate({
          target: [asistenciasEsperadas.idHuellero, asistenciasEsperadas.fecha],
          set: { entradaPropuesta: propuesta.entradaPropuesta, salidaPropuesta: propuesta.salidaPropuesta },
          where: eq(asistenciasEsperadas.estado, "pendiente"),
        }).returning({ id: asistenciasEsperadas.id });
        if (!actualizada) {
          throw new Error(`La asistencia de ${propuesta.idHuellero} el ${propuesta.fecha} cambió mientras se aplicaba la importación.`);
        }
      }
      for (const reemplazo of importacion.reemplazos) {
        await tx.insert(reemplazosDeAsistenciaImportada).values({
          asistenciaId: reemplazo.asistenciaId,
          importacionId: guardada.id,
          estadoAnterior: reemplazo.estadoAnterior,
          valorAnterior: reemplazo.valorAnterior,
          responsableId: importacion.usuarioId,
          reemplazadoEn: importacion.importadaEn,
        });
        await tx.delete(tardanzas).where(eq(tardanzas.asistenciaId, reemplazo.asistenciaId));
        await tx.delete(horasExtra).where(eq(horasExtra.asistenciaId, reemplazo.asistenciaId));
        const [actualizada] = await tx.update(asistenciasEsperadas).set({
          estado: "pendiente",
          entradaPropuesta: reemplazo.entradaPropuesta,
          salidaPropuesta: reemplazo.salidaPropuesta,
          entradaReal: null,
          salidaReal: null,
          minutosTrabajados: null,
          instantaneaDeTurno: null,
          confirmadoPorId: null,
          confirmadoEn: null,
        }).where(and(
          eq(asistenciasEsperadas.id, reemplazo.asistenciaId),
          eq(asistenciasEsperadas.estado, reemplazo.estadoAnterior),
        )).returning({ id: asistenciasEsperadas.id });
        if (!actualizada) {
          throw new Error(`La asistencia de ${reemplazo.idHuellero} el ${reemplazo.fecha} cambió mientras se aplicaba la importación.`);
        }
      }
    });
  }

  async listarAsistenciasPendientes(): Promise<Array<{
    idHuellero: string;
    fecha: string;
    entradaPropuesta: string | null;
    salidaPropuesta: string | null;
  }>> {
    return this.db.select({
      idHuellero: asistenciasEsperadas.idHuellero,
      fecha: asistenciasEsperadas.fecha,
      entradaPropuesta: asistenciasEsperadas.entradaPropuesta,
      salidaPropuesta: asistenciasEsperadas.salidaPropuesta,
    }).from(asistenciasEsperadas).where(eq(asistenciasEsperadas.estado, "pendiente"));
  }

  async listarAsistenciasConfirmadas(): Promise<Array<{
    idHuellero: string;
    fecha: string;
    entradaReal: string;
    salidaReal: string;
  }>> {
    return this.db.select({
      idHuellero: asistenciasEsperadas.idHuellero,
      fecha: asistenciasEsperadas.fecha,
      entradaReal: asistenciasEsperadas.entradaReal,
      salidaReal: asistenciasEsperadas.salidaReal,
    }).from(asistenciasEsperadas).where(eq(asistenciasEsperadas.estado, "confirmada")).then((asistencias) =>
      asistencias.filter((asistencia): asistencia is { idHuellero: string; fecha: string; entradaReal: string; salidaReal: string } =>
        asistencia.entradaReal !== null && asistencia.salidaReal !== null,
      ),
    );
  }

  async listarMarcasSinTurno(): Promise<Array<{
    importacionId: string;
    idHuellero: string;
    fecha: string;
    entradaPropuesta?: string;
    salidaPropuesta?: string;
  }>> {
    const marcas = await this.db.select({
      importacionId: marcasCrudas.importacionId,
      idHuellero: marcasCrudas.idHuellero,
      fecha: marcasCrudas.fecha,
      instante: marcasCrudas.instante,
    })
      .from(marcasCrudas)
      .innerJoin(colaboradores, eq(marcasCrudas.idHuellero, colaboradores.idHuellero))
      .leftJoin(turnosPublicados, and(eq(marcasCrudas.idHuellero, turnosPublicados.idHuellero), eq(marcasCrudas.fecha, turnosPublicados.fecha)))
      .where(isNull(turnosPublicados.id));
    const agrupadas = new Map<string, typeof marcas>();
    for (const marca of marcas) {
      const clave = `${marca.importacionId}:${marca.idHuellero}:${marca.fecha}`;
      agrupadas.set(clave, [...(agrupadas.get(clave) ?? []), marca]);
    }
    return [...agrupadas.values()].map((marcasDelDia) => {
      marcasDelDia.sort((a, b) => a.instante.localeCompare(b.instante));
      const propuesta = marcasDelDia.length > 1 && marcasDelDia.length % 2 === 0;
      return {
        importacionId: marcasDelDia[0].importacionId,
        idHuellero: marcasDelDia[0].idHuellero,
        fecha: marcasDelDia[0].fecha,
        ...(propuesta ? { entradaPropuesta: marcasDelDia[0].instante, salidaPropuesta: marcasDelDia.at(-1)!.instante } : {}),
      };
    });
  }
}
