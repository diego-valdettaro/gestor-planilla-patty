import { and, eq, gte, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { asistenciasEsperadas, auditoriaPeriodosPlanilla, colaboradores, horasExtra, periodosPlanilla, tardanzas } from "@/db/schema";
import type { FiltrosDeResumen, FilaDeResumen, PeriodoPlanilla, RepositorioDePeriodos } from "./periodo-planilla";

export class RepositorioPostgresDePeriodos implements RepositorioDePeriodos {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}
  async listar(): Promise<PeriodoPlanilla[]> { return this.db.select().from(periodosPlanilla); }
  async buscar(id: string): Promise<PeriodoPlanilla | undefined> {
    const [periodo] = await this.db.select().from(periodosPlanilla).where(eq(periodosPlanilla.id, id)); return periodo;
  }
  async listarResumen(filtros: FiltrosDeResumen): Promise<FilaDeResumen[]> {
    const periodo = await this.buscar(filtros.periodoId);
    if (!periodo) throw new Error("No existe el período de planilla.");
    const filas = await this.db.select({ idHuellero: asistenciasEsperadas.idHuellero, nombre: colaboradores.nombre, sede: colaboradores.sede,
      minutosTrabajados: asistenciasEsperadas.minutosTrabajados, tardanza: tardanzas.minutosDeTardanza, penalizados: tardanzas.minutosPenalizados,
      al25: horasExtra.minutosAl25, al35: horasExtra.minutosAl35, estadoExtra: horasExtra.estado })
      .from(asistenciasEsperadas).innerJoin(colaboradores, eq(asistenciasEsperadas.idHuellero, colaboradores.idHuellero))
      .leftJoin(tardanzas, eq(tardanzas.asistenciaId, asistenciasEsperadas.id)).leftJoin(horasExtra, eq(horasExtra.asistenciaId, asistenciasEsperadas.id))
      .where(and(gte(asistenciasEsperadas.fecha, periodo.inicio), lte(asistenciasEsperadas.fecha, periodo.fin),
        filtros.sede ? eq(colaboradores.sede, filtros.sede) : undefined,
        filtros.idHuellero ? eq(asistenciasEsperadas.idHuellero, filtros.idHuellero) : undefined));
    const agrupadas = new Map<string, FilaDeResumen>();
    for (const fila of filas) {
      const actual = agrupadas.get(fila.idHuellero) ?? { idHuellero: fila.idHuellero, nombre: fila.nombre, sede: fila.sede, minutosTrabajados: 0, cantidadTardanzas: 0, minutosPenalizados: 0, minutosAl25: 0, minutosAl35: 0 };
      actual.minutosTrabajados += fila.minutosTrabajados ?? 0; actual.cantidadTardanzas += fila.tardanza === null ? 0 : 1;
      actual.minutosPenalizados += fila.penalizados ?? 0;
      if (fila.estadoExtra === "aprobada") { actual.minutosAl25 += fila.al25 ?? 0; actual.minutosAl35 += fila.al35 ?? 0; }
      agrupadas.set(fila.idHuellero, actual);
    }
    return [...agrupadas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
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
