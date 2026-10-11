import { and, asc, desc, eq, gte, inArray, lt, lte, ne, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { TipoDeEstadoManual } from "@/asistencias/estado-manual";
import * as schema from "@/db/schema";
import { asistenciasEsperadas, descansosSemanalesAsignados, descansosSustitutorios, estadosManuales, feriados } from "@/db/schema";

import type { DescansoSustitutorio, RepositorioDeDescansosYFeriados, SustitutorioParaPagos } from "./gestionar-descansos-y-feriados";
import type { DescansoSemanalAsignado, Feriado } from "./reglas";

type Db = NodePgDatabase<typeof schema>;

const columnasDeSustitutorio = {
  id: descansosSustitutorios.id,
  dni: descansosSustitutorios.dni,
  origenFecha: descansosSustitutorios.origenFecha,
  origenTipo: descansosSustitutorios.origenTipo,
  fechaPrevista: descansosSustitutorios.fechaPrevista,
  estado: descansosSustitutorios.estado,
  verificadoPorId: descansosSustitutorios.verificadoPorId,
  verificadoEn: descansosSustitutorios.verificadoEn,
};

const columnasDeFeriado = { fecha: feriados.fecha, nombre: feriados.nombre, clase: feriados.clase };

export class RepositorioPostgresDeDescansosYFeriados implements RepositorioDeDescansosYFeriados {
  constructor(private readonly db: Db) {}

  async existeColaborador(dni: string): Promise<boolean> {
    const [fila] = await this.db.select({ id: schema.colaboradores.id }).from(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    return Boolean(fila);
  }

  async listarDescansosSemanales(dni: string): Promise<DescansoSemanalAsignado[]> {
    const filas = await this.db.select({ dni: descansosSemanalesAsignados.dni, diaSemana: descansosSemanalesAsignados.diaSemana, vigenteDesde: descansosSemanalesAsignados.vigenteDesde })
      .from(descansosSemanalesAsignados).where(eq(descansosSemanalesAsignados.dni, dni)).orderBy(asc(descansosSemanalesAsignados.vigenteDesde));
    return filas.map(({ dni: persona, diaSemana, vigenteDesde }) => ({ dni: persona, diaDeLaSemana: diaSemana, vigenteDesde }));
  }

  async insertarDescansoSemanal({ dni, diaDeLaSemana, vigenteDesde, responsableId }: DescansoSemanalAsignado & { responsableId: string }): Promise<DescansoSemanalAsignado | undefined> {
    const [fila] = await this.db.insert(descansosSemanalesAsignados).values({ dni, diaSemana: diaDeLaSemana, vigenteDesde, registradoPorId: responsableId }).onConflictDoNothing().returning({ id: descansosSemanalesAsignados.id });
    return fila && { dni, diaDeLaSemana, vigenteDesde };
  }

  async buscarFeriado(fecha: string): Promise<Feriado | undefined> {
    const [fila] = await this.db.select(columnasDeFeriado).from(feriados).where(eq(feriados.fecha, fecha));
    return fila;
  }

  async listarFeriados(desde: string, hasta: string): Promise<Feriado[]> {
    return this.db.select(columnasDeFeriado).from(feriados).where(and(gte(feriados.fecha, desde), lte(feriados.fecha, hasta))).orderBy(asc(feriados.fecha));
  }

  async insertarFeriado({ responsableId, ...feriado }: Feriado & { responsableId: string }): Promise<Feriado | undefined> {
    const [fila] = await this.db.insert(feriados).values({ ...feriado, registradoPorId: responsableId }).onConflictDoNothing().returning(columnasDeFeriado);
    return fila;
  }

  async renombrarFeriado(fecha: string, nombre: string): Promise<boolean> {
    return (await this.db.update(feriados).set({ nombre }).where(eq(feriados.fecha, fecha)).returning({ fecha: feriados.fecha })).length > 0;
  }

  async quitarFeriado(fecha: string): Promise<boolean> {
    return (await this.db.delete(feriados).where(eq(feriados.fecha, fecha)).returning({ fecha: feriados.fecha })).length > 0;
  }

  async existeSustitutorioDeFeriado(fecha: string): Promise<boolean> {
    const [fila] = await this.db.select({ id: descansosSustitutorios.id }).from(descansosSustitutorios)
      .where(and(eq(descansosSustitutorios.origenFecha, fecha), ne(descansosSustitutorios.origenTipo, "descanso_semanal"))).limit(1);
    return Boolean(fila);
  }

  async buscarSustitutorio(id: string): Promise<DescansoSustitutorio | undefined> {
    const [fila] = await this.db.select(columnasDeSustitutorio).from(descansosSustitutorios).where(eq(descansosSustitutorios.id, id));
    return fila;
  }

  async listarSustitutorios(dni: string, desde: string, hasta: string): Promise<DescansoSustitutorio[]> {
    return this.db.select(columnasDeSustitutorio).from(descansosSustitutorios)
      .where(and(eq(descansosSustitutorios.dni, dni), gte(descansosSustitutorios.origenFecha, desde), lte(descansosSustitutorios.origenFecha, hasta)))
      .orderBy(asc(descansosSustitutorios.origenFecha));
  }

  async listarSustitutoriosParaPagos(desde: string, hasta: string): Promise<SustitutorioParaPagos[]> {
    const verificadoEnLima = sql<string | null>`(${descansosSustitutorios.verificadoEn} AT TIME ZONE 'America/Lima')::date::text`;
    return this.db.select({
      dni: descansosSustitutorios.dni, origenFecha: descansosSustitutorios.origenFecha, estado: descansosSustitutorios.estado, verificadoEnLima,
    }).from(descansosSustitutorios).where(or(
      and(gte(descansosSustitutorios.origenFecha, desde), lte(descansosSustitutorios.origenFecha, hasta)),
      and(eq(descansosSustitutorios.estado, "no_otorgado"), lt(descansosSustitutorios.origenFecha, desde),
        sql`${verificadoEnLima} BETWEEN ${desde} AND ${hasta}`),
    )).orderBy(asc(descansosSustitutorios.origenFecha), asc(descansosSustitutorios.dni));
  }

  async insertarSustitutorio({ responsableId, ...datos }: Pick<DescansoSustitutorio, "dni" | "origenFecha" | "origenTipo" | "fechaPrevista"> & { responsableId: string }): Promise<DescansoSustitutorio | undefined> {
    const [fila] = await this.db.insert(descansosSustitutorios).values({ ...datos, registradoPorId: responsableId }).onConflictDoNothing().returning(columnasDeSustitutorio);
    return fila;
  }

  async verificarSustitutorio(id: string, estado: "otorgado" | "no_otorgado", responsableId: string, verificadoEn: Date): Promise<boolean> {
    const filas = await this.db.update(descansosSustitutorios).set({ estado, verificadoPorId: responsableId, verificadoEn })
      .where(and(eq(descansosSustitutorios.id, id), eq(descansosSustitutorios.estado, "previsto"))).returning({ id: descansosSustitutorios.id });
    return filas.length > 0;
  }

  async asistenciasDelRango(dni: string, desde: string, hasta: string) {
    const filas = await this.db.select({ id: asistenciasEsperadas.id, fecha: asistenciasEsperadas.fecha, estado: asistenciasEsperadas.estado, minutosTrabajados: asistenciasEsperadas.minutosTrabajados })
      .from(asistenciasEsperadas).where(and(eq(asistenciasEsperadas.dni, dni), gte(asistenciasEsperadas.fecha, desde), lte(asistenciasEsperadas.fecha, hasta)));
    const manuales = filas.filter(({ estado }) => estado === "manual").map(({ id }) => id);
    const tipoManualPorAsistencia = new Map<string, TipoDeEstadoManual>();
    if (manuales.length) {
      const registros = await this.db.select({ asistenciaId: estadosManuales.asistenciaId, tipo: estadosManuales.tipo }).from(estadosManuales)
        .where(inArray(estadosManuales.asistenciaId, manuales)).orderBy(desc(estadosManuales.registradoEn));
      for (const { asistenciaId, tipo } of registros) if (!tipoManualPorAsistencia.has(asistenciaId)) tipoManualPorAsistencia.set(asistenciaId, tipo);
    }
    return filas.map(({ id, fecha, estado, minutosTrabajados }) => ({ fecha, estado, minutosTrabajados, tipoManual: tipoManualPorAsistencia.get(id) ?? null }));
  }
}
