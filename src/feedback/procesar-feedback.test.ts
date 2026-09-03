import { describe, expect, it, vi } from "vitest";

import { procesarFeedback } from "./procesar-feedback";

describe("procesarFeedback", () => {
  it("transforma un comentario válido en un issue listo para un Ralph loop", async () => {
    const analizar = vi.fn().mockResolvedValue({
      titulo: "Mostrar el total semanal",
      resumen: "El responsable no ve el total de horas planificadas.",
      criteriosDeAceptacion: ["La grilla muestra el total por persona."],
    });
    const crearIssue = vi.fn().mockResolvedValue({ url: "https://github.com/diego-valdettaro/gestor-planilla-patty/issues/15" });

    await expect(procesarFeedback({
      comentario: "Necesito ver el total semanal por persona.",
      ruta: "/turnos",
      rol: "operaciones",
    }, { analizar, crearIssue })).resolves.toEqual({ url: "https://github.com/diego-valdettaro/gestor-planilla-patty/issues/15" });

    expect(analizar).toHaveBeenCalledWith(expect.objectContaining({ comentario: "Necesito ver el total semanal por persona." }));
    expect(crearIssue).toHaveBeenCalledWith(expect.objectContaining({ titulo: "Mostrar el total semanal" }), expect.objectContaining({ ruta: "/turnos" }));
  });

  it("no llama servicios externos cuando el comentario está vacío", async () => {
    const analizar = vi.fn();
    const crearIssue = vi.fn();

    await expect(procesarFeedback({ comentario: "  ", ruta: "/turnos", rol: "operaciones" }, { analizar, crearIssue }))
      .rejects.toThrow("Escriba un comentario antes de enviarlo.");

    expect(analizar).not.toHaveBeenCalled();
    expect(crearIssue).not.toHaveBeenCalled();
  });
});
