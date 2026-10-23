"use client";

import { useState } from "react";

import { pedirExportacion } from "./pedir-exportacion";

export const AYUDA_DE_LA_EXPORTACION = "No es una planilla oficial ni sustituye PLAME. Para el resumen de asistencia, use la exportación del período.";

/**
 * Acción secundaria «Exportar preliquidación (XLSX)» (interacción 4.8). Es un enlace a la ruta de descarga, de modo que funciona también sin JavaScript;
 * con JavaScript pide el archivo, muestra «Preparando archivo…» y, si falla, «No se pudo generar el archivo» con `role="alert"`.
 * `sinDatos` deshabilita la acción y explica por qué (mes sin personas).
 */
export function ExportacionDePreliquidacion({ href, etiqueta, sinDatos }: { href: string; etiqueta: string; sinDatos?: string }) {
  const [preparando, setPreparando] = useState(false);
  const [error, setError] = useState<string>();

  if (sinDatos) return <><button className="boton-secundario" disabled type="button">{etiqueta}</button><small className="linea-de-relacion">{sinDatos}</small></>;

  async function descargar(evento: React.MouseEvent<HTMLAnchorElement>) {
    evento.preventDefault();
    if (preparando) return;
    setPreparando(true);
    setError(undefined);
    const resultado = await pedirExportacion(href);
    setPreparando(false);
    if (resultado.estado === "error") return setError(resultado.mensaje);
    const url = URL.createObjectURL(resultado.contenido);
    const enlace = Object.assign(document.createElement("a"), { href: url, download: resultado.nombre });
    enlace.click();
    URL.revokeObjectURL(url);
  }

  return <>
    <a aria-disabled={preparando} className="boton-secundario" download href={href} onClick={descargar}>{preparando ? "Preparando archivo…" : etiqueta}</a>
    <small className="linea-de-relacion">{AYUDA_DE_LA_EXPORTACION}</small>
    {error && <p className="mensaje-operacion error" role="alert">{error}</p>}
  </>;
}
