import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { leerMigraciones } from "../../scripts/migrar-base";

const directorios: string[] = [];

afterEach(async () => { await Promise.all(directorios.splice(0).map((directorio) => rm(directorio, { recursive: true, force: true }))); });

describe("leerMigraciones", () => {
  it("ordena solo los archivos SQL versionados y calcula su checksum", async () => {
    const directorio = await mkdtemp(path.join(os.tmpdir(), "planilla-migraciones-"));
    directorios.push(directorio);
    await writeFile(path.join(directorio, "0010_segunda.sql"), "SELECT 2;");
    await writeFile(path.join(directorio, "0009_primera.sql"), "SELECT 1;");
    await writeFile(path.join(directorio, "notas.sql"), "SELECT 3;");

    const migraciones = await leerMigraciones(directorio);

    expect(migraciones.map(({ archivo }) => archivo)).toEqual(["0009_primera.sql", "0010_segunda.sql"]);
    expect(migraciones[0].checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(migraciones[0].checksum).not.toBe(migraciones[1].checksum);
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// Reproduce, contra una base descartable propia, el escenario que el criterio de
// aceptación de la issue #61 exige: una migración que aplica sobre datos reales no
// debe dejar un colaborador con `grupo` nulo. Se arma la base hasta la migración
// anterior a mano (no hay caso de uso para "sede sin grupo"), se inserta el dato
// inválido y se comprueba que la migración objetivo rechaza aplicarse.
describe.skipIf(!databaseUrl)("migración 0021_grupo_directo_de_colaborador", () => {
  const nombreDeLaBase = `planilla_migracion_0021_${randomUUID().replace(/-/g, "_")}`;
  const adminPool = new Pool({ connectionString: databaseUrl });
  let urlDeLaBasePrueba: string;

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE "${nombreDeLaBase}"`);
    const url = new URL(databaseUrl!);
    url.pathname = `/${nombreDeLaBase}`;
    urlDeLaBasePrueba = url.toString();
  });

  afterAll(async () => {
    await adminPool.query(`DROP DATABASE IF EXISTS "${nombreDeLaBase}"`);
    await adminPool.end();
  });

  it("falla si un colaborador queda con una sede que no pertenece a un grupo", async () => {
    const migraciones = await leerMigraciones();
    const previas = migraciones.filter((migracion) => migracion.archivo < "0021_grupo_directo_de_colaborador.sql");
    const objetivo = migraciones.find((migracion) => migracion.archivo === "0021_grupo_directo_de_colaborador.sql");
    if (!objetivo) throw new Error("No se encontró la migración 0021_grupo_directo_de_colaborador.sql.");

    const pool = new Pool({ connectionString: urlDeLaBasePrueba });
    try {
      for (const migracion of previas) await pool.query(migracion.contenido);
      await pool.query("INSERT INTO sedes (nombre, activa, grupo) VALUES ('Sede sin grupo', true, NULL)");
      await pool.query("INSERT INTO colaboradores (id_huellero, nombre, sede, activo) VALUES ('HU-SIN-GRUPO', 'Prueba', 'Sede sin grupo', true)");

      await expect(pool.query(objetivo.contenido)).rejects.toThrow(/column "grupo".*(null|contains null)/i);
    } finally {
      await pool.end();
    }
  });
});

// El identificador del colaborador pasa de «id_huellero» a «dni» (issue #107, ADR 0010).
describe.skipIf(!databaseUrl)("migración 0026_identificar_colaboradores_por_dni", () => {
  const nombreDeLaBase = `planilla_migracion_0026_${randomUUID().replace(/-/g, "_")}`;
  const adminPool = new Pool({ connectionString: databaseUrl });
  let pool: Pool;

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE "${nombreDeLaBase}"`);
    const url = new URL(databaseUrl!);
    url.pathname = `/${nombreDeLaBase}`;
    pool = new Pool({ connectionString: url.toString() });
    const migraciones = await leerMigraciones();
    for (const migracion of migraciones.filter(({ archivo }) => archivo < "0026_identificar_colaboradores_por_dni.sql")) {
      await pool.query(migracion.contenido);
    }
    await pool.query("INSERT INTO grupos (nombre) VALUES ('Grupo 0026')");
    await pool.query("INSERT INTO sedes (nombre, activa, grupo) VALUES ('Sede 0026', true, 'Grupo 0026')");
    await pool.query("INSERT INTO colaboradores (id_huellero, nombre, sede, grupo, activo) VALUES ('HU-LEGADO', 'Legado', 'Sede 0026', 'Grupo 0026', true)");
    await pool.query("INSERT INTO turnos_publicados (id_huellero, fecha, sede, grupo, entrada_programada, salida_programada, descanso) VALUES ('HU-LEGADO', '2026-09-01', 'Sede 0026', 'Grupo 0026', '09:00', '18:00', false)");
    await pool.query("CREATE TABLE instantanea_0026 (datos jsonb NOT NULL)");
    await pool.query(`INSERT INTO instantanea_0026 VALUES ('{"filas":[{"idHuellero":"HU-LEGADO","otro":1}]}')`);
    const migracion = migraciones.find(({ archivo }) => archivo === "0026_identificar_colaboradores_por_dni.sql");
    await pool.query(migracion!.contenido);
  });

  afterAll(async () => {
    await pool.end();
    await adminPool.query(`DROP DATABASE IF EXISTS "${nombreDeLaBase}"`);
    await adminPool.end();
  });

  it("renombra la columna en colaboradores y en las tablas que la referencian sin perder filas", async () => {
    const colaboradores = await pool.query("SELECT dni FROM colaboradores");
    const turnos = await pool.query("SELECT dni FROM turnos_publicados");
    const restantes = await pool.query("SELECT 1 FROM information_schema.columns WHERE column_name = 'id_huellero'");

    expect(colaboradores.rows).toEqual([{ dni: "HU-LEGADO" }]);
    expect(turnos.rows).toEqual([{ dni: "HU-LEGADO" }]);
    expect(restantes.rowCount).toBe(0);
  });

  it("reescribe la clave idHuellero de las instantáneas JSON a dni", async () => {
    const { rows } = await pool.query("SELECT datos FROM instantanea_0026");

    expect(rows[0].datos).toEqual({ filas: [{ dni: "HU-LEGADO", otro: 1 }] });
  });

  it("conserva el DNI único y exige 8 dígitos solo a filas nuevas o modificadas", async () => {
    const insertar = (dni: string) => pool.query("INSERT INTO colaboradores (dni, nombre, sede, grupo, activo) VALUES ($1, 'Prueba', 'Sede 0026', 'Grupo 0026', true)", [dni]);

    await insertar("12345678");
    await expect(insertar("12345678")).rejects.toThrow(/duplicate key|unique/i);
    await expect(insertar("1234")).rejects.toThrow(/colaboradores_dni_ocho_digitos/);
  });
});

// ADR 0012: roles administrador / gerente_de_area / recursos_humanos / finanzas (issue #108).
describe.skipIf(!databaseUrl)("migración 0028_roles_de_cuenta_y_gerentes_por_grupo", () => {
  const nombreDeLaBase = `planilla_migracion_0028_${randomUUID().replace(/-/g, "_")}`;
  const adminPool = new Pool({ connectionString: databaseUrl });
  let pool: Pool;

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE "${nombreDeLaBase}"`);
    const url = new URL(databaseUrl!);
    url.pathname = `/${nombreDeLaBase}`;
    pool = new Pool({ connectionString: url.toString() });
    const migraciones = await leerMigraciones();
    for (const migracion of migraciones.filter(({ archivo }) => archivo < "0028_roles_de_cuenta_y_gerentes_por_grupo.sql")) {
      await pool.query(migracion.contenido);
    }
    await pool.query("INSERT INTO cuentas_locales (nombre_usuario, hash_contrasena, rol) VALUES ('admin-viejo', 'h', 'administracion'), ('ops-viejo', 'h', 'operaciones'), ('fin-viejo', 'h', 'finanzas')");
    await pool.query("INSERT INTO grupos (nombre) VALUES ('Administración')");
    const sesion = await pool.query("SELECT id FROM cuentas_locales WHERE nombre_usuario = 'ops-viejo'");
    await pool.query("INSERT INTO sesiones (cuenta_id, token_hash, vence_en) VALUES ($1, 'token-viejo', now() + interval '1 day')", [sesion.rows[0].id]);
    const migracion = migraciones.find(({ archivo }) => archivo === "0028_roles_de_cuenta_y_gerentes_por_grupo.sql");
    await pool.query(migracion!.contenido);
  });

  afterAll(async () => {
    await pool.end();
    await adminPool.query(`DROP DATABASE IF EXISTS "${nombreDeLaBase}"`);
    await adminPool.end();
  });

  it("aplica la regla: administracion -> administrador, operaciones -> gerente_de_area, finanzas sin cambio", async () => {
    const { rows } = await pool.query("SELECT nombre_usuario, rol FROM cuentas_locales ORDER BY nombre_usuario");

    expect(rows).toEqual([
      { nombre_usuario: "admin-viejo", rol: "administrador" },
      { nombre_usuario: "fin-viejo", rol: "finanzas" },
      { nombre_usuario: "ops-viejo", rol: "gerente_de_area" },
    ]);
  });

  it("deja a los gerentes migrados sin grupos asignados y conserva sus sesiones", async () => {
    const asignaciones = await pool.query("SELECT 1 FROM gerentes_de_grupo");
    const sesiones = await pool.query("SELECT 1 FROM sesiones");

    expect(asignaciones.rowCount).toBe(0);
    expect(sesiones.rowCount).toBe(1);
  });

  it("marca el grupo Administración como no gestor de asistencia y deja los demás como gestores", async () => {
    await pool.query("INSERT INTO grupos (nombre) VALUES ('Taller nuevo')");

    const { rows } = await pool.query("SELECT nombre, gestiona_asistencia FROM grupos WHERE nombre IN ('Administración', 'Taller nuevo', 'Tiendas') ORDER BY nombre");

    expect(rows).toEqual([
      { nombre: "Administración", gestiona_asistencia: false },
      { nombre: "Taller nuevo", gestiona_asistencia: true },
      { nombre: "Tiendas", gestiona_asistencia: true },
    ]);
  });

  it("rechaza roles fuera del modelo y un segundo gerente para el mismo grupo", async () => {
    await expect(pool.query("INSERT INTO cuentas_locales (nombre_usuario, hash_contrasena, rol) VALUES ('x', 'h', 'operaciones')")).rejects.toThrow(/cuentas_locales_rol_valido/);
    const cuentas = await pool.query("SELECT id FROM cuentas_locales WHERE rol = 'gerente_de_area'");
    await pool.query("INSERT INTO cuentas_locales (nombre_usuario, hash_contrasena, rol) VALUES ('ger-2', 'h', 'gerente_de_area')");
    const segunda = await pool.query("SELECT id FROM cuentas_locales WHERE nombre_usuario = 'ger-2'");
    await pool.query("INSERT INTO gerentes_de_grupo (grupo, cuenta_id) VALUES ('Taller nuevo', $1)", [cuentas.rows[0].id]);

    await expect(pool.query("INSERT INTO gerentes_de_grupo (grupo, cuenta_id) VALUES ('Taller nuevo', $1)", [segunda.rows[0].id])).rejects.toThrow(/duplicate key|unique|pkey/i);
    await pool.query("INSERT INTO gerentes_de_grupo (grupo, cuenta_id) VALUES ('Administración', $1)", [cuentas.rows[0].id]);
  });
});
