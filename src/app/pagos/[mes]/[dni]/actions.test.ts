import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { RepositorioPostgresDeClasificacionesDeGoce } from "@/clasificaciones-de-goce/repositorio-postgres";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import * as schema from "@/db/schema";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), revalidar: vi.fn(), repositorio: undefined as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: simulacro.revalidar }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/clasificaciones-de-goce/servicio", () => ({
  get repositorioDeClasificacionesDeGoce() { return simulacro.repositorio; },
}));

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.set(campo, valor);
  return datos;
}

// Año 2094 para no cruzarse con otras pruebas de integración que comparten base.
describe.skipIf(!databaseUrl)("acción de clasificar goce (borde del servidor)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const sufijo = randomUUID().slice(0, 8);
  const grupo = `Grupo goce acción ${sufijo}`;
  const sede = `Sede goce acción ${sufijo}`;
  const dni = dniDePrueba();
  const finanzasId = randomUUID();
  const finanzas = { id: finanzasId, rol: "finanzas" };
  const filas = () => db.select().from(schema.clasificacionesDeGoce).where(eq(schema.clasificacionesDeGoce.dni, dni));
  const accion = async () => (await import("./actions")).clasificarGoceDesdeFormulario;
  const enviar = async (campos: Record<string, string> = {}) =>
    (await accion())({}, formulario({ dni, fecha: "2094-10-06", goce: "sin_goce", ...campos }));

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values({ id: finanzasId, nombreUsuario: `finanzas-accion-${sufijo}`, hashContrasena: "prueba", rol: "finanzas" });
    await db.insert(schema.grupos).values({ nombre: grupo, gestionaAsistencia: false });
    await db.insert(schema.sedes).values({ nombre: sede, grupo });
    await db.insert(schema.colaboradores).values({ dni, nombre: "Persona con permiso", grupo, sede });
    simulacro.repositorio = new RepositorioPostgresDeClasificacionesDeGoce(db);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.delete(schema.clasificacionesDeGoce).where(eq(schema.clasificacionesDeGoce.dni, dni));
  });

  afterAll(async () => {
    await db.delete(schema.clasificacionesDeGoce).where(eq(schema.clasificacionesDeGoce.dni, dni));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, finanzasId));
    await pool.end();
  });

  it("AC-01 Finanzas guarda la clasificación de una jornada y se refresca el detalle de la persona", async () => {
    simulacro.actor.mockResolvedValue(finanzas);

    expect(await enviar()).toEqual({ listo: 1 });
    expect(await filas()).toMatchObject([{ dni, fecha: "2094-10-06", conGoce: false, clasificadoPorId: finanzasId }]);
    expect(simulacro.revalidar).toHaveBeenCalledWith("/pagos/[mes]/[dni]", "page");
  });

  it("AC-02 sin elegir con o sin goce devuelve el error junto al formulario y no guarda nada", async () => {
    simulacro.actor.mockResolvedValue(finanzas);

    const estado = await enviar({ goce: "" });
    expect(estado).toEqual({ error: expect.stringMatching(/^Falta .*goce/) });
    expect(await filas()).toEqual([]);
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it.each([
    ["el Administrador del sistema", { id: "adm-1", rol: "administrador" }],
    ["Recursos Humanos", { id: "rrhh-1", rol: "recursos_humanos" }],
    ["un gerente de área", { id: "ger-1", rol: "gerente_de_area", grupos: [{ nombre: "Taller", gestionaAsistencia: true }] }],
  ])("AC-03 %s no puede clasificar: el servidor responde sin permiso y no cambia nada", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);

    expect(await enviar()).toEqual({ error: "No tiene permiso para consultar ni editar Pagos." });
    expect(await filas()).toEqual([]);
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it.each([
    ["una fecha con mes y día imposibles", { fecha: "2094-13-45" }],
    ["un 30 de febrero", { fecha: "2094-02-30" }],
    ["un DNI que no tiene 8 dígitos", { dni: "123" }],
  ])("AC-04 %s devuelve el error junto al formulario y no guarda ni refresca", async (_nombre, campos) => {
    simulacro.actor.mockResolvedValue(finanzas);

    expect(await enviar(campos)).toEqual({ error: expect.any(String) });
    expect(await filas()).toEqual([]);
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });
});
