import { randomUUID } from "node:crypto";

import { inArray, like } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";

type Db = NodePgDatabase<typeof schema>;

const PREFIJO_DE_CUENTA = "relacion-prueba-";

/** Pruebas de integración: deja al colaborador con una relación laboral ya confirmada por una cuenta de Recursos Humanos propia. */
export async function registrarRelacionConfirmadaDePrueba(
  db: Db,
  dni: string,
  { ingreso = "2020-01-01", cese = null }: { ingreso?: string; cese?: string | null } = {},
): Promise<void> {
  const [cuenta] = await db.insert(schema.cuentasLocales).values({
    nombreUsuario: `${PREFIJO_DE_CUENTA}${randomUUID()}`, hashContrasena: "no-usable", rol: "recursos_humanos",
  }).returning({ id: schema.cuentasLocales.id });
  const confirmadaEn = new Date();
  await db.insert(schema.relacionesLaborales).values({
    dni, ingreso, cese, registradaPorId: cuenta.id,
    ingresoConfirmadoPorId: cuenta.id, ingresoConfirmadoEn: confirmadaEn,
    ceseConfirmadoPorId: cese ? cuenta.id : null, ceseConfirmadoEn: cese ? confirmadaEn : null,
  });
}

/** Debe ejecutarse antes de borrar a los colaboradores: borra sus relaciones y las cuentas de prueba que las registraron. */
export async function eliminarRelacionesDePrueba(db: Db, dnis: string[]): Promise<void> {
  await db.delete(schema.relacionesLaborales).where(inArray(schema.relacionesLaborales.dni, dnis));
  await db.delete(schema.cuentasLocales).where(like(schema.cuentasLocales.nombreUsuario, `${PREFIJO_DE_CUENTA}%`));
}
