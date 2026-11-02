import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({
  actor: vi.fn(),
  registrar: vi.fn(),
  revalidar: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: simulacro.revalidar }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/fuentes-externas/incidencias-y-ajustes", () => ({ registrarIncidencia: simulacro.registrar }));
vi.mock("@/fuentes-externas/servicio", () => ({ repositorioDeFuentesExternas: {} }));

import { registrarIncidenciaDeTienda } from "./actions";

describe("G17 acción de incidencia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    simulacro.actor.mockResolvedValue({ id: "gerente-1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] });
  });

  it("registra una incidencia propia pendiente y devuelve el mensaje de resultado", async () => {
    simulacro.registrar.mockResolvedValue({ estadoDeIncidencia: "sin_sustento" });
    const datos = formulario({ dni: "00001024", fechaDelHecho: "2026-10-26", monto: "80,50", motivo: "Producto dañado" });

    await expect(registrarIncidenciaDeTienda({}, datos)).resolves.toEqual({ listo: "La incidencia quedó registrada para revisión." });
    expect(simulacro.registrar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "gerente-1" }), {
      dni: "00001024", fechaDelHecho: "2026-10-26", monto: "80,50", motivo: "Producto dañado",
    });
    expect(simulacro.revalidar).toHaveBeenCalledWith("/asistencias");
  });

  it("muestra error y no registra con motivo vacío", async () => {
    await expect(registrarIncidenciaDeTienda({}, formulario({ dni: "00001024", fechaDelHecho: "2026-10-26", monto: "80,50", motivo: "  " })))
      .resolves.toEqual({ error: "El campo motivo es obligatorio." });
    expect(simulacro.registrar).not.toHaveBeenCalled();
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it("muestra el rechazo del dominio si el DNI no pertenece a los grupos autorizados", async () => {
    simulacro.registrar.mockRejectedValue(new Error("No tiene permiso para registrar incidencias de esta persona."));
    await expect(registrarIncidenciaDeTienda({}, formulario({ dni: "00001025", fechaDelHecho: "2026-10-26", monto: "80,50", motivo: "Producto dañado" })))
      .resolves.toEqual({ error: "No tiene permiso para registrar incidencias de esta persona." });
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });
});

function formulario(valores: Record<string, string>): FormData {
  const datos = new FormData();
  Object.entries(valores).forEach(([nombre, valor]) => datos.set(nombre, valor));
  return datos;
}
