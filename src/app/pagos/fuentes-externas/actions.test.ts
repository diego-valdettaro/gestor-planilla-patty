import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), revalidar: vi.fn(), repositorio: undefined as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: simulacro.revalidar }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/fuentes-externas/servicio", () => ({
  get repositorioDeFuentesExternas() { return simulacro.repositorio; },
}));

import { crearRepositorioEnMemoria } from "@/fuentes-externas/repositorio-en-memoria";

import {
  anularImporteDesdeFormulario,
  confirmarFuenteDesdeFormulario,
  registrarImporteDesdeFormulario,
  volverAPendienteDesdeFormulario,
} from "./actions";

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.set(campo, valor);
  return datos;
}

const finanzas = { id: "fin-1", rol: "finanzas" };
const ANA = "11111111";

describe("acciones de Fuentes externas (borde del servidor)", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;

  beforeEach(() => {
    vi.clearAllMocks();
    contexto = crearRepositorioEnMemoria({ [ANA]: "Ana Sintética" });
    simulacro.repositorio = contexto.repositorio;
    simulacro.actor.mockResolvedValue(finanzas);
  });

  const registrar = (campos: Record<string, string> = {}) => registrarImporteDesdeFormulario({}, formulario({
    tipoDeFuente: "comisiones_de_ventas", dni: ANA, concepto: "comision_de_ventas", fechaDelHecho: "2026-09-28", mesDeDevengue: "2026-09", mesDeAplicacion: "2026-10", monto: "250", ...campos,
  }));

  it("Finanzas registra un importe y se refrescan las pantallas de Fuentes externas", async () => {
    expect(await registrar()).toEqual({ listo: 1, aviso: undefined });

    expect(contexto.importes()).toMatchObject([{ dni: ANA, concepto: "comision_de_ventas", monto: 25000, procedencia: "carga_manual", registradoPorId: "fin-1" }]);
    expect(simulacro.revalidar).toHaveBeenCalledWith("/pagos/fuentes-externas");
    expect(simulacro.revalidar).toHaveBeenCalledWith("/pagos/fuentes-externas/[tipo]", "page");
  });

  it("los errores vuelven junto al formulario y no guardan nada", async () => {
    expect(await registrar({ monto: "abc" })).toMatchObject({ error: expect.stringContaining("importe debe ser un monto") });
    expect(await registrar({ concepto: "horas_extra_25" })).toMatchObject({ error: expect.stringContaining("línea calculada") });
    expect(await registrar({ dni: "99999999" })).toEqual({ error: "No existe una persona con DNI 99999999." });
    expect(await registrar({ mesDeDevengue: "2026-13" })).toMatchObject({ error: expect.stringContaining("mes de devengue no es válido") });
    expect(await registrar({ monto: "" })).toEqual({ error: "Falta el importe." });
    expect(contexto.importes()).toEqual([]);
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it("un duplicado se rechaza con su mensaje", async () => {
    await registrar();

    expect(await registrar()).toMatchObject({ error: expect.stringContaining("Ya existe ese importe") });
    expect(contexto.importes()).toHaveLength(1);
  });

  it("confirma, avisa cuando un cambio devuelve la fuente a Pendiente y vuelve a pendiente a pedido", async () => {
    expect(await confirmarFuenteDesdeFormulario({}, formulario({ tipoDeFuente: "comisiones_de_ventas", mes: "2026-10" }))).toEqual({ listo: 1, aviso: undefined });
    expect(contexto.confirmaciones()).toHaveLength(1);

    expect(await registrar()).toEqual({ listo: 1, aviso: expect.stringContaining("volvió a Pendiente") });
    expect(contexto.confirmaciones()).toHaveLength(0);

    await confirmarFuenteDesdeFormulario({}, formulario({ tipoDeFuente: "adelantos", mes: "2026-10" }));
    expect(await volverAPendienteDesdeFormulario({}, formulario({ tipoDeFuente: "adelantos", mes: "2026-10" }))).toEqual({ listo: 1, aviso: undefined });
    expect(contexto.confirmaciones()).toHaveLength(0);
  });

  it("anula con motivo y rechaza una anulación sin motivo", async () => {
    await registrar();
    const [importe] = contexto.importes();

    expect(await anularImporteDesdeFormulario({}, formulario({ importeId: importe.id }))).toEqual({ error: "Falta el motivo de la anulación." });
    expect(await anularImporteDesdeFormulario({}, formulario({ importeId: importe.id, motivo: "Monto mal digitado" }))).toEqual({ listo: 1, aviso: undefined });
    expect(contexto.importes()[0]).toMatchObject({ motivoDeAnulacion: "Monto mal digitado" });
  });

  it.each([
    ["el Administrador del sistema", { id: "adm-1", rol: "administrador" }],
    ["Recursos Humanos", { id: "rrhh-1", rol: "recursos_humanos" }],
    ["un gerente de área", { id: "ger-1", rol: "gerente_de_area", grupos: [{ nombre: "Taller", gestionaAsistencia: true }] }],
  ])("%s no puede registrar, anular ni confirmar: el servidor responde sin permiso y no cambia nada", async (_nombre, actor) => {
    await registrar();
    const [existente] = contexto.importes();
    simulacro.actor.mockResolvedValue(actor);
    const sinPermiso = { error: "No tiene permiso para consultar ni editar Pagos." };

    expect(await registrar({ monto: "1" })).toEqual(sinPermiso);
    expect(await anularImporteDesdeFormulario({}, formulario({ importeId: existente.id, motivo: "Intento" }))).toEqual(sinPermiso);
    expect(await confirmarFuenteDesdeFormulario({}, formulario({ tipoDeFuente: "adelantos", mes: "2026-10" }))).toEqual(sinPermiso);
    expect(await volverAPendienteDesdeFormulario({}, formulario({ tipoDeFuente: "adelantos", mes: "2026-10" }))).toEqual(sinPermiso);
    expect(contexto.importes()).toHaveLength(1);
    expect(contexto.importes()[0].anuladoEn).toBeNull();
    expect(contexto.confirmaciones()).toHaveLength(0);
  });

  it("sin sesión el servidor rechaza", async () => {
    simulacro.actor.mockRejectedValue(new Error("La sesión no es válida."));

    expect(await registrar()).toEqual({ error: "La sesión no es válida." });
    expect(contexto.importes()).toEqual([]);
  });
});
