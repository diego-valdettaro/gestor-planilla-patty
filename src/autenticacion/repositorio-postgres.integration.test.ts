import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { asignarGerenteAGrupo, crearCuenta, quitarGerenteDeGrupo } from "./gestionar-cuentas";
import type { Actor } from "./permisos";
import { RepositorioPostgresDeCuentas } from "./repositorio-postgres";
import { hashDelToken } from "./iniciar-sesion";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("cuentas, roles y gerentes por grupo en PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeCuentas(db);
  const sufijo = randomUUID().slice(0, 8);
  const grupoConAsistencia = `Grupo A ${sufijo}`;
  const grupoSinAsistencia = `Grupo B ${sufijo}`;
  const grupoLibre = `Grupo C ${sufijo}`;
  const finanzas: Actor = { id: randomUUID(), rol: "finanzas" };
  const hash = async (contrasena: string) => `hash:${contrasena}`;
  const usuarios = [`gerente-uno-${sufijo}`, `gerente-dos-${sufijo}`, `rrhh-${sufijo}`];

  afterAll(async () => {
    const cuentas = await db.select({ id: schema.cuentasLocales.id }).from(schema.cuentasLocales).where(inArray(schema.cuentasLocales.nombreUsuario, usuarios));
    const ids = cuentas.map(({ id }) => id);
    if (ids.length) {
      await db.delete(schema.gerentesDeGrupo).where(inArray(schema.gerentesDeGrupo.cuentaId, ids));
      await db.delete(schema.sesiones).where(inArray(schema.sesiones.cuentaId, ids));
      await db.delete(schema.cuentasLocales).where(inArray(schema.cuentasLocales.id, ids));
    }
    await db.delete(schema.grupos).where(inArray(schema.grupos.nombre, [grupoConAsistencia, grupoSinAsistencia, grupoLibre]));
    await pool.end();
  });

  it("crea cuentas de los nuevos roles y rechaza un rol que ya no existe", async () => {
    await db.insert(schema.grupos).values([
      { nombre: grupoConAsistencia },
      { nombre: grupoSinAsistencia, gestionaAsistencia: false },
      { nombre: grupoLibre },
    ]);

    await crearCuenta(repositorio, finanzas, { nombreUsuario: usuarios[0], contrasena: "clave-segura", rol: "gerente_de_area" }, hash);
    await crearCuenta(repositorio, finanzas, { nombreUsuario: usuarios[1], contrasena: "clave-segura", rol: "gerente_de_area" }, hash);
    await crearCuenta(repositorio, finanzas, { nombreUsuario: usuarios[2], contrasena: "clave-segura", rol: "recursos_humanos" }, hash);

    const cuenta = await repositorio.buscarPorNombreUsuario(usuarios[2]);
    expect(cuenta).toMatchObject({ nombreUsuario: usuarios[2], rol: "recursos_humanos" });
    await expect(pool.query("INSERT INTO cuentas_locales (nombre_usuario, hash_contrasena, rol) VALUES ($1, 'h', 'operaciones')", [`viejo-${sufijo}`]))
      .rejects.toThrow(/cuentas_locales_rol_valido/);
  });

  it("un gerente puede tener varios grupos y un grupo tiene a lo sumo un gerente", async () => {
    const [uno, dos] = await Promise.all(usuarios.slice(0, 2).map((usuario) => repositorio.buscarPorNombreUsuario(usuario)));

    await asignarGerenteAGrupo(repositorio, finanzas, grupoConAsistencia, uno!.id);
    await asignarGerenteAGrupo(repositorio, finanzas, grupoSinAsistencia, uno!.id);

    await expect(asignarGerenteAGrupo(repositorio, finanzas, grupoConAsistencia, dos!.id)).rejects.toThrow(`El grupo ${grupoConAsistencia} ya tiene gerente`);
    expect(await repositorio.asignarGerente(grupoConAsistencia, dos!.id)).toBe(false);
    const cuentas = await repositorio.listarCuentas();
    expect(cuentas.find((cuenta) => cuenta.id === uno!.id)?.grupos).toEqual([grupoConAsistencia, grupoSinAsistencia].sort());
    expect(cuentas.find((cuenta) => cuenta.id === dos!.id)?.grupos).toEqual([]);
  });

  it("solo asigna grupos a cuentas de gerente de área", async () => {
    const rrhh = await repositorio.buscarPorNombreUsuario(usuarios[2]);

    await expect(asignarGerenteAGrupo(repositorio, finanzas, grupoLibre, rrhh!.id)).rejects.toThrow("Solo se puede asignar grupos a una cuenta de gerente de área.");
    expect(await repositorio.buscarGerenteDelGrupo(grupoLibre)).toBeUndefined();
  });

  it("la sesión del gerente carga sus grupos con el atributo de gestión de asistencia; los demás roles no cargan grupos", async () => {
    const uno = await repositorio.buscarPorNombreUsuario(usuarios[0]);
    const rrhh = await repositorio.buscarPorNombreUsuario(usuarios[2]);
    const venceEn = new Date(Date.now() + 60_000);
    await repositorio.guardarSesion({ cuentaId: uno!.id, tokenHash: hashDelToken(`token-${sufijo}-1`), venceEn });
    await repositorio.guardarSesion({ cuentaId: rrhh!.id, tokenHash: hashDelToken(`token-${sufijo}-2`), venceEn });

    const gerente = await repositorio.buscarActorPorTokenHash(hashDelToken(`token-${sufijo}-1`), new Date());
    const personal = await repositorio.buscarActorPorTokenHash(hashDelToken(`token-${sufijo}-2`), new Date());

    expect(gerente).toMatchObject({ id: uno!.id, rol: "gerente_de_area" });
    expect(gerente?.grupos).toEqual([
      { nombre: grupoConAsistencia, gestionaAsistencia: true },
      { nombre: grupoSinAsistencia, gestionaAsistencia: false },
    ]);
    expect(personal).toMatchObject({ id: rrhh!.id, rol: "recursos_humanos", grupos: [] });
  });

  it("al cambiar el atributo del grupo, la siguiente sesión lo refleja sin reiniciar sesión", async () => {
    await db.update(schema.grupos).set({ gestionaAsistencia: false }).where(eq(schema.grupos.nombre, grupoConAsistencia));

    const gerente = await repositorio.buscarActorPorTokenHash(hashDelToken(`token-${sufijo}-1`), new Date());

    expect(gerente?.grupos?.find(({ nombre }) => nombre === grupoConAsistencia)?.gestionaAsistencia).toBe(false);
  });

  it("Finanzas quita el gerente de un grupo y el grupo queda libre", async () => {
    await quitarGerenteDeGrupo(repositorio, finanzas, grupoSinAsistencia);

    expect(await repositorio.buscarGerenteDelGrupo(grupoSinAsistencia)).toBeUndefined();
    const grupos = await repositorio.listarGruposConGerente();
    expect(grupos.find((grupo) => grupo.nombre === grupoSinAsistencia)).toMatchObject({ gestionaAsistencia: false, gerenteId: null });
  });
});
