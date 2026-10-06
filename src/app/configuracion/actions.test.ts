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
vi.mock("@/turnos/servicio", () => ({ repositorioDeTurnos: simulacro.repositorioDeTurnos, repositorioDeModelosDeHorario: { buscarPorId: () => { throw new Error("No debe leer modelos antes de autorizar."); }, obtenerGrupoDeSede: async () => "Tiendas" }, repositorioDeGrupos: {} }));
vi.mock("@/colaboradores/servicio", () => ({ repositorioDeColaboradores: simulacro.repositorioDeColaboradores }));
vi.mock("@/colaboradores/casos-de-uso-servidor", () => ({
  crearCasosDeUsoDeColaboradores: () => ({ cambiarGrupo: simulacro.cambiarGrupoDeColaborador }),
}));
vi.mock("@/tardanzas/servicio", () => ({ repositorioDeTardanzas: {} }));
vi.mock("@/db/client", () => ({ db: { select: () => { throw new Error("No debe leer la base antes de autorizar."); }, insert: () => { throw new Error("No debe escribir antes de autorizar."); }, delete: () => { throw new Error("No debe escribir antes de autorizar."); } } }));

import { asignarEquipoOperativoASede, cambiarGrupoDeColaboradorDeConfiguracion, crearModeloHorario, desactivarColaborador, desactivarModeloHorario, eliminarSede, guardarColaborador, guardarGestionDeAsistenciaDelGrupo, guardarPoliticaDeTardanzas, guardarSede, reactivarModeloHorario } from "./actions";

describe("asignar grupo de una sede desde Configuración", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emite una confirmación distinta en cada guardado para que el editor se cierre también al reabrirlo", async () => {
    const actor = { id: "admin-1", rol: "administrador" as const };
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
    simulacro.actor.mockResolvedValue({ id: "admin-1", rol: "administrador" });
    simulacro.asignar.mockRejectedValue(new Error("La sede activa no existe."));

    await expect(asignarEquipoOperativoASede({}, formulario({ nombre: "Tienda Centro", grupo: "Taller" })))
      .resolves.toEqual({ error: "La sede activa no existe." });
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it("rechaza a otros roles antes de intentar la asignación", async () => {
    simulacro.actor.mockResolvedValue({ id: "gerente-1", rol: "gerente_de_area" });

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
    const actor = { id: "admin-1", rol: "administrador" as const };
    simulacro.actor.mockResolvedValue(actor);
    simulacro.cambiarGrupoDeColaborador.mockResolvedValue(undefined);

    const primerEstado = await cambiarGrupoDeColaboradorDeConfiguracion({}, formulario({ dni: "00001024", grupo: "Taller" }));
    const segundoEstado = await cambiarGrupoDeColaboradorDeConfiguracion(primerEstado, formulario({ dni: "00001024", grupo: "Tiendas" }));

    expect(primerEstado).toEqual({ listo: 1 });
    expect(segundoEstado).toEqual({ listo: 2 });
    expect(simulacro.cambiarGrupoDeColaborador).toHaveBeenNthCalledWith(1, "00001024", "Taller");
    expect(simulacro.cambiarGrupoDeColaborador).toHaveBeenNthCalledWith(2, "00001024", "Tiendas");
    expect(simulacro.revalidar).toHaveBeenCalledWith("/configuracion");
    expect(simulacro.revalidar).toHaveBeenCalledWith("/turnos");
    expect(simulacro.revalidar).toHaveBeenCalledWith("/asistencias");
  });

  it("devuelve el error sin descartar el estado del formulario", async () => {
    simulacro.actor.mockResolvedValue({ id: "admin-1", rol: "administrador" });
    simulacro.cambiarGrupoDeColaborador.mockRejectedValue(new Error("No se puede cambiar de grupo: el colaborador tiene un plan semanal en borrador en su grupo actual."));

    await expect(cambiarGrupoDeColaboradorDeConfiguracion({}, formulario({ dni: "00001024", grupo: "Taller" })))
      .resolves.toEqual({ error: "No se puede cambiar de grupo: el colaborador tiene un plan semanal en borrador en su grupo actual." });
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });
});

function formulario(valores: Record<string, string>): FormData {
  const datos = new FormData();
  Object.entries(valores).forEach(([nombre, valor]) => datos.set(nombre, valor));
  return datos;
}

describe("acciones de Configuración reservadas al Administrador (borde del servidor)", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["un gerente de área", { id: "g1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
    ["Finanzas", { id: "f1", rol: "finanzas" }],
    ["Recursos Humanos", { id: "r1", rol: "recursos_humanos" }],
  ])("rechaza a %s antes de leer o escribir la base", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);
    const datos = formulario({ nombre: "Sede nueva", grupo: "Tiendas", sede: "Lima", dni: "00000001", gestiona: "false", toleranciaEnMinutos: "10", tardanzasAcumuladas: "3", horasPenalizadas: "1", vigenteDesde: "2026-09-01" });

    await expect(guardarSede(datos)).rejects.toThrow("No tiene permiso para cambiar la configuración.");
    await expect(eliminarSede(datos)).rejects.toThrow("No tiene permiso para cambiar la configuración.");
    await expect(desactivarColaborador(datos)).rejects.toThrow("No tiene permiso para cambiar la configuración.");
    await expect(guardarPoliticaDeTardanzas(datos)).rejects.toThrow("No tiene permiso para cambiar la configuración.");
    await expect(guardarGestionDeAsistenciaDelGrupo(formulario({ nombre: "Tiendas", gestiona: "false" }))).rejects.toThrow("No tiene permiso para cambiar la configuracion.");
  });

  it.each([
    ["Finanzas", { id: "f1", rol: "finanzas" }],
    ["Recursos Humanos", { id: "r1", rol: "recursos_humanos" }],
    ["un gerente de un grupo que no gestiona asistencia", { id: "g2", rol: "gerente_de_area", grupos: [{ nombre: "Administración", gestionaAsistencia: false }] }],
  ])("rechaza a %s en los modelos de horario sin consultar el modelo", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);
    const datos = formulario({ id: "m1", sede: "Lima", nombre: "Apertura", entrada: "09:00", salida: "18:00" });

    await expect(desactivarModeloHorario(datos)).rejects.toThrow("No tiene permiso para administrar modelos de horario.");
    await expect(reactivarModeloHorario(datos)).rejects.toThrow("No tiene permiso para administrar modelos de horario.");
    await expect(crearModeloHorario(datos)).rejects.toThrow("No tiene permiso para administrar modelos de horario.");
  });
});
