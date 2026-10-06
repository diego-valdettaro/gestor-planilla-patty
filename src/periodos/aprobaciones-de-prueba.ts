import { and, eq, inArray, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";

type Db = NodePgDatabase<typeof schema>;

/**
 * Pruebas de integración: deja aprobados (fila vigente) todos los grupos que gestionan asistencia, salvo los indicados.
 * El cierre exige la aprobación de todos los grupos de la base, también los que crearon otras pruebas.
 */
export async function aprobarGruposQueGestionanAsistenciaDePrueba(
  db: Db,
  periodoId: string,
  cuentaId: string,
  { excepto = [] }: { excepto?: string[] } = {},
): Promise<void> {
  const requeridos = (await db.select({ nombre: schema.grupos.nombre }).from(schema.grupos).where(eq(schema.grupos.gestionaAsistencia, true)))
    .map(({ nombre }) => nombre).filter((nombre) => !excepto.includes(nombre));
  if (!requeridos.length) return;
  const yaAprobados = new Set((await db.select({ grupo: schema.aprobacionesDeAsistencia.grupo }).from(schema.aprobacionesDeAsistencia).where(and(
    eq(schema.aprobacionesDeAsistencia.periodoId, periodoId),
    inArray(schema.aprobacionesDeAsistencia.grupo, requeridos),
    isNull(schema.aprobacionesDeAsistencia.invalidadaEn),
  ))).map(({ grupo }) => grupo));
  const faltantes = requeridos.filter((grupo) => !yaAprobados.has(grupo));
  if (faltantes.length) {
    await db.insert(schema.aprobacionesDeAsistencia).values(faltantes.map((grupo) => ({ periodoId, grupo, aprobadaPorId: cuentaId, aprobadaEn: new Date() })));
  }
}

/** Debe ejecutarse antes de borrar períodos, grupos o cuentas: borra todas las aprobaciones (vigentes o invalidadas) de esos períodos. */
export async function eliminarAprobacionesDePrueba(db: Db, periodoIds: string[]): Promise<void> {
  if (!periodoIds.length) return;
  await db.delete(schema.aprobacionesDeAsistencia).where(inArray(schema.aprobacionesDeAsistencia.periodoId, periodoIds));
}
