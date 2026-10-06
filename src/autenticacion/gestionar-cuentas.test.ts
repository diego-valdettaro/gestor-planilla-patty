import { describe, expect, it } from "vitest";

import { asignarGerenteAGrupo, crearCuenta, quitarGerenteDeGrupo, type RepositorioDeGestionDeCuentas } from "./gestionar-cuentas";
import type { Actor, Rol } from "./permisos";

const administrador: Actor = { id: "admin", rol: "administrador" };
const finanzas: Actor = { id: "fin", rol: "finanzas" };
const gerente: Actor = { id: "ger", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] };
const recursosHumanos: Actor = { id: "rrhh", rol: "recursos_humanos" };

function crearRepositorio(inicial: { cuentas?: Array<{ id: string; nombreUsuario: string; rol: Rol }>; gerentes?: Record<string, string>; grupos?: string[] } = {}) {
  const cuentas = [...(inicial.cuentas ?? [{ id: "g1", nombreUsuario: "gerente-1", rol: "gerente_de_area" as Rol }, { id: "g2", nombreUsuario: "gerente-2", rol: "gerente_de_area" as Rol }, { id: "f1", nombreUsuario: "fin-1", rol: "finanzas" as Rol }])];
  const gerentes = new Map(Object.entries(inicial.gerentes ?? {}));
  const grupos = inicial.grupos ?? ["Tiendas", "Taller"];
  const guardadas: Array<{ nombreUsuario: string; hashContrasena: string; rol: Rol }> = [];
  const repositorio: RepositorioDeGestionDeCuentas = {
    buscarPorNombreUsuario: async (nombre) => { const c = cuentas.find((x) => x.nombreUsuario === nombre); return c ? { ...c, hashContrasena: "h" } : undefined; },
    guardarCuenta: async (cuenta) => { guardadas.push(cuenta); },
    buscarCuentaPorId: async (id) => cuentas.find((c) => c.id === id),
    existeGrupo: async (nombre) => grupos.includes(nombre),
    buscarGerenteDelGrupo: async (grupo) => gerentes.get(grupo),
    asignarGerente: async (grupo, cuentaId) => { if (gerentes.has(grupo)) return false; gerentes.set(grupo, cuentaId); return true; },
    quitarGerente: async (grupo) => { gerentes.delete(grupo); },
  };
  return { repositorio, guardadas, gerentes };
}

const hash = async (contrasena: string) => `hash:${contrasena}`;

describe("crearCuenta", () => {
  it("permite al Administrador crear una cuenta de cualquier rol sin guardar la contraseña", async () => {
    for (const rol of ["administrador", "gerente_de_area", "recursos_humanos", "finanzas"] as Rol[]) {
      const { repositorio, guardadas } = crearRepositorio();
      await crearCuenta(repositorio, administrador, { nombreUsuario: ` nueva-${rol} `, contrasena: "clave-segura", rol }, hash);
      expect(guardadas).toEqual([{ nombreUsuario: `nueva-${rol}`, hashContrasena: "hash:clave-segura", rol }]);
    }
  });

  it("permite a Finanzas crear gerentes de área y Recursos Humanos", async () => {
    const { repositorio, guardadas } = crearRepositorio();
    await crearCuenta(repositorio, finanzas, { nombreUsuario: "nuevo-gerente", contrasena: "clave-segura", rol: "gerente_de_area" }, hash);
    await crearCuenta(repositorio, finanzas, { nombreUsuario: "nuevo-rrhh", contrasena: "clave-segura", rol: "recursos_humanos" }, hash);
    expect(guardadas.map((cuenta) => cuenta.rol)).toEqual(["gerente_de_area", "recursos_humanos"]);
  });

  it("rechaza que Finanzas cree cuentas de Finanzas o de Administrador", async () => {
    const { repositorio, guardadas } = crearRepositorio();
    for (const rol of ["administrador", "finanzas"] as Rol[]) {
      await expect(crearCuenta(repositorio, finanzas, { nombreUsuario: "otra", contrasena: "clave-segura", rol }, hash)).rejects.toThrow("No tiene permiso para crear cuentas de ese rol.");
    }
    expect(guardadas).toEqual([]);
  });

  it("rechaza a los roles sin permiso sobre cuentas", async () => {
    const { repositorio, guardadas } = crearRepositorio();
    for (const actor of [gerente, recursosHumanos]) {
      await expect(crearCuenta(repositorio, actor, { nombreUsuario: "otra", contrasena: "clave-segura", rol: "gerente_de_area" }, hash)).rejects.toThrow("No tiene permiso para crear cuentas de ese rol.");
    }
    expect(guardadas).toEqual([]);
  });

  it("valida nombre de usuario, longitud de contraseña, rol y duplicados", async () => {
    const { repositorio } = crearRepositorio();
    await expect(crearCuenta(repositorio, administrador, { nombreUsuario: "  ", contrasena: "clave-segura", rol: "finanzas" }, hash)).rejects.toThrow("El nombre de usuario es obligatorio.");
    await expect(crearCuenta(repositorio, administrador, { nombreUsuario: "corta", contrasena: "1234567", rol: "finanzas" }, hash)).rejects.toThrow("La contraseña debe tener al menos 8 caracteres.");
    await expect(crearCuenta(repositorio, administrador, { nombreUsuario: "x", contrasena: "clave-segura", rol: "operaciones" as Rol }, hash)).rejects.toThrow("El rol no es válido.");
    await expect(crearCuenta(repositorio, administrador, { nombreUsuario: "gerente-1", contrasena: "clave-segura", rol: "finanzas" }, hash)).rejects.toThrow("Ya existe una cuenta con ese nombre de usuario.");
  });
});

