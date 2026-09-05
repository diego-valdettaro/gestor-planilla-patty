import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import {
  asistenciasEsperadas,
  ajustesDeAsistencia,
  celdasDePlanesSemanalesEnBorrador,
  colaboradores,
  historialDeTurnosPublicados,
  horariosSemanalesProcesados,
  estadosManuales,
  horasExtra,
  periodosPlanilla,
  planesSemanalesEnBorrador,
  sedes,
  turnosPublicados,
  tardanzas,
} from "@/db/schema";

import type { RepositorioDeEquiposOperativos } from "./configurar-equipos-operativos";
import type { EquipoOperativo } from "./configurar-equipos-operativos";
import type { CeldaDePlanSemanalEnBorrador, PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";
import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";
import type { ProcesamientoDeHorarioSemanal } from "./procesar-horario-semanal";
import type { Actor } from "@/colaboradores/registrar-colaborador";
import { desplazarFecha, diasDeLaSemana, inicioDeSemana } from "./semana";

export class RepositorioPostgresDeTurnos implements RepositorioDeTurnos, RepositorioDeEquiposOperativos, RepositorioDePlanesSemanales {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async buscarPublicado(
    idHuellero: string,
    fecha: string,
  ): Promise<TurnoPublicado | undefined> {
    const [turno] = await this.db
      .select({
        idHuellero: turnosPublicados.idHuellero,
        fecha: turnosPublicados.fecha,
        sede: turnosPublicados.sede,
        modeloHorarioId: turnosPublicados.modeloHorarioId,
        entradaProgramada: turnosPublicados.entradaProgramada,
        salidaProgramada: turnosPublicados.salidaProgramada,
        descanso: turnosPublicados.descanso,
      })
      .from(turnosPublicados)
      .where(
        and(
          eq(turnosPublicados.idHuellero, idHuellero),
          eq(turnosPublicados.fecha, fecha),
        ),
      );

    return turno;
  }

  async publicar(turno: TurnoPublicado, actor?: Actor): Promise<void> {
    await this.publicarEnLote([turno], actor);
  }

  async publicarEnLote(turnos: TurnoPublicado[], actor?: Actor): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const turno of turnos) {
        const [procesado] = await tx.select({ id: horariosSemanalesProcesados.id }).from(horariosSemanalesProcesados).where(and(
          eq(horariosSemanalesProcesados.idHuellero, turno.idHuellero), eq(horariosSemanalesProcesados.semana, inicioDeSemana(turno.fecha)),
        ));
        if (procesado) throw new Error("El horario semanal ya fue procesado y no se puede publicar.");
        const [periodo] = await tx.select({ id: periodosPlanilla.id }).from(periodosPlanilla).where(and(
          eq(periodosPlanilla.estado, "abierto"), lte(periodosPlanilla.inicio, turno.fecha), gte(periodosPlanilla.fin, turno.fecha),
        ));
        if (!periodo) throw new Error("La fecha no pertenece a un período de planilla abierto.");
        const [existente] = await tx.select({ id: turnosPublicados.id }).from(turnosPublicados).where(and(
          eq(turnosPublicados.idHuellero, turno.idHuellero), eq(turnosPublicados.fecha, turno.fecha),
        ));
        if (existente) throw new Error("Ya existe un horario semanal publicado para este colaborador y fecha.");
      }
      for (const turno of turnos) {
        const [turnoPublicado] = await tx.insert(turnosPublicados).values(turno).returning({ id: turnosPublicados.id });
        await tx.insert(historialDeTurnosPublicados).values({
          turnoPublicadoId: turnoPublicado.id,
          horario: contenidoDe(turno),
          responsableId: actor?.id,
          motivo: actor ? "Publicación inicial" : null,
        });
        if (!turno.descanso) {
          await tx.insert(asistenciasEsperadas).values({ idHuellero: turno.idHuellero, fecha: turno.fecha, estado: "pendiente" });
        }
      }
    });
  }

  async asistenciaEstaProcesada(idHuellero: string, fecha: string): Promise<boolean> {
    if (await this.horarioSemanalEstaProcesado(idHuellero, inicioDeSemana(fecha))) return true;
    const [asistencia] = await this.db.select({ estado: asistenciasEsperadas.estado }).from(asistenciasEsperadas).where(and(
      eq(asistenciasEsperadas.idHuellero, idHuellero), eq(asistenciasEsperadas.fecha, fecha),
    ));
    return asistencia?.estado === "confirmada" || asistencia?.estado === "manual";
  }

  async horarioSemanalEstaProcesado(idHuellero: string, semana: string): Promise<boolean> {
    const [procesamiento] = await this.db.select({ id: horariosSemanalesProcesados.id }).from(horariosSemanalesProcesados).where(and(
      eq(horariosSemanalesProcesados.idHuellero, idHuellero), eq(horariosSemanalesProcesados.semana, semana),
    ));
    return Boolean(procesamiento);
  }

  async listarSemanaPublicada(idHuellero: string, semana: string): Promise<Array<{ fecha: string; descanso: boolean }>> {
    const fechas = diasDeLaSemana(semana);
    return this.db.select({ fecha: turnosPublicados.fecha, descanso: turnosPublicados.descanso }).from(turnosPublicados).where(and(
      eq(turnosPublicados.idHuellero, idHuellero), gte(turnosPublicados.fecha, fechas[0]), lte(turnosPublicados.fecha, fechas.at(-1)!),
    ));
  }

  async asistenciasLaboralesEstanProcesadas(idHuellero: string, semana: string): Promise<boolean> {
    const fechas = diasDeLaSemana(semana);
    const filas = await this.db.select({
      descanso: turnosPublicados.descanso,
      estado: asistenciasEsperadas.estado,
    }).from(turnosPublicados).leftJoin(asistenciasEsperadas, and(
      eq(asistenciasEsperadas.idHuellero, turnosPublicados.idHuellero), eq(asistenciasEsperadas.fecha, turnosPublicados.fecha),
    )).where(and(
      eq(turnosPublicados.idHuellero, idHuellero), gte(turnosPublicados.fecha, fechas[0]), lte(turnosPublicados.fecha, fechas.at(-1)!),
    ));
    return filas.filter(({ descanso }) => !descanso).every(({ estado }) => estado === "confirmada" || estado === "manual");
  }

  async obtenerEquipoOperativo(idHuellero: string): Promise<"tiendas" | "taller" | undefined> {
    const [colaborador] = await this.db.select({ equipo: sedes.equipoOperativo }).from(colaboradores)
      .innerJoin(sedes, eq(colaboradores.sede, sedes.nombre)).where(eq(colaboradores.idHuellero, idHuellero));
    return colaborador?.equipo === "tiendas" || colaborador?.equipo === "taller" ? colaborador.equipo : undefined;
  }

  async registrarProcesamiento({ idHuellero, semana, equipo, responsableId }: ProcesamientoDeHorarioSemanal): Promise<void> {
    const fechas = diasDeLaSemana(semana);
    await this.db.transaction(async (tx) => {
      const horarios = await tx.select({ fecha: turnosPublicados.fecha, descanso: turnosPublicados.descanso }).from(turnosPublicados).where(and(
        eq(turnosPublicados.idHuellero, idHuellero), gte(turnosPublicados.fecha, fechas[0]), lte(turnosPublicados.fecha, fechas.at(-1)!),
      ));
      if (!fechas.every((fecha) => horarios.some((horario) => horario.fecha === fecha))) {
        throw new Error("El horario semanal debe tener los siete días publicados para procesarlo.");
      }
      const asistencias = await tx.select({ fecha: turnosPublicados.fecha, descanso: turnosPublicados.descanso, estado: asistenciasEsperadas.estado })
        .from(turnosPublicados).leftJoin(asistenciasEsperadas, and(
          eq(asistenciasEsperadas.idHuellero, turnosPublicados.idHuellero), eq(asistenciasEsperadas.fecha, turnosPublicados.fecha),
        )).where(and(
          eq(turnosPublicados.idHuellero, idHuellero), gte(turnosPublicados.fecha, fechas[0]), lte(turnosPublicados.fecha, fechas.at(-1)!),
        ));
      if (asistencias.some(({ descanso, estado }) => !descanso && estado !== "confirmada" && estado !== "manual")) {
        throw new Error("Todas las asistencias laborales de la semana deben estar confirmadas o tener un estado manual.");
      }
      await tx.insert(horariosSemanalesProcesados).values({ idHuellero, semana, equipo, responsableId });
    });
  }

  async reemplazarSemanaPublicada(turnos: TurnoPublicado[], actor: Actor, motivo: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const { idHuellero, fecha } of turnos) {
        const [procesado] = await tx.select({ id: horariosSemanalesProcesados.id }).from(horariosSemanalesProcesados).where(and(
          eq(horariosSemanalesProcesados.idHuellero, idHuellero), eq(horariosSemanalesProcesados.semana, inicioDeSemana(fecha)),
        ));
        if (procesado) throw new Error("No se puede corregir un horario semanal que ya fue procesado.");
      }
      for (const turno of turnos) {
        const [periodo] = await tx.select({ id: periodosPlanilla.id }).from(periodosPlanilla).where(and(
          eq(periodosPlanilla.estado, "abierto"), lte(periodosPlanilla.inicio, turno.fecha), gte(periodosPlanilla.fin, turno.fecha),
        ));
        if (!periodo) throw new Error("La fecha no pertenece a un período de planilla abierto.");
        const [existente] = await tx.select({ id: turnosPublicados.id }).from(turnosPublicados).where(and(
          eq(turnosPublicados.idHuellero, turno.idHuellero), eq(turnosPublicados.fecha, turno.fecha),
        ));
        if (!existente) throw new Error("La corrección debe incluir horarios semanales publicados.");
        const [asistencia] = await tx.select({ id: asistenciasEsperadas.id, estado: asistenciasEsperadas.estado }).from(asistenciasEsperadas).where(and(
          eq(asistenciasEsperadas.idHuellero, turno.idHuellero), eq(asistenciasEsperadas.fecha, turno.fecha),
        )).for("update");
        if (asistencia?.estado === "confirmada" || asistencia?.estado === "manual") throw new Error("No se puede corregir un horario semanal que ya fue procesado.");
        if (asistencia) {
          await tx.delete(ajustesDeAsistencia).where(eq(ajustesDeAsistencia.asistenciaId, asistencia.id));
          await tx.delete(estadosManuales).where(eq(estadosManuales.asistenciaId, asistencia.id));
          await tx.delete(tardanzas).where(eq(tardanzas.asistenciaId, asistencia.id));
          await tx.delete(horasExtra).where(eq(horasExtra.asistenciaId, asistencia.id));
          if (turno.descanso) await tx.delete(asistenciasEsperadas).where(eq(asistenciasEsperadas.id, asistencia.id));
          else await tx.update(asistenciasEsperadas).set({ estado: "pendiente", entradaPropuesta: null, salidaPropuesta: null, entradaReal: null, salidaReal: null, minutosTrabajados: null, instantaneaDeTurno: null, confirmadoPorId: null, confirmadoEn: null }).where(eq(asistenciasEsperadas.id, asistencia.id));
        } else if (!turno.descanso) {
          await tx.insert(asistenciasEsperadas).values({ idHuellero: turno.idHuellero, fecha: turno.fecha, estado: "pendiente" });
        }
        await tx.update(turnosPublicados).set({
          sede: turno.sede, modeloHorarioId: turno.modeloHorarioId ?? null, entradaProgramada: turno.entradaProgramada,
          salidaProgramada: turno.salidaProgramada, descanso: turno.descanso, publicadoEn: new Date(),
        }).where(eq(turnosPublicados.id, existente.id));
        await tx.insert(historialDeTurnosPublicados).values({
          turnoPublicadoId: existente.id, horario: contenidoDe(turno), responsableId: actor.id, motivo,
        });
      }
    });
  }

  async perteneceAPeriodoAbierto(fecha: string): Promise<boolean> {
    const [periodo] = await this.db
      .select({ id: periodosPlanilla.id })
      .from(periodosPlanilla)
      .where(
        and(
          eq(periodosPlanilla.estado, "abierto"),
          lte(periodosPlanilla.inicio, fecha),
          gte(periodosPlanilla.fin, fecha),
        ),
      );

    return Boolean(periodo);
  }

  async listarSedesConColaboradoresActivos(): Promise<string[]> {
    const resultados = await this.db
      .select({ sede: sedes.nombre })
      .from(sedes)
      .where(eq(sedes.activa, true));

    return resultados.map(({ sede }) => sede).sort();
  }

  async listarEquiposOperativos(): Promise<Array<"tiendas" | "taller">> {
    const resultados = await this.db
      .selectDistinct({ equipo: sedes.equipoOperativo })
      .from(sedes)
      .where(and(eq(sedes.activa, true), inArray(sedes.equipoOperativo, ["tiendas", "taller"])));

    return resultados.flatMap(({ equipo }) => equipo ? [equipo] : []).sort();
  }

  async asignar(sede: string, equipo: "tiendas" | "taller"): Promise<void> {
    const actualizadas = await this.db.update(sedes).set({ equipoOperativo: equipo }).where(and(
      eq(sedes.nombre, sede),
      eq(sedes.activa, true),
    )).returning({ nombre: sedes.nombre });
    if (!actualizadas.length) throw new Error("La sede activa no existe.");
  }

  async listarColaboradoresActivosPorEquipo(equipo: "tiendas" | "taller"): Promise<
    Array<{ idHuellero: string; nombre: string; sede: string }>
  > {
    return this.db
      .select({
        idHuellero: colaboradores.idHuellero,
        nombre: colaboradores.nombre,
        sede: colaboradores.sede,
      })
      .from(colaboradores)
      .innerJoin(sedes, eq(colaboradores.sede, sedes.nombre))
      .where(and(eq(colaboradores.activo, true), eq(sedes.activa, true), eq(sedes.equipoOperativo, equipo)))
      .orderBy(sedes.nombre, colaboradores.nombre);
  }

  async listarColaboradoresProcesadosPorSemanaYEquipo(semana: string, equipo: "tiendas" | "taller"): Promise<
    Array<{ idHuellero: string; nombre: string; sede: string }>
  > {
    return this.db.select({ idHuellero: colaboradores.idHuellero, nombre: colaboradores.nombre, sede: colaboradores.sede })
      .from(horariosSemanalesProcesados)
      .innerJoin(colaboradores, eq(horariosSemanalesProcesados.idHuellero, colaboradores.idHuellero))
      .where(and(eq(horariosSemanalesProcesados.semana, semana), eq(horariosSemanalesProcesados.equipo, equipo)))
      .orderBy(colaboradores.sede, colaboradores.nombre);
  }

  async listarProcesamientosDeSemana(semana: string, equipo: "tiendas" | "taller"): Promise<string[]> {
    const resultados = await this.db.select({ idHuellero: horariosSemanalesProcesados.idHuellero }).from(horariosSemanalesProcesados)
      .where(and(eq(horariosSemanalesProcesados.semana, semana), eq(horariosSemanalesProcesados.equipo, equipo)));
    return resultados.map(({ idHuellero }) => idHuellero);
  }

  async listarEquiposConProcesamientosDeSemana(semana: string): Promise<Array<"tiendas" | "taller">> {
    const resultados = await this.db.selectDistinct({ equipo: horariosSemanalesProcesados.equipo }).from(horariosSemanalesProcesados)
      .where(eq(horariosSemanalesProcesados.semana, semana));
    return resultados.map(({ equipo }) => equipo).sort();
  }

  async listarPublicadosPorColaboradoresYSemana(
    idHuellero: string[],
    inicio: string,
    fin: string,
  ): Promise<TurnoPublicado[]> {
    if (!idHuellero.length) return [];
    return this.db
      .select({
        idHuellero: turnosPublicados.idHuellero,
        fecha: turnosPublicados.fecha,
        sede: turnosPublicados.sede,
        modeloHorarioId: turnosPublicados.modeloHorarioId,
        entradaProgramada: turnosPublicados.entradaProgramada,
        salidaProgramada: turnosPublicados.salidaProgramada,
        descanso: turnosPublicados.descanso,
      })
      .from(turnosPublicados)
      .where(and(inArray(turnosPublicados.idHuellero, idHuellero), gte(turnosPublicados.fecha, inicio), lte(turnosPublicados.fecha, fin)));
  }

  async listarColaboradoresActivos(): Promise<
    Array<{ idHuellero: string; nombre: string; sede: string }>
  > {
    return this.db
      .select({
        idHuellero: colaboradores.idHuellero,
        nombre: colaboradores.nombre,
        sede: colaboradores.sede,
      })
      .from(colaboradores)
      .where(eq(colaboradores.activo, true))
      .orderBy(colaboradores.nombre);
  }

  async listarColaboradoresActivosPorSede(sede: string): Promise<
    Array<{ idHuellero: string; nombre: string }>
  > {
    return this.db
      .select({
        idHuellero: colaboradores.idHuellero,
        nombre: colaboradores.nombre,
      })
      .from(colaboradores)
      .where(and(eq(colaboradores.sede, sede), eq(colaboradores.activo, true)));
  }

  async listarPublicadosPorSedeYSemana(
    sede: string,
    inicio: string,
    fin: string,
  ): Promise<TurnoPublicado[]> {
    return this.db
      .select({
        idHuellero: turnosPublicados.idHuellero,
        fecha: turnosPublicados.fecha,
        sede: turnosPublicados.sede,
        modeloHorarioId: turnosPublicados.modeloHorarioId,
        entradaProgramada: turnosPublicados.entradaProgramada,
        salidaProgramada: turnosPublicados.salidaProgramada,
        descanso: turnosPublicados.descanso,
      })
      .from(turnosPublicados)
      .where(
        and(
          eq(turnosPublicados.sede, sede),
          gte(turnosPublicados.fecha, inicio),
          lte(turnosPublicados.fecha, fin),
        ),
      );
  }

  async listarPublicadosPorColaboradorYSemana(
    idHuellero: string,
    inicio: string,
    fin: string,
  ): Promise<TurnoPublicado[]> {
    return this.db.select({
      idHuellero: turnosPublicados.idHuellero,
      fecha: turnosPublicados.fecha,
      sede: turnosPublicados.sede,
      modeloHorarioId: turnosPublicados.modeloHorarioId,
      entradaProgramada: turnosPublicados.entradaProgramada,
      salidaProgramada: turnosPublicados.salidaProgramada,
      descanso: turnosPublicados.descanso,
    }).from(turnosPublicados).where(and(
      eq(turnosPublicados.idHuellero, idHuellero),
      gte(turnosPublicados.fecha, inicio),
      lte(turnosPublicados.fecha, fin),
    ));
  }

  async obtenerOCrear(semana: string, equipo: EquipoOperativo): Promise<PlanSemanalEnBorrador> {
    await this.db.insert(planesSemanalesEnBorrador).values({ semana, equipo }).onConflictDoNothing();
    const [plan] = await this.db.select().from(planesSemanalesEnBorrador).where(and(
      eq(planesSemanalesEnBorrador.semana, semana), eq(planesSemanalesEnBorrador.equipo, equipo),
    ));
    return this.conCeldas(plan);
  }

  async buscarPorId(id: string): Promise<PlanSemanalEnBorrador | undefined> {
    const [plan] = await this.db.select().from(planesSemanalesEnBorrador).where(eq(planesSemanalesEnBorrador.id, id));
    return plan ? this.conCeldas(plan) : undefined;
  }

  async guardarCelda(celda: CeldaDePlanSemanalEnBorrador): Promise<void> {
    await this.guardarCeldas([celda]);
  }

  async guardarCeldas(celdas: CeldaDePlanSemanalEnBorrador[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const celda of celdas) {
        await tx.insert(celdasDePlanesSemanalesEnBorrador).values(celda).onConflictDoUpdate({
          target: [
            celdasDePlanesSemanalesEnBorrador.planId,
            celdasDePlanesSemanalesEnBorrador.idHuellero,
            celdasDePlanesSemanalesEnBorrador.fecha,
          ],
          set: {
            sede: celda.sede,
            modeloHorarioId: celda.modeloHorarioId,
            entradaProgramada: celda.entradaProgramada,
            salidaProgramada: celda.salidaProgramada,
            descanso: celda.descanso,
          },
        });
      }
    });
  }

  async reemplazarCeldasDelPlan(planId: string, celdas: CeldaDePlanSemanalEnBorrador[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(celdasDePlanesSemanalesEnBorrador).where(eq(celdasDePlanesSemanalesEnBorrador.planId, planId));
      if (celdas.length) await tx.insert(celdasDePlanesSemanalesEnBorrador).values(celdas);
      await tx.update(planesSemanalesEnBorrador).set({ actualizadoEn: new Date() }).where(eq(planesSemanalesEnBorrador.id, planId));
    });
  }

  async borrarCelda(planId: string, idHuellero: string, fecha: string): Promise<void> {
    await this.db.delete(celdasDePlanesSemanalesEnBorrador).where(and(
      eq(celdasDePlanesSemanalesEnBorrador.planId, planId),
      eq(celdasDePlanesSemanalesEnBorrador.idHuellero, idHuellero),
      eq(celdasDePlanesSemanalesEnBorrador.fecha, fecha),
    ));
  }

  async colaboradorPerteneceAEquipo(idHuellero: string, equipo: EquipoOperativo): Promise<boolean> {
    const [colaborador] = await this.db.select({ id: colaboradores.idHuellero }).from(colaboradores)
      .innerJoin(sedes, eq(colaboradores.sede, sedes.nombre))
      .where(and(eq(colaboradores.idHuellero, idHuellero), eq(colaboradores.activo, true), eq(sedes.activa, true), eq(sedes.equipoOperativo, equipo)));
    return Boolean(colaborador);
  }

  async obtenerSedeDelColaborador(idHuellero: string): Promise<string | undefined> {
    const [colaborador] = await this.db.select({ sede: colaboradores.sede }).from(colaboradores)
      .where(eq(colaboradores.idHuellero, idHuellero));
    return colaborador?.sede;
  }

  async listarHorariosPublicadosDelEquipoEnSemana(semana: string, equipo: EquipoOperativo): Promise<
    Array<Omit<CeldaDePlanSemanalEnBorrador, "planId">>
  > {
    return this.db.select({
      idHuellero: turnosPublicados.idHuellero,
      fecha: turnosPublicados.fecha,
      sede: turnosPublicados.sede,
      modeloHorarioId: turnosPublicados.modeloHorarioId,
      entradaProgramada: turnosPublicados.entradaProgramada,
      salidaProgramada: turnosPublicados.salidaProgramada,
      descanso: turnosPublicados.descanso,
    }).from(turnosPublicados)
      .innerJoin(colaboradores, eq(turnosPublicados.idHuellero, colaboradores.idHuellero))
      .innerJoin(sedes, eq(colaboradores.sede, sedes.nombre))
      .where(and(
        eq(colaboradores.activo, true),
        eq(sedes.activa, true),
        eq(sedes.equipoOperativo, equipo),
        gte(turnosPublicados.fecha, semana),
        lte(turnosPublicados.fecha, desplazarFecha(semana, 6)),
      ));
  }

  private async conCeldas(plan: { id: string; semana: string; equipo: EquipoOperativo }): Promise<PlanSemanalEnBorrador> {
    const celdas = await this.db.select({
      planId: celdasDePlanesSemanalesEnBorrador.planId,
      idHuellero: celdasDePlanesSemanalesEnBorrador.idHuellero,
      fecha: celdasDePlanesSemanalesEnBorrador.fecha,
      sede: celdasDePlanesSemanalesEnBorrador.sede,
      modeloHorarioId: celdasDePlanesSemanalesEnBorrador.modeloHorarioId,
      entradaProgramada: celdasDePlanesSemanalesEnBorrador.entradaProgramada,
      salidaProgramada: celdasDePlanesSemanalesEnBorrador.salidaProgramada,
      descanso: celdasDePlanesSemanalesEnBorrador.descanso,
    }).from(celdasDePlanesSemanalesEnBorrador).where(eq(celdasDePlanesSemanalesEnBorrador.planId, plan.id));
    return { ...plan, celdas };
  }
}

function contenidoDe(turno: TurnoPublicado) {
  return {
    idHuellero: turno.idHuellero,
    fecha: turno.fecha,
    sede: turno.sede,
    modeloHorarioId: turno.modeloHorarioId ?? null,
    entradaProgramada: turno.entradaProgramada,
    salidaProgramada: turno.salidaProgramada,
    descanso: turno.descanso,
  };
}
