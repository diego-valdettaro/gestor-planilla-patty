import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));

import * as schema from "@/db/schema";

import { crearGrupoDeConfiguracion } from "./actions";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para integración PostgreSQL.");

describe.skipIf(!databaseUrl)("G15 acción y persistencia de gestión al crear un grupo", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });

  afterAll(async () => pool.end());
  beforeEach(() => simulacro.actor.mockResolvedValue({ id: "admin-g15", rol: "administrador" }));

  it.each([{ gestiona: true }, { gestiona: false }])("persiste gestionaAsistencia=$gestiona desde la acción", async ({ gestiona }) => {
    const nombre = `G15 ${randomUUID()}`;
    const formData = new FormData();
    formData.set("nombre", nombre);
    formData.set("gestiona", String(gestiona));
    try {
      await expect(crearGrupoDeConfiguracion({}, formData)).resolves.toEqual({ listo: true });
      const [grupo] = await db.select({ gestionaAsistencia: schema.grupos.gestionaAsistencia })
        .from(schema.grupos).where(eq(schema.grupos.nombre, nombre));
      expect(grupo?.gestionaAsistencia).toBe(gestiona);
    } finally {
      await db.delete(schema.grupos).where(eq(schema.grupos.nombre, nombre));
    }
  });
});