describe("asignarGerenteAGrupo", () => {
  it("permite a Finanzas y al Administrador asignar varios grupos a un gerente", async () => {
    const { repositorio, gerentes } = crearRepositorio();
    await asignarGerenteAGrupo(repositorio, finanzas, "Tiendas", "g1");
    await asignarGerenteAGrupo(repositorio, administrador, "Taller", "g1");
    expect([...gerentes.entries()]).toEqual([["Tiendas", "g1"], ["Taller", "g1"]]);
  });

  it("rechaza asignar un grupo que ya tiene otro gerente", async () => {
    const { repositorio, gerentes } = crearRepositorio({ gerentes: { Tiendas: "g1" } });
    await expect(asignarGerenteAGrupo(repositorio, finanzas, "Tiendas", "g2")).rejects.toThrow("El grupo Tiendas ya tiene gerente (gerente-1). Quítelo primero.");
    expect(gerentes.get("Tiendas")).toBe("g1");
  });

  it("es idempotente si el grupo ya es del mismo gerente", async () => {
    const { repositorio } = crearRepositorio({ gerentes: { Tiendas: "g1" } });
    await expect(asignarGerenteAGrupo(repositorio, finanzas, "Tiendas", "g1")).resolves.toBeUndefined();
  });

  it("solo asigna a cuentas de gerente de área y a grupos que existen", async () => {
    const { repositorio } = crearRepositorio();
    await expect(asignarGerenteAGrupo(repositorio, finanzas, "Tiendas", "f1")).rejects.toThrow("Solo se puede asignar grupos a una cuenta de gerente de área.");
    await expect(asignarGerenteAGrupo(repositorio, finanzas, "Tiendas", "no-existe")).rejects.toThrow("La cuenta no existe.");
    await expect(asignarGerenteAGrupo(repositorio, finanzas, "Inexistente", "g1")).rejects.toThrow("El grupo no existe.");
  });

  it("rechaza a los roles sin permiso sobre cuentas", async () => {
    const { repositorio, gerentes } = crearRepositorio();
    for (const actor of [gerente, recursosHumanos]) {
      await expect(asignarGerenteAGrupo(repositorio, actor, "Tiendas", "g1")).rejects.toThrow("No tiene permiso para asignar gerentes a grupos.");
    }
    expect(gerentes.size).toBe(0);
  });
});

describe("quitarGerenteDeGrupo", () => {
  it("permite a Finanzas quitar al gerente de un grupo", async () => {
    const { repositorio, gerentes } = crearRepositorio({ gerentes: { Tiendas: "g1" } });
    await quitarGerenteDeGrupo(repositorio, finanzas, "Tiendas");
    expect(gerentes.size).toBe(0);
  });

  it("rechaza a los roles sin permiso", async () => {
    const { repositorio, gerentes } = crearRepositorio({ gerentes: { Tiendas: "g1" } });
    await expect(quitarGerenteDeGrupo(repositorio, gerente, "Tiendas")).rejects.toThrow("No tiene permiso para asignar gerentes a grupos.");
    expect(gerentes.size).toBe(1);
  });
});
