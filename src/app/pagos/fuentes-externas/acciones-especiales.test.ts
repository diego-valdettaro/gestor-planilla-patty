import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), revalidar: vi.fn(), repositorio: undefined as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: simulacro.revalidar }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/fuentes-externas/servicio", () => ({
  get repositorioDeFuentesExternas() { return simulacro.repositorio; },
}));

import { crearRepositorioEnMemoria } from "@/fuentes-externas/repositorio-en-memoria";

import { registrarConciliacionDeCeseDesdeFormulario } from "./acciones-especiales";

// Acción de servidor de la conciliación de la liquidación por cese (#128). Esperados de ejemplos-sinteticos.md (C-E2, C-E7, C-E10), en céntimos.
// Personas y datos sintéticos.
function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.set(campo, valor);
  return datos;
}

const finanzas = { id: "fin-1", rol: "finanzas" };
const ANA = "11111111";

describe("acciones especiales de Fuentes externas: conciliación de cese (borde del servidor)", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;

  beforeEach(() => {
    vi.clearAllMocks();
    contexto = crearRepositorioEnMemoria({ [ANA]: "Ana Sintética" });
    simulacro.repositorio = contexto.repositorio;
    simulacro.actor.mockResolvedValue(finanzas);
  });

  const registrar = (campos: Record<string, string> = {}) => registrarConciliacionDeCeseDesdeFormulario({}, formulario({
    dni: ANA, concepto: "vacaciones_truncas", fechaDelHecho: "2026-10-12", mesDeDevengue: "2026-10", mesDeAplicacion: "2026-10", monto: "400,00", ...campos,
  }));

  it("AC-01 Finanzas guarda un concepto de la liquidación desde el formulario y se refrescan las pantallas", async () => {
    expect(await registrar()).toEqual({ listo: 1 });

    expect(contexto.importes()).toHaveLength(1);
    expect(contexto.importes()[0]).toMatchObject({ dni: ANA, concepto: "vacaciones_truncas", monto: 40000, tipoDeFuente: "conciliacion_de_liquidacion_por_cese" });
    expect(simulacro.revalidar).toHaveBeenCalledWith("/pagos/fuentes-externas");
    expect(simulacro.revalidar).toHaveBeenCalledWith("/pagos/fuentes-externas/[tipo]", "page");
  });

  it.each([
    ["el Administrador del sistema", { id: "adm-1", rol: "administrador" }],
    ["un Gerente de área", { id: "ger-1", rol: "gerente_de_area" }],
  ])("AC-02 %s no guarda nada: sin acceso monetario", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);

    expect(await registrar()).toEqual({ error: expect.stringMatching(/permiso/) });
    expect(contexto.importes()).toHaveLength(0);
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it("AC-03 un importe inválido muestra el error junto a la acción y no guarda", async () => {
    const estado = await registrar({ monto: "0" });

    expect(estado).toEqual({ error: expect.stringMatching(/mayor que cero/) });
    expect(estado).not.toHaveProperty("listo");
    expect(contexto.importes()).toHaveLength(0);
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it("AC-04 un duplicado exacto devuelve el aviso y no suma otra fila", async () => {
    await registrar();

    expect(await registrar()).toEqual({ error: expect.stringMatching(/Ya existe/) });
    expect(contexto.importes()).toHaveLength(1);
  });
});
