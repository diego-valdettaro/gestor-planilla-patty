import { and, eq, gte, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { asistenciasEsperadas, auditoriaPeriodosPlanilla, colaboradores, estadosManuales, horasExtra, periodosPlanilla, tardanzas, turnosPublicados } from "@/db/schema";
import { crearResumenVacio, PeriodosSolapadosError, type BloqueoDePeriodo, type DetalleDeJornada, type EstadoDeHoraExtra, type FiltrosDeResumen, type FilaDeResumen, type MotivoDeNoAsistencia, type PeriodoPlanilla, type RepositorioDePeriodos, type ResumenDePeriodo } from "./periodo-planilla";

export class RepositorioPostgresDePeriodos implements RepositorioDePeriodos {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}
  async listar(): Promise<PeriodoPlanilla[]> { return this.db.select().from(periodosPlanilla); }
  async buscar(id: string): Promise<PeriodoPlanilla | undefined> {
    const [periodo] = await this.db.select().from(periodosPlanilla).where(eq(periodosPlanilla.id, id)); return periodo;
  }
  async listarResumen(filtros: FiltrosDeResumen): Promise<ResumenDePeriodo> {
    const periodo = await this.buscar(filtros.periodoId);
    if (!periodo) throw new Error("No existe el período de planilla.");
    const jornadas = await this.db.select({
      idHuellero: asistenciasEsperadas.idHuellero, nombre: colaboradores.nombre, grupoActual: colaboradores.grupo, fecha: asistenciasEsperadas.fecha,
      grupo: turnosPublicados.grupo, sedeProgramada: turnosPublicados.sede, instantaneaDeTurno: asistenciasEsperadas.instantaneaDeTurno,
      estado: asistenciasEsperadas.estado, entradaReal: asistenciasEsperadas.entradaReal, salidaReal: asistenciasEsperadas.salidaReal,
      minutosTrabajados: asistenciasEsperadas.minutosTrabajados, motivoReal: estadosManuales.tipo,
      tardanza: tardanzas.minutosDeTardanza, penalizados: tardanzas.minutosPenalizados,
      al25: horasExtra.minutosAl25, al35: horasExtra.minutosAl35, estadoExtra: horasExtra.estado,
    })
      .from(asistenciasEsperadas).innerJoin(colaboradores, eq(asistenciasEsperadas.idHuellero, colaboradores.idHuellero))
      .innerJoin(turnosPublicados, and(eq(turnosPublicados.idHuellero, asistenciasEsperadas.idHuellero), eq(turnosPublicados.fecha, asistenciasEsperadas.fecha)))
      .leftJoin(estadosManuales, eq(estadosManuales.asistenciaId, asistenciasEsperadas.id))
      .leftJoin(tardanzas, eq(tardanzas.asistenciaId, asistenciasEsperadas.id)).leftJoin(horasExtra, eq(horasExtra.asistenciaId, asistenciasEsperadas.id))
      .where(and(gte(asistenciasEsperadas.fecha, periodo.inicio), lte(asistenciasEsperadas.fecha, periodo.fin)));
    const agrupadas = new Map<string, FilaDeResumen>();
    const bloqueos: BloqueoDePeriodo[] = [];
    for (const jornada of jornadas) {
      const clave = `${jornada.grupo}:${jornada.idHuellero}`;
      const fila = agrupadas.get(clave) ?? crearFilaVacia(jornada.idHuellero, jornada.nombre, jornada.grupo);
      const resultado = jornada.estado === "pendiente" ? "pendiente" : jornada.estado === "manual" ? jornada.motivoReal : "trabajada";
      if (!resultado) throw new Error(`La jornada manual de ${jornada.idHuellero} del ${jornada.fecha} no tiene motivo real.`);
      const detalle: DetalleDeJornada = {
        fecha: jornada.fecha,
        sede: jornada.estado === "confirmada" ? jornada.instantaneaDeTurno?.sede ?? jornada.sedeProgramada : jornada.estado === "manual" ? null : jornada.sedeProgramada,
        resultado, entradaReal: jornada.entradaReal, salidaReal: jornada.salidaReal,
        minutosTrabajados: jornada.minutosTrabajados ?? 0,
        tardanzaEnMinutos: jornada.tardanza ?? 0, minutosPenalizados: jornada.penalizados ?? 0,
        ...(jornada.estadoExtra ? { horaExtra: { estado: jornada.estadoExtra, minutosAl25: jornada.al25 ?? 0, minutosAl35: jornada.al35 ?? 0 } } : {}),
      };
      fila.jornadas.push(detalle);
      if (resultado === "trabajada") fila.jornadasTrabajadas += 1;
      if (esMotivoDeNoAsistencia(resultado)) fila.noAsistencias[resultado] += 1;
      fila.minutosTrabajados += detalle.minutosTrabajados;
      fila.cantidadTardanzas += jornada.tardanza === null ? 0 : 1;
      fila.minutosPenalizados += detalle.minutosPenalizados;
      if (detalle.horaExtra) sumarHoraExtra(fila, detalle.horaExtra.estado, detalle.horaExtra.minutosAl25, detalle.horaExtra.minutosAl35);
      if (resultado === "pendiente") bloqueos.push({ tipo: "asistencia", idHuellero: jornada.idHuellero, nombre: jornada.nombre, grupo: jornada.grupoActual, fecha: jornada.fecha });
      if (jornada.estadoExtra === "pendiente") bloqueos.push({ tipo: "hora-extra", idHuellero: jornada.idHuellero, nombre: jornada.nombre, grupo: jornada.grupoActual, fecha: jornada.fecha });
      agrupadas.set(clave, fila);
    }
    const todasLasFilas = [...agrupadas.values()];
    for (const fila of todasLasFilas) fila.jornadas.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const totales = todasLasFilas.reduce((acumulado, fila) => sumarFila(acumulado, fila), crearResumenVacio().totales);
    const filas = todasLasFilas.filter((fila) =>
      (!filtros.idHuellero || fila.idHuellero === filtros.idHuellero)
      && (!filtros.sede || fila.jornadas.some(({ sede }) => sede === filtros.sede)),
    ).sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nombre.localeCompare(b.nombre));
    return { filas, totales, bloqueos };
  }
  async crear(inicio: string, fin: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const solapados = await tx.select({ id: periodosPlanilla.id }).from(periodosPlanilla)
        .where(and(lte(periodosPlanilla.inicio, fin), gte(periodosPlanilla.fin, inicio)));
      if (solapados.length) throw new PeriodosSolapadosError();
      await tx.insert(periodosPlanilla).values({ inicio, fin, estado: "abierto" });
    });
  }
  async cerrar(id: string, responsableId: string, registradoEn: Date): Promise<void> {
    const periodo = await this.buscar(id);
    if (!periodo) throw new Error("No existe el período de planilla.");
    await this.db.transaction(async (tx) => {
      const pendientes = await tx.select({ id: asistenciasEsperadas.id }).from(asistenciasEsperadas)
        .where(and(gte(asistenciasEsperadas.fecha, periodo.inicio), lte(asistenciasEsperadas.fecha, periodo.fin), eq(asistenciasEsperadas.estado, "pendiente")));
      if (pendientes.length) throw new Error("No se puede cerrar el período: existen asistencias pendientes de revisión.");
      const actualizado = await tx.update(periodosPlanilla).set({ estado: "cerrado", cerradoPorId: responsableId, cerradoEn: registradoEn })
        .where(and(eq(periodosPlanilla.id, id), eq(periodosPlanilla.estado, "abierto"))).returning({ id: periodosPlanilla.id });
      if (!actualizado.length) throw new Error("El período no existe o ya está cerrado.");
      await tx.insert(auditoriaPeriodosPlanilla).values({ periodoId: id, accion: "cierre", responsableId, registradoEn });
    });
  }
  async reabrir(id: string, responsableId: string, motivo: string, registradoEn: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      const actualizado = await tx.update(periodosPlanilla).set({ estado: "abierto", cerradoPorId: null, cerradoEn: null })
        .where(and(eq(periodosPlanilla.id, id), eq(periodosPlanilla.estado, "cerrado"))).returning({ id: periodosPlanilla.id });
      if (!actualizado.length) throw new Error("El período no existe o ya está abierto.");
      await tx.insert(auditoriaPeriodosPlanilla).values({ periodoId: id, accion: "reapertura", responsableId, motivo, registradoEn });
    });
  }
}

