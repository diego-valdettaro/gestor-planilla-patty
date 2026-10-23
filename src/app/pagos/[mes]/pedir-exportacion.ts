export const MENSAJE_DE_ERROR_AL_EXPORTAR = "No se pudo generar el archivo";

export type ResultadoDePedirExportacion = { estado: "descargado"; nombre: string; contenido: Blob } | { estado: "error"; mensaje: string };

/** Pide el XLSX a la ruta de descarga; cualquier fallo (permiso, mes sin datos, servidor, red) se informa igual, sin filtrar detalles técnicos. */
export async function pedirExportacion(href: string, buscar: typeof fetch = fetch): Promise<ResultadoDePedirExportacion> {
  try {
    const respuesta = await buscar(href, { credentials: "same-origin" });
    if (!respuesta.ok) return { estado: "error", mensaje: MENSAJE_DE_ERROR_AL_EXPORTAR };
    const nombre = /filename="([^"]+)"/.exec(respuesta.headers.get("content-disposition") ?? "")?.[1] ?? "preliquidacion.xlsx";
    return { estado: "descargado", nombre, contenido: await respuesta.blob() };
  } catch {
    return { estado: "error", mensaje: MENSAJE_DE_ERROR_AL_EXPORTAR };
  }
}
