import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";

import { crearRepositorioEnMemoria as crearRepositorio, ANA, BETO } from "./repositorio-en-memoria";
import {
  confirmarCese,
  confirmarIngreso,
  consultarPersonasConRelacionVigente,
  corregirIngreso,
  listarRelacionesLaborales,
  registrarCese,
  registrarIngreso,
} from "./gestionar-relaciones-laborales";

const recursosHumanos: Actor = { id: "rrhh-1", rol: "recursos_humanos" };
const administrador: Actor = { id: "admin-1", rol: "administrador" };
const finanzas: Actor = { id: "fin-1", rol: "finanzas" };
const gerente: Actor = { id: "ger-1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] };

describe("registrar y confirmar relaciones laborales", () => {
  let contexto: ReturnType<typeof crearRepositorio>;
  beforeEach(() => { contexto = crearRepositorio(); });

  it("Recursos Humanos registra un ingreso que queda sin confirmar hasta que lo confirma", async () => {
    const relacion = await registrarIngreso(contexto.repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-03-02" });

    expect(relacion).toMatchObject({ dni: ANA, ingreso: "2026-03-02", cese: null, ingresoConfirmado: false });
    await confirmarIngreso(contexto.repositorio, recursosHumanos, relacion.id);
    expect(contexto.relaciones[0].ingresoConfirmado).toBe(true);
  });

  it("el ingreso se corrige solo mientras no esté confirmado", async () => {
    const relacion = await registrarIngreso(contexto.repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-03-02" });
    await corregirIngreso(contexto.repositorio, recursosHumanos, relacion.id, "2026-03-09");
    expect(contexto.relaciones[0].ingreso).toBe("2026-03-09");

    await confirmarIngreso(contexto.repositorio, recursosHumanos, relacion.id);

    await expect(corregirIngreso(contexto.repositorio, recursosHumanos, relacion.id, "2026-03-10")).rejects.toThrow("ya está confirmado");
    await expect(confirmarIngreso(contexto.repositorio, recursosHumanos, relacion.id)).rejects.toThrow("ya está confirmado");
  });

  it("exige un colaborador existente, un DNI válido y fechas reales", async () => {
    await expect(registrarIngreso(contexto.repositorio, recursosHumanos, { dni: "11112222", ingreso: "2026-03-02" })).rejects.toThrow("gerente de su grupo debe darlo de alta");
    await expect(registrarIngreso(contexto.repositorio, recursosHumanos, { dni: "123", ingreso: "2026-03-02" })).rejects.toThrow("8 dígitos");
    await expect(registrarIngreso(contexto.repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-02-30" })).rejects.toThrow("fecha de ingreso no es válida");
    await expect(registrarIngreso(contexto.repositorio, recursosHumanos, { dni: ANA, ingreso: "02/03/2026" })).rejects.toThrow("fecha de ingreso no es válida");
    expect(contexto.relaciones).toEqual([]);
  });

  it("el cese exige el ingreso confirmado, no precede al ingreso y solo se confirma si está registrado", async () => {
    const relacion = await registrarIngreso(contexto.repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-03-02" });

    await expect(registrarCese(contexto.repositorio, recursosHumanos, relacion.id, "2026-06-30")).rejects.toThrow("Confirme el ingreso antes");
    await confirmarIngreso(contexto.repositorio, recursosHumanos, relacion.id);
    await expect(confirmarCese(contexto.repositorio, recursosHumanos, relacion.id)).rejects.toThrow("Registre la fecha de cese");
    await expect(registrarCese(contexto.repositorio, recursosHumanos, relacion.id, "2026-03-01")).rejects.toThrow("no puede ser anterior al ingreso");

    await registrarCese(contexto.repositorio, recursosHumanos, relacion.id, "2026-06-30");
    await registrarCese(contexto.repositorio, recursosHumanos, relacion.id, "2026-07-03");
    expect(contexto.relaciones[0].cese).toBe("2026-07-03");
    await confirmarCese(contexto.repositorio, recursosHumanos, relacion.id);

    await expect(registrarCese(contexto.repositorio, recursosHumanos, relacion.id, "2026-07-10")).rejects.toThrow("ya está confirmado");
    await expect(confirmarCese(contexto.repositorio, recursosHumanos, relacion.id)).rejects.toThrow("ya está confirmado");
  });

  it("un reingreso con el mismo DNI crea otra relación laboral sin duplicar a la persona", async () => {
    const primera = await registrarIngreso(contexto.repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-03-02" });
    await confirmarIngreso(contexto.repositorio, recursosHumanos, primera.id);
    await registrarCese(contexto.repositorio, recursosHumanos, primera.id, "2026-06-30");
    await confirmarCese(contexto.repositorio, recursosHumanos, primera.id);

    const segunda = await registrarIngreso(contexto.repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-09-09" });

    expect(segunda.id).not.toBe(primera.id);
    expect(contexto.relaciones.map(({ dni, ingreso }) => ({ dni, ingreso }))).toEqual([{ dni: ANA, ingreso: "2026-03-02" }, { dni: ANA, ingreso: "2026-09-09" }]);
  });

  it("no admite otra relación mientras la anterior no tenga cese ni fechas que se solapen", async () => {
    const primera = await registrarIngreso(contexto.repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-03-02" });
    await expect(registrarIngreso(contexto.repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-09-09" })).rejects.toThrow("ya tiene una relación laboral sin cese");

    await confirmarIngreso(contexto.repositorio, recursosHumanos, primera.id);
    await registrarCese(contexto.repositorio, recursosHumanos, primera.id, "2026-06-30");

    await expect(registrarIngreso(contexto.repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-06-30" })).rejects.toThrow("posterior al cese anterior");
    await expect(registrarIngreso(contexto.repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-01-01" })).rejects.toThrow("se solapan");
    await registrarIngreso(contexto.repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-07-01" });
  });

  it("un cese no puede cruzar el ingreso de una relación posterior", async () => {
    const primera = await registrarIngreso(contexto.repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-03-02" });
    await confirmarIngreso(contexto.repositorio, recursosHumanos, primera.id);
    await registrarCese(contexto.repositorio, recursosHumanos, primera.id, "2026-06-30");
    await registrarIngreso(contexto.repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-09-09" });

    await expect(registrarCese(contexto.repositorio, recursosHumanos, primera.id, "2026-09-10")).rejects.toThrow("se solapan");
    await expect(corregirIngreso(contexto.repositorio, recursosHumanos, contexto.relaciones[1].id, "2026-06-15")).rejects.toThrow("se solapan");
  });

  it("falla con un mensaje claro si la relación no existe", async () => {
    await expect(confirmarIngreso(contexto.repositorio, recursosHumanos, randomUUID())).rejects.toThrow("No existe esa relación laboral");
  });
});

describe("permisos de relaciones laborales", () => {
  it.each([["Recursos Humanos", recursosHumanos], ["el Administrador", administrador]])("%s puede registrar y confirmar", async (_nombre, actor) => {
    const { repositorio } = crearRepositorio();
    const relacion = await registrarIngreso(repositorio, actor, { dni: ANA, ingreso: "2026-03-02" });
    await expect(confirmarIngreso(repositorio, actor, relacion.id)).resolves.toBeUndefined();
  });

  it.each([["Finanzas", finanzas], ["un gerente de área", gerente]])("%s no puede registrar ni confirmar", async (_nombre, actor) => {
    const { repositorio, relaciones } = crearRepositorio();
    const relacion = await registrarIngreso(repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-03-02" });

    await expect(registrarIngreso(repositorio, actor, { dni: BETO, ingreso: "2026-03-02" })).rejects.toThrow("No tiene permiso");
    await expect(corregirIngreso(repositorio, actor, relacion.id, "2026-03-03")).rejects.toThrow("No tiene permiso");
    await expect(confirmarIngreso(repositorio, actor, relacion.id)).rejects.toThrow("No tiene permiso");
    await expect(registrarCese(repositorio, actor, relacion.id, "2026-06-30")).rejects.toThrow("No tiene permiso");
    await expect(confirmarCese(repositorio, actor, relacion.id)).rejects.toThrow("No tiene permiso");
    expect(relaciones).toHaveLength(1);
    expect(relaciones[0]).toMatchObject({ ingreso: "2026-03-02", ingresoConfirmado: false });
  });

  it("Finanzas consulta en solo lectura; un gerente de área no consulta", async () => {
    const { repositorio } = crearRepositorio();
    await registrarIngreso(repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-03-02" });

    await expect(listarRelacionesLaborales(repositorio, finanzas)).resolves.toHaveLength(1);
    await expect(consultarPersonasConRelacionVigente(repositorio, finanzas, "2026-04-01")).resolves.toEqual([]);
    await expect(listarRelacionesLaborales(repositorio, gerente)).rejects.toThrow("No tiene permiso");
    await expect(consultarPersonasConRelacionVigente(repositorio, gerente, "2026-04-01")).rejects.toThrow("No tiene permiso");
  });
});

describe("personas con relación laboral vigente", () => {
  async function conRelaciones() {
    const contexto = crearRepositorio();
    const { repositorio } = contexto;
    // Ana: relación confirmada, cesó el 30/06 y reingresó el 09/09. Beto: ingreso sin confirmar.
    const ana1 = await registrarIngreso(repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-03-02" });
    await confirmarIngreso(repositorio, recursosHumanos, ana1.id);
    await registrarCese(repositorio, recursosHumanos, ana1.id, "2026-06-30");
    await confirmarCese(repositorio, recursosHumanos, ana1.id);
    const ana2 = await registrarIngreso(repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-09-09" });
    await confirmarIngreso(repositorio, recursosHumanos, ana2.id);
    await registrarIngreso(repositorio, recursosHumanos, { dni: BETO, ingreso: "2026-01-05" });
    return contexto;
  }

  it("lista a quien tiene una relación confirmada en una fecha, sin tocar asistencias", async () => {
    const { repositorio } = await conRelaciones();

    expect((await consultarPersonasConRelacionVigente(repositorio, finanzas, "2026-05-15")).map(({ dni }) => dni)).toEqual([ANA]);
    expect(await consultarPersonasConRelacionVigente(repositorio, finanzas, "2026-07-15")).toEqual([]);
    expect(await consultarPersonasConRelacionVigente(repositorio, finanzas, "2026-10-01")).toEqual([
      { dni: ANA, nombre: "Ana Pérez", grupo: "Tiendas", relaciones: [{ relacionId: expect.any(String), ingreso: "2026-09-09", cese: null }] },
    ]);
  });

  it("en un rango incluye a quien estuvo vigente al menos un día, con cada relación", async () => {
    const { repositorio } = await conRelaciones();

    const resultado = await consultarPersonasConRelacionVigente(repositorio, finanzas, "2026-06-25", "2026-09-15");

    // Una sola fila para Ana aunque el rango abarque su reingreso.
    expect(resultado).toHaveLength(1);
    expect(resultado[0].relaciones.map(({ ingreso, cese }) => ({ ingreso, cese }))).toEqual([{ ingreso: "2026-03-02", cese: "2026-06-30" }, { ingreso: "2026-09-09", cese: null }]);
    expect(await consultarPersonasConRelacionVigente(repositorio, finanzas, "2026-07-01", "2026-09-08")).toEqual([]);
  });

  it("un cese sin confirmar no corta la vigencia y el ingreso sin confirmar no la abre", async () => {
    const { repositorio, relaciones } = await conRelaciones();
    const beto = relaciones.find(({ dni }) => dni === BETO)!;
    expect((await consultarPersonasConRelacionVigente(repositorio, finanzas, "2026-02-01")).map(({ dni }) => dni)).toEqual([]);

    await confirmarIngreso(repositorio, recursosHumanos, beto.id);
    await registrarCese(repositorio, recursosHumanos, beto.id, "2026-02-27");

    expect((await consultarPersonasConRelacionVigente(repositorio, finanzas, "2026-03-15")).map(({ dni }) => dni).sort()).toEqual([ANA, BETO]);
    await confirmarCese(repositorio, recursosHumanos, beto.id);
    expect((await consultarPersonasConRelacionVigente(repositorio, finanzas, "2026-03-15")).map(({ dni }) => dni)).toEqual([ANA]);
  });

  it("valida las fechas de la consulta", async () => {
    const { repositorio } = crearRepositorio();
    await expect(consultarPersonasConRelacionVigente(repositorio, finanzas, "ayer")).rejects.toThrow("inicio de la consulta no es válida");
    await expect(consultarPersonasConRelacionVigente(repositorio, finanzas, "2026-05-02", "2026-05-01")).rejects.toThrow("no puede ser anterior");
  });
});
