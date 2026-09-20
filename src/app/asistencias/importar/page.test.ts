import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const obtenerActorActual = vi.fn();
const formularioDeImportacion = vi.fn(() => createElement("output", undefined, "formulario"));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual }));
vi.mock("../formulario-de-importacion", () => ({ FormularioDeImportacion: formularioDeImportacion }));

describe("página de importación de asistencias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerActorActual.mockResolvedValue({ rol: "administracion" });
  });

  it("muestra un formulario autosuficiente para una persona autorizada", async () => {
    const { default: PaginaDeImportacionDeAsistencias } = await import("./page");
    const html = renderToStaticMarkup(await PaginaDeImportacionDeAsistencias());

    expect(formularioDeImportacion).toHaveBeenCalledWith({}, undefined);
    expect(html).toContain("formulario");
  });
  it("usa el estado vacío compartido para un rol sin permiso", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "operaciones" });
    const { default: PaginaDeImportacionDeAsistencias } = await import("./page");
    const html = renderToStaticMarkup(await PaginaDeImportacionDeAsistencias());

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("Sin permiso");
    expect(html).toContain("Administración y Finanzas");
    expect(formularioDeImportacion).not.toHaveBeenCalled();
  });
});
