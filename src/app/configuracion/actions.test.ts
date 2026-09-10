import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({
  actor: vi.fn(),
  asignar: vi.fn(),
  revalidar: vi.fn(),
  repositorioDeTurnos: {},
}));

vi.mock("next/cache", () => ({ revalidatePath: simulacro.revalidar }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/turnos/configurar-equipos-operativos", () => ({ asignarGrupoASede: simulacro.asignar }));
vi.mock("@/turnos/servicio", () => ({ repositorioDeTurnos: simulacro.repositorioDeTurnos, repositorioDeModelosDeHorario: {} }));
vi.mock("@/colaboradores/servicio", () => ({ repositorioDeColaboradores: {} }));
vi.mock("@/tardanzas/servicio", () => ({ repositorioDeTardanzas: {} }));
vi.mock("@/db/client", () => ({ db: {} }));

import { asignarEquipoOperativoASede } from "./actions";

describe("asignar grupo de una sede desde Configuración", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emite una confirmación distinta en cada guardado para que el editor se cierre también al reabrirlo", async () => {
    const actor = { id: "admin-1", rol: "administracion" as const };
    simulacro.actor.mockResolvedValue(actor);
    simulacro.asignar.mockResolvedValue(undefined);

    const primerEstado = await asignarEquipoOperativoASede({}, formulario({ nombre: "Tienda Centro", grupo: "Taller" }));
    const segundoEstado = await asignarEquipoOperativoASede(primerEstado, formulario({ nombre: "Tienda Centro", grupo: "Tiendas" }));

    expect(primerEstado).toEqual({ listo: 1 });
    expect(segundoEstado).toEqual({ listo: 2 });
    expect(simulacro.asignar).toHaveBeenNthCalledWith(1, simulacro.repositorioDeTurnos, actor, "Tienda Centro", "Taller");
    expect(simulacro.asignar).toHaveBeenNthCalledWith(2, simulacro.repositorioDeTurnos, actor, "Tienda Centro", "Tiendas");
    expect(simulacro.revalidar).toHaveBeenCalledWith("/configuracion");
    expect(simulacro.revalidar).toHaveBeenCalledWith("/turnos");
  });

  it("devuelve el error sin descartar el estado del formulario", async () => {
    simulacro.actor.mockResolvedValue({ id: "admin-1", rol: "administracion" });
    simulacro.asignar.mockRejectedValue(new Error("La sede activa no existe."));

    await expect(asignarEquipoOperativoASede({}, formulario({ nombre: "Tienda Centro", grupo: "Taller" })))
      .resolves.toEqual({ error: "La sede activa no existe." });
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it("rechaza a otros roles antes de intentar la asignación", async () => {
    simulacro.actor.mockResolvedValue({ id: "operaciones-1", rol: "operaciones" });

    await expect(asignarEquipoOperativoASede({}, formulario({ nombre: "Tienda Centro", grupo: "Taller" })))
      .resolves.toEqual({ error: "No tiene permiso para cambiar la configuración." });
    expect(simulacro.asignar).not.toHaveBeenCalled();
  });
});

function formulario(valores: Record<string, string>): FormData {
  const datos = new FormData();
  Object.entries(valores).forEach(([nombre, valor]) => datos.set(nombre, valor));
  return datos;
}
