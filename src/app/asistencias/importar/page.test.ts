import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const obtenerActorActual = vi.fn();
const listarSedesConColaboradoresActivos = vi.fn();
const formularioDeImportacion = vi.fn(({ sedes }: { sedes: string[] }) => createElement("output", undefined, sedes.join(", ")));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual }));
vi.mock("@/turnos/servicio", () => ({ repositorioDeTurnos: { listarSedesConColaboradoresActivos } }));
vi.mock("../formulario-de-importacion", () => ({ FormularioDeImportacion: formularioDeImportacion }));

describe("página de importación de asistencias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerActorActual.mockResolvedValue({ rol: "administracion" });
    listarSedesConColaboradoresActivos.mockResolvedValue(["Centro"]);
  });

  it("carga las sedes y conserva el formulario para una persona autorizada", async () => {
    const { default: PaginaDeImportacionDeAsistencias } = await import("./page");

    const html = renderToStaticMarkup(await PaginaDeImportacionDeAsistencias());

    expect(listarSedesConColaboradoresActivos).toHaveBeenCalledOnce();
    expect(formularioDeImportacion).toHaveBeenCalledWith({ sedes: ["Centro"] }, undefined);
    expect(html).toContain("Centro");
  });
});
