import { describe, expect, it, vi } from "vitest";

import { MENSAJE_DE_ERROR_AL_EXPORTAR, pedirExportacion } from "./pedir-exportacion";

const respuesta = (cuerpo: BodyInit | null, init: ResponseInit) => vi.fn().mockResolvedValue(new Response(cuerpo, init));

describe("G11 descarga de la exportación desde el navegador", () => {
  it("F-25 una respuesta correcta entrega el archivo con el nombre que declara el servidor", async () => {
    const buscar = respuesta("contenido", { status: 200, headers: { "Content-Disposition": 'attachment; filename="preliquidacion-2026-10-version-2.xlsx"' } });
    const resultado = await pedirExportacion("/pagos/2026-10/exportar?version=2", buscar);

    expect(buscar).toHaveBeenCalledWith("/pagos/2026-10/exportar?version=2", { credentials: "same-origin" });
    expect(resultado.estado).toBe("descargado");
    if (resultado.estado !== "descargado") return;
    expect(resultado.nombre).toBe("preliquidacion-2026-10-version-2.xlsx");
    expect(await resultado.contenido.text()).toBe("contenido");
  });

  it.each([
    ["sin permiso", () => respuesta("No autorizado", { status: 403 })],
    ["mes sin datos", () => respuesta("No hay datos", { status: 422 })],
    ["error del servidor", () => respuesta("fallo", { status: 500 })],
    ["sin conexión", () => vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))],
  ])("F-25 %s se informa como «No se pudo generar el archivo»", async (_caso, crear) => {
    expect(await pedirExportacion("/pagos/2026-10/exportar", crear())).toEqual({ estado: "error", mensaje: MENSAJE_DE_ERROR_AL_EXPORTAR });
    expect(MENSAJE_DE_ERROR_AL_EXPORTAR).toBe("No se pudo generar el archivo");
  });

  it("F-25 sin nombre en la respuesta usa uno genérico de preliquidación", async () => {
    const resultado = await pedirExportacion("/pagos/2026-10/exportar", respuesta("x", { status: 200 }));
    expect(resultado).toMatchObject({ estado: "descargado", nombre: "preliquidacion.xlsx" });
  });
});
