import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import {
  asistenciasEsperadas,
  celdasDePlanesSemanalesEnBorrador,
  colaboradores,
  historialDeTurnosPublicados,
  periodosPlanilla,
  planesSemanalesEnBorrador,
  sedes,
  turnosPublicados,
} from "@/db/schema";

import type { RepositorioDeEquiposOperativos } from "./configurar-equipos-operativos";
import type { EquipoOperativo } from "./configurar-equipos-operativos";
import type { CeldaDePlanSemanalEnBorrador, PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";
import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";
import { desplazarFecha } from "./semana";

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
        entradaProgramada: turnosPublicados.entradaProgramada,
        salidaProgramada: turnosPublicados.salidaProgramada,
        minutosDeAlmuerzo: turnosPublicados.minutosDeAlmuerzo,
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

  async publicar(turno: TurnoPublicado): Promise<void> {
    await this.publicarEnLote([turno]);
  }

  async publicarEnLote(turnos: TurnoPublicado[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const turno of turnos) {
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
        await tx.insert(historialDeTurnosPublicados).values({ turnoPublicadoId: turnoPublicado.id });
        await tx.insert(asistenciasEsperadas).values({ idHuellero: turno.idHuellero, fecha: turno.fecha, estado: "pendiente" });
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
        entradaProgramada: turnosPublicados.entradaProgramada,
        salidaProgramada: turnosPublicados.salidaProgramada,
        minutosDeAlmuerzo: turnosPublicados.minutosDeAlmuerzo,
        descanso: turnosPublicados.descanso,
      })
      .from(turnosPublicados)
      .where(and(inArray(turnosPublicados.idHuellero, idHuellero), gte(turnosPublicados.fecha, inicio), lte(turnosPublicados.fecha, fin)));
  }

  async listarColaboradoresActivos(): Promise<
    Array<{ idHuellero: string; nombre: string; sede: string; centroDeCosto: string }>
  > {
    return this.db
      .select({
        idHuellero: colaboradores.idHuellero,
        nombre: colaboradores.nombre,
        sede: colaboradores.sede,
        centroDeCosto: colaboradores.centroDeCosto,
      })
      .from(colaboradores)
      .where(eq(colaboradores.activo, true))
      .orderBy(colaboradores.nombre);
  }

  async listarColaboradoresActivosPorSede(sede: string): Promise<
    Array<{ idHuellero: string; nombre: string; centroDeCosto: string }>
  > {
    return this.db
      .select({
        idHuellero: colaboradores.idHuellero,
        nombre: colaboradores.nombre,
        centroDeCosto: colaboradores.centroDeCosto,
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
        entradaProgramada: turnosPublicados.entradaProgramada,
        salidaProgramada: turnosPublicados.salidaProgramada,
        minutosDeAlmuerzo: turnosPublicados.minutosDeAlmuerzo,
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
      entradaProgramada: turnosPublicados.entradaProgramada,
      salidaProgramada: turnosPublicados.salidaProgramada,
      minutosDeAlmuerzo: turnosPublicados.minutosDeAlmuerzo,
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
            entradaProgramada: celda.entradaProgramada,
            salidaProgramada: celda.salidaProgramada,
            minutosDeAlmuerzo: celda.minutosDeAlmuerzo,
            descanso: celda.descanso,
          },
        });
      }
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

  async listarHorariosPublicadosDelEquipoEnSemana(semana: string, equipo: EquipoOperativo): Promise<
    Array<Omit<CeldaDePlanSemanalEnBorrador, "planId">>
  > {
    return this.db.select({
      idHuellero: turnosPublicados.idHuellero,
      fecha: turnosPublicados.fecha,
      sede: turnosPublicados.sede,
      entradaProgramada: turnosPublicados.entradaProgramada,
      salidaProgramada: turnosPublicados.salidaProgramada,
      minutosDeAlmuerzo: turnosPublicados.minutosDeAlmuerzo,
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
      entradaProgramada: celdasDePlanesSemanalesEnBorrador.entradaProgramada,
      salidaProgramada: celdasDePlanesSemanalesEnBorrador.salidaProgramada,
      minutosDeAlmuerzo: celdasDePlanesSemanalesEnBorrador.minutosDeAlmuerzo,
      descanso: celdasDePlanesSemanalesEnBorrador.descanso,
    }).from(celdasDePlanesSemanalesEnBorrador).where(eq(celdasDePlanesSemanalesEnBorrador.planId, plan.id));
    return { ...plan, celdas };
  }
}
