import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), revalidar: vi.fn(), repositorio: undefined as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: simulacro.revalidar }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/relaciones-laborales/servicio", () => ({
  get repositorioDeRelacionesLaborales() { return simulacro.repositorio; },
}));

import { crearRepositorioEnMemoria, ANA } from "@/relaciones-laborales/repositorio-en-memoria";

import {
  confirmarCeseDesdeFormulario,
  confirmarIngresoDesdeFormulario,
  corregirIngresoDesdeFormulario,
  registrarCeseDesdeFormulario,
  registrarIngresoDesdeFormulario,
} from "./actions";

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.set(campo, valor);
  return datos;
}

const recursosHumanos = { id: "rrhh-1", rol: "recursos_humanos" };

describe("acciones de Relaciones laborales (borde del servidor)", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;

  beforeEach(() => {
    vi.clearAllMocks();
    contexto = crearRepositorioEnMemoria();
    simulacro.repositorio = contexto.repositorio;
  });

  it("Recursos Humanos registra y confirma un ingreso, y refresca Relaciones laborales y Horarios", async () => {
    simulacro.actor.mockResolvedValue(recursosHumanos);

    const estado = await registrarIngresoDesdeFormulario({}, formulario({ dni: ANA, ingreso: "2026-03-02" }));
    await confirmarIngresoDesdeFormulario(formulario({ relacionId: contexto.relaciones[0].id }));

    expect(estado).toEqual({ listo: 1 });
    expect(contexto.relaciones[0]).toMatchObject({ dni: ANA, ingreso: "2026-03-02", ingresoConfirmado: true });
    expect(simulacro.revalidar).toHaveBeenCalledWith("/relaciones-laborales");
    expect(simulacro.revalidar).toHaveBeenCalledWith("/turnos");
  });

  it("registra y confirma el cese; una fecha inválida vuelve como error junto al formulario", async () => {
    simulacro.actor.mockResolvedValue(recursosHumanos);
    await registrarIngresoDesdeFormulario({}, formulario({ dni: ANA, ingreso: "2026-03-02" }));
    const { id } = contexto.relaciones[0];
    await confirmarIngresoDesdeFormulario(formulario({ relacionId: id }));

    expect(await registrarCeseDesdeFormulario({}, formulario({ relacionId: id, fecha: "2026-02-30" }))).toEqual({ error: "La fecha de cese no es válida." });
    expect(await registrarCeseDesdeFormulario({}, formulario({ relacionId: id, fecha: "2026-06-30" }))).toEqual({ listo: 1 });
    await confirmarCeseDesdeFormulario(formulario({ relacionId: id }));

    expect(contexto.relaciones[0]).toMatchObject({ cese: "2026-06-30", ceseConfirmado: true });
  });

  it("corrige el ingreso mientras no esté confirmado", async () => {
    simulacro.actor.mockResolvedValue(recursosHumanos);
    await registrarIngresoDesdeFormulario({}, formulario({ dni: ANA, ingreso: "2026-03-02" }));

    expect(await corregirIngresoDesdeFormulario({}, formulario({ relacionId: contexto.relaciones[0].id, fecha: "2026-03-09" }))).toEqual({ listo: 1 });
    expect(contexto.relaciones[0].ingreso).toBe("2026-03-09");
  });

  it.each([
    ["Finanzas", { id: "fin-1", rol: "finanzas" }],
    ["un gerente de área", { id: "ger-1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ])("%s no puede registrar ni confirmar: el servidor responde sin permiso y no cambia nada", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(recursosHumanos);
    await registrarIngresoDesdeFormulario({}, formulario({ dni: ANA, ingreso: "2026-03-02" }));
    const { id } = contexto.relaciones[0];
    simulacro.actor.mockResolvedValue(actor);
    simulacro.revalidar.mockClear();

    expect(await registrarIngresoDesdeFormulario({}, formulario({ dni: ANA, ingreso: "2026-05-04" }))).toEqual({ error: expect.stringContaining("No tiene permiso") });
    expect(await corregirIngresoDesdeFormulario({}, formulario({ relacionId: id, fecha: "2026-03-09" }))).toEqual({ error: expect.stringContaining("No tiene permiso") });
    expect(await registrarCeseDesdeFormulario({}, formulario({ relacionId: id, fecha: "2026-06-30" }))).toEqual({ error: expect.stringContaining("No tiene permiso") });
    await expect(confirmarIngresoDesdeFormulario(formulario({ relacionId: id }))).rejects.toThrow("No tiene permiso");
    await expect(confirmarCeseDesdeFormulario(formulario({ relacionId: id }))).rejects.toThrow("No tiene permiso");

    expect(contexto.relaciones).toHaveLength(1);
    expect(contexto.relaciones[0]).toMatchObject({ ingreso: "2026-03-02", cese: null, ingresoConfirmado: false });
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it("sin sesión no cambia nada", async () => {
    simulacro.actor.mockRejectedValue(new Error("No hay una sesión activa."));

    expect(await registrarIngresoDesdeFormulario({}, formulario({ dni: ANA, ingreso: "2026-03-02" }))).toEqual({ error: "No hay una sesión activa." });
    expect(contexto.relaciones).toEqual([]);
  });
});
