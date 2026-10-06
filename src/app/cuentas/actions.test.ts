import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => {
  const cuentas = [
    { id: "g1", nombreUsuario: "gerente-1", rol: "gerente_de_area" },
    { id: "f1", nombreUsuario: "fin-1", rol: "finanzas" },
  ];
  const guardadas: Array<{ nombreUsuario: string; hashContrasena: string; rol: string }> = [];
  const asignaciones = new Map<string, string>();
  return {
    actor: vi.fn(),
    revalidar: vi.fn(),
    guardadas,
    asignaciones,
    repositorio: {
      buscarPorNombreUsuario: async (nombre: string) => cuentas.find((cuenta) => cuenta.nombreUsuario === nombre),
      guardarSesion: async () => undefined,
      guardarCuenta: async (cuenta: { nombreUsuario: string; hashContrasena: string; rol: string }) => { guardadas.push(cuenta); },
      buscarCuentaPorId: async (id: string) => cuentas.find((cuenta) => cuenta.id === id),
      existeGrupo: async (nombre: string) => ["Tiendas", "Taller"].includes(nombre),
      buscarGerenteDelGrupo: async (grupo: string) => asignaciones.get(grupo),
      asignarGerente: async (grupo: string, cuentaId: string) => { if (asignaciones.has(grupo)) return false; asignaciones.set(grupo, cuentaId); return true; },
      quitarGerente: async (grupo: string) => { asignaciones.delete(grupo); },
    },
  };
});

vi.mock("next/cache", () => ({ revalidatePath: simulacro.revalidar }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/autenticacion/servicio", () => ({ repositorioDeCuentas: simulacro.repositorio }));
vi.mock("@/autenticacion/contrasenas", () => ({ hashDeContrasena: async (contrasena: string) => `hash:${contrasena}` }));

import { asignarGerenteDesdeFormulario, crearCuentaDesdeFormulario, quitarGerenteDesdeFormulario } from "./actions";

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.set(campo, valor);
  return datos;
}

describe("acciones de Cuentas (borde del servidor)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    simulacro.guardadas.length = 0;
    simulacro.asignaciones.clear();
  });

  it("Finanzas crea una cuenta de gerente de área y la contraseña no se guarda en claro", async () => {
    simulacro.actor.mockResolvedValue({ id: "f1", rol: "finanzas" });

    const estado = await crearCuentaDesdeFormulario({}, formulario({ nombreUsuario: "nuevo", contrasena: "clave-segura", rol: "gerente_de_area" }));

    expect(estado).toEqual({ listo: 1 });
    expect(simulacro.guardadas).toEqual([{ nombreUsuario: "nuevo", hashContrasena: "hash:clave-segura", rol: "gerente_de_area" }]);
    expect(simulacro.revalidar).toHaveBeenCalledWith("/cuentas");
  });

  it.each([
    ["Finanzas crea una cuenta de Finanzas", { id: "f1", rol: "finanzas" }, "finanzas"],
    ["Finanzas crea un Administrador", { id: "f1", rol: "finanzas" }, "administrador"],
    ["un gerente de área crea cuentas", { id: "g1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }, "gerente_de_area"],
    ["Recursos Humanos crea cuentas", { id: "r1", rol: "recursos_humanos" }, "recursos_humanos"],
  ])("rechaza que %s", async (_nombre, actor, rol) => {
    simulacro.actor.mockResolvedValue(actor);

    const estado = await crearCuentaDesdeFormulario({}, formulario({ nombreUsuario: "otra", contrasena: "clave-segura", rol }));

    expect(estado.error).toBe("No tiene permiso para crear cuentas de ese rol.");
    expect(simulacro.guardadas).toEqual([]);
  });

  it("rechaza un rol inexistente, como los roles anteriores a la migración", async () => {
    simulacro.actor.mockResolvedValue({ id: "a1", rol: "administrador" });

    const estado = await crearCuentaDesdeFormulario({}, formulario({ nombreUsuario: "otra", contrasena: "clave-segura", rol: "operaciones" }));

    expect(estado.error).toBe("El rol no es válido.");
  });

  it("el Administrador crea una cuenta de Administrador", async () => {
    simulacro.actor.mockResolvedValue({ id: "a1", rol: "administrador" });

    await crearCuentaDesdeFormulario({}, formulario({ nombreUsuario: "otro-admin", contrasena: "clave-segura", rol: "administrador" }));

    expect(simulacro.guardadas).toEqual([expect.objectContaining({ rol: "administrador" })]);
  });

  it("Finanzas asigna dos grupos al mismo gerente y rechaza un grupo ya asignado a otro", async () => {
    simulacro.actor.mockResolvedValue({ id: "f1", rol: "finanzas" });

    await asignarGerenteDesdeFormulario({}, formulario({ grupo: "Tiendas", cuentaId: "g1" }));
    await asignarGerenteDesdeFormulario({}, formulario({ grupo: "Taller", cuentaId: "g1" }));
    simulacro.asignaciones.set("Taller", "otro");
    const estado = await asignarGerenteDesdeFormulario({}, formulario({ grupo: "Taller", cuentaId: "g1" }));

    expect([...simulacro.asignaciones.entries()]).toEqual([["Tiendas", "g1"], ["Taller", "otro"]]);
    expect(estado.error).toContain("ya tiene gerente");
  });

  it.each([
    ["un gerente de área", { id: "g1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
    ["Recursos Humanos", { id: "r1", rol: "recursos_humanos" }],
  ])("rechaza que %s asigne o quite gerentes", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);
    simulacro.asignaciones.set("Tiendas", "g1");

    const estado = await asignarGerenteDesdeFormulario({}, formulario({ grupo: "Taller", cuentaId: "g1" }));
    await expect(quitarGerenteDesdeFormulario(formulario({ grupo: "Tiendas" }))).rejects.toThrow("No tiene permiso para asignar gerentes a grupos.");

    expect(estado.error).toBe("No tiene permiso para asignar gerentes a grupos.");
    expect([...simulacro.asignaciones.entries()]).toEqual([["Tiendas", "g1"]]);
  });

  it("quita el gerente de un grupo cuando lo pide Finanzas", async () => {
    simulacro.actor.mockResolvedValue({ id: "f1", rol: "finanzas" });
    simulacro.asignaciones.set("Tiendas", "g1");

    await quitarGerenteDesdeFormulario(formulario({ grupo: "Tiendas" }));

    expect(simulacro.asignaciones.size).toBe(0);
  });
});
