import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), revalidar: vi.fn(), repositorio: undefined as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: simulacro.revalidar }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/reglas-legales/servicio", () => ({
  get repositorioDeReglasLegales() { return simulacro.repositorio; },
}));

import { crearRepositorioEnMemoria } from "@/reglas-legales/repositorio-en-memoria";

import { activarReglaDesdeFormulario, corregirReglaDesdeFormulario } from "./actions";

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.set(campo, valor);
  return datos;
}

const finanzas = { id: "fin-1", rol: "finanzas" };

describe("acciones de Reglas legales (borde del servidor)", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;

  beforeEach(() => {
    vi.clearAllMocks();
    contexto = crearRepositorioEnMemoria();
    simulacro.repositorio = contexto.repositorio;
  });

  const activar = (campos: Record<string, string> = {}) => activarReglaDesdeFormulario({}, formulario({ codigo: "essalud_tasa", valor: "8,5", vigenteDesde: "2026-10-01", fuenteOficial: "Norma sintética", ...campos }));

  it("Finanzas activa un valor con vigencia y fuente, y refresca las pantallas de Reglas legales", async () => {
    simulacro.actor.mockResolvedValue(finanzas);

    const estado = await activar();

    expect(estado).toEqual({ listo: 1 });
    expect(contexto.reglas()).toMatchObject([{ codigo: "essalud_tasa", valor: 850, vigenteDesde: "2026-10-01", fuenteOficial: "Norma sintética", activadaPorId: "fin-1" }]);
    expect(simulacro.revalidar).toHaveBeenCalledWith("/pagos/reglas-legales");
    expect(simulacro.revalidar).toHaveBeenCalledWith("/pagos/reglas-legales/[codigo]", "page");
  });

  it("los errores vuelven junto al formulario y no guardan nada", async () => {
    simulacro.actor.mockResolvedValue(finanzas);

    expect(await activar({ valor: "abc" })).toMatchObject({ error: expect.stringContaining("porcentaje") });
    expect(await activar({ vigenteDesde: "2026-02-30" })).toEqual({ error: "La fecha de inicio de la vigencia no es válida." });
    expect(await activar({ codigo: "centro_de_costo" })).toMatchObject({ error: expect.stringContaining("Elija el valor legal") });
    expect(await activar({ fuenteOficial: "" })).toEqual({ error: "Falta la fuente oficial." });
    expect(await activar({ valor: "" })).toEqual({ error: "Falta el valor." });
    expect(contexto.reglas()).toEqual([]);
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it("corrige con motivo y rechaza una corrección sin motivo", async () => {
    simulacro.actor.mockResolvedValue(finanzas);
    await activar({ valor: "85" });
    const [errada] = contexto.reglas();

    expect(await corregirReglaDesdeFormulario({}, formulario({ reglaId: errada.id, valor: "8,5" }))).toEqual({ error: "Falta el motivo de la corrección." });
    expect(await corregirReglaDesdeFormulario({}, formulario({ reglaId: errada.id, valor: "8,5", motivo: "Error de digitación" }))).toEqual({ listo: 1 });
    expect(contexto.reglas().map(({ valor, reemplazadaEn }) => ({ valor, reemplazada: reemplazadaEn !== null }))).toEqual([{ valor: 8500, reemplazada: true }, { valor: 850, reemplazada: false }]);
  });

  it.each([
    ["el Administrador del sistema", { id: "adm-1", rol: "administrador" }],
    ["Recursos Humanos", { id: "rrhh-1", rol: "recursos_humanos" }],
    ["un gerente de área", { id: "ger-1", rol: "gerente_de_area", grupos: [{ nombre: "Taller", gestionaAsistencia: true }] }],
  ])("%s no puede activar ni corregir: el servidor responde sin permiso y no cambia nada", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(finanzas);
    await activar();
    const [existente] = contexto.reglas();
    simulacro.actor.mockResolvedValue(actor);

    expect(await activar({ vigenteDesde: "2027-01-01", valor: "99" })).toEqual({ error: "No tiene permiso para consultar ni editar Pagos." });
    expect(await corregirReglaDesdeFormulario({}, formulario({ reglaId: existente.id, valor: "99", motivo: "Intento" }))).toEqual({ error: "No tiene permiso para consultar ni editar Pagos." });
    expect(contexto.reglas()).toHaveLength(1);
    expect(contexto.reglas()[0]).toMatchObject({ valor: 850, reemplazadaEn: null });
  });

  it("sin sesión el servidor rechaza", async () => {
    simulacro.actor.mockRejectedValue(new Error("La sesión no es válida."));

    expect(await activar()).toEqual({ error: "La sesión no es válida." });
    expect(contexto.reglas()).toEqual([]);
  });
});