const MOTIVOS_DE_NO_ASISTENCIA: MotivoDeNoAsistencia[] = ["falta", "descanso", "feriado", "vacaciones", "permiso", "suspension"];
const ESTADOS_DE_HORA_EXTRA: EstadoDeHoraExtra[] = ["pendiente", "aprobada", "rechazada"];

function crearFilaVacia(idHuellero: string, nombre: string, grupo: string): FilaDeResumen {
  return { idHuellero, nombre, grupo, ...crearResumenVacio().totales, jornadas: [] };
}

function esMotivoDeNoAsistencia(resultado: DetalleDeJornada["resultado"]): resultado is MotivoDeNoAsistencia {
  return MOTIVOS_DE_NO_ASISTENCIA.includes(resultado as MotivoDeNoAsistencia);
}

function sumarHoraExtra(fila: Pick<FilaDeResumen, "horasExtra">, estado: EstadoDeHoraExtra, minutosAl25: number, minutosAl35: number) {
  fila.horasExtra[estado].minutosAl25 += minutosAl25;
  fila.horasExtra[estado].minutosAl35 += minutosAl35;
}

function sumarFila(totales: ResumenDePeriodo["totales"], fila: FilaDeResumen): ResumenDePeriodo["totales"] {
  totales.jornadasTrabajadas += fila.jornadasTrabajadas;
  totales.minutosTrabajados += fila.minutosTrabajados;
  totales.cantidadTardanzas += fila.cantidadTardanzas;
  totales.minutosPenalizados += fila.minutosPenalizados;
  for (const motivo of MOTIVOS_DE_NO_ASISTENCIA) totales.noAsistencias[motivo] += fila.noAsistencias[motivo];
  for (const estado of ESTADOS_DE_HORA_EXTRA) sumarHoraExtra(totales, estado, fila.horasExtra[estado].minutosAl25, fila.horasExtra[estado].minutosAl35);
  return totales;
}
