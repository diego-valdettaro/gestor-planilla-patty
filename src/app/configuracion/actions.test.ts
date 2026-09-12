import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({
  actor: vi.fn(),
  asignar: vi.fn(),
  cambiarGrupoDeColaborador: vi.fn(),
  revalidar: vi.fn(),
  repositorioDeTurnos: {},
  repositorioDeColaboradores: {},
}));

vi.mock("next/cache", () => ({ revalidatePath: simulacro.revalidar }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/turnos/configurar-equipos-operativos", () => ({ asignarGrupoASede: simulacro.asignar }));
vi.mock("@/turnos/servicio", () => ({ repositorioDeTurnos: simulacro.repositorioDeTurnos, repositorioDeModelosDeHorario: {} }));
vi.mock("@/colaboradores/servicio", () => ({ repositorioDeColaboradores: simulacro.repositorioDeColaboradores }));
vi.mock("@/colaboradores/casos-de-uso-servidor", () => ({
  crearCasosDeUsoDeColaboradores: () => ({ cambiarGrupo: simulacro.cambiarGrupoDeColaborador }),
}));
vi.mock("@/tardanzas/servicio", () => ({ repositorioDeTardanzas: {} }));
vi.mock("@/db/client", () => ({ db: {} }));

import { asignarEquipoOperativoASede, cambiarGrupoDeColaboradorDeConfiguracion } from "./actions";

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

describe("cambiar el grupo de un colaborador desde Configuración", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emite una confirmación distinta en cada guardado para que el editor se cierre también al reabrirlo", async () => {
    const actor = { id: "admin-1", rol: "administracion" as const };
    simulacro.actor.mockResolvedValue(actor);
    simulacro.cambiarGrupoDeColaborador.mockResolvedValue(undefined);

    const primerEstado = await cambiarGrupoDeColaboradorDeConfiguracion({}, formulario({ idHuellero: "HU-1024", grupo: "Taller" }));
    const segundoEstado = await cambiarGrupoDeColaboradorDeConfiguracion(primerEstado, formulario({ idHuellero: "HU-1024", grupo: "Tiendas" }));

    expect(primerEstado).toEqual({ listo: 1 });
    expect(segundoEstado).toEqual({ listo: 2 });
    expect(simulacro.cambiarGrupoDeColaborador).toHaveBeenNthCalledWith(1, "HU-1024", "Taller");
    expect(simulacro.cambiarGrupoDeColaborador).toHaveBeenNthCalledWith(2, "HU-1024", "Tiendas");
    expect(simulacro.revalidar).toHaveBeenCalledWith("/configuracion");
    expect(simulacro.revalidar).toHaveBeenCalledWith("/turnos");
    expect(simulacro.revalidar).toHaveBeenCalledWith("/asistencias");
  });

  it("devuelve el error sin descartar el estado del formulario", async () => {
    simulacro.actor.mockResolvedValue({ id: "admin-1", rol: "administracion" });
    simulacro.cambiarGrupoDeColaborador.mockRejectedValue(new Error("No se puede cambiar de grupo: el colaborador tiene un plan semanal en borrador en su grupo actual."));

    await expect(cambiarGrupoDeColaboradorDeConfiguracion({}, formulario({ idHuellero: "HU-1024", grupo: "Taller" })))
      .resolves.toEqual({ error: "No se puede cambiar de grupo: el colaborador tiene un plan semanal en borrador en su grupo actual." });
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });
});

function formulario(valores: Record<string, string>): FormData {
  const datos = new FormData();
  Object.entries(valores).forEach(([nombre, valor]) => datos.set(nombre, valor));
  return datos;
}
