import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import {
  asistenciasEsperadas,
  colaboradores,
  historialDeTurnosPublicados,
  periodosPlanilla,
  sedes,
  turnosPublicados,
} from "@/db/schema";

import type { RepositorioDeEquiposOperativos } from "./configurar-equipos-operativos";
import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";

export class RepositorioPostgresDeTurnos implements RepositorioDeTurnos, RepositorioDeEquiposOperativos {
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
    await this.db.transaction(async (tx) => {
      const [turnoPublicado] = await tx
        .insert(turnosPublicados)
        .values(turno)
        .returning({ id: turnosPublicados.id });

      await tx.insert(historialDeTurnosPublicados).values({
        turnoPublicadoId: turnoPublicado.id,
      });
      await tx.insert(asistenciasEsperadas).values({
        idHuellero: turno.idHuellero,
        fecha: turno.fecha,
        estado: "pendiente",
      });
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
}
