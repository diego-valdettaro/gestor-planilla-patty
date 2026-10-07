import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), revalidar: vi.fn(), repositorio: undefined as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: simulacro.revalidar }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/condiciones-laborales/servicio", () => ({
  get repositorioDeCondicionesLaborales() { return simulacro.repositorio; },
}));

import { BETO_RELACION, crearRepositorioEnMemoria } from "@/condiciones-laborales/repositorio-en-memoria";

import { corregirCondicionDesdeFormulario, registrarCondicionDesdeFormulario } from "./actions";

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.set(campo, valor);
  return datos;
}

const finanzas = { id: "fin-1", rol: "finanzas" };

describe("acciones de Condiciones laborales (borde del servidor)", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;

  beforeEach(() => {
    vi.clearAllMocks();
    contexto = crearRepositorioEnMemoria();
    simulacro.repositorio = contexto.repositorio;
  });

  const registrar = (campos: Record<string, string> = {}) => registrarCondicionDesdeFormulario({}, formulario({ relacionId: BETO_RELACION, dato: "sueldo", valor: "1800", vigenteDesde: "2026-09-16", ...campos }));

  it("Finanzas registra un valor con vigencia y refresca las pantallas de Condiciones laborales", async () => {
    simulacro.actor.mockResolvedValue(finanzas);

    const estado = await registrar();

    expect(estado).toEqual({ listo: 1 });
    expect(contexto.condiciones()).toMatchObject([{ relacionId: BETO_RELACION, dato: "sueldo", valor: 180000, vigenteDesde: "2026-09-16", registradaPorId: "fin-1" }]);
    expect(simulacro.revalidar).toHaveBeenCalledWith("/pagos/condiciones-laborales");
    expect(simulacro.revalidar).toHaveBeenCalledWith("/pagos/condiciones-laborales/[relacionId]", "page");
  });

  it("los errores vuelven junto al formulario y no guardan nada", async () => {
    simulacro.actor.mockResolvedValue(finanzas);

    expect(await registrar({ valor: "abc" })).toMatchObject({ error: expect.stringContaining("sueldo") });
    expect(await registrar({ vigenteDesde: "2026-02-30" })).toEqual({ error: "La fecha de inicio de la vigencia no es válida." });
    expect(await registrar({ dato: "sede_de_adscripcion", valor: "Centro de costo 7" })).toMatchObject({ error: expect.stringContaining("No existe la sede") });
    expect(await registrar({ valor: "" })).toEqual({ error: "Falta el valor." });
    expect(contexto.condiciones()).toEqual([]);
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it("corrige con motivo y rechaza una corrección sin motivo", async () => {
    simulacro.actor.mockResolvedValue(finanzas);
    await registrar({ valor: "18000" });
    const [errada] = contexto.condiciones();

    expect(await corregirCondicionDesdeFormulario({}, formulario({ condicionId: errada.id, valor: "1800" }))).toEqual({ error: "Falta el motivo de la corrección." });
    expect(await corregirCondicionDesdeFormulario({}, formulario({ condicionId: errada.id, valor: "1800", motivo: "Error de digitación" }))).toEqual({ listo: 1 });
    expect(contexto.condiciones().map(({ valor, reemplazadaEn }) => ({ valor, reemplazada: reemplazadaEn !== null }))).toEqual([{ valor: 1800000, reemplazada: true }, { valor: 180000, reemplazada: false }]);
  });

  it.each([
    ["el Administrador del sistema", { id: "adm-1", rol: "administrador" }],
    ["Recursos Humanos", { id: "rrhh-1", rol: "recursos_humanos" }],
    ["un gerente de área", { id: "ger-1", rol: "gerente_de_area", grupos: [{ nombre: "Taller", gestionaAsistencia: true }] }],
  ])("%s no puede registrar ni corregir: el servidor responde sin permiso y no cambia nada", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(finanzas);
    await registrar();
    const [existente] = contexto.condiciones();
    simulacro.actor.mockResolvedValue(actor);

    expect(await registrar({ vigenteDesde: "2026-10-01", valor: "9999" })).toEqual({ error: "No tiene permiso para consultar ni editar Pagos." });
    expect(await corregirCondicionDesdeFormulario({}, formulario({ condicionId: existente.id, valor: "9999", motivo: "Intento" }))).toEqual({ error: "No tiene permiso para consultar ni editar Pagos." });
    expect(contexto.condiciones()).toHaveLength(1);
    expect(contexto.condiciones()[0]).toMatchObject({ valor: 180000, reemplazadaEn: null });
  });

  it("sin sesión el servidor rechaza", async () => {
    simulacro.actor.mockRejectedValue(new Error("La sesión no es válida."));

    expect(await registrar()).toEqual({ error: "La sesión no es válida." });
    expect(contexto.condiciones()).toEqual([]);
  });
});
