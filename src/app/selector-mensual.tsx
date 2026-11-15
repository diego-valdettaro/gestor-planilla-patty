"use client";

import React, { useEffect, useState } from "react";

export function SelectorMensual({ mes, alSeleccionar, disabled = false }: { mes: string; alSeleccionar: (mes: string) => void; disabled?: boolean }) {
  const anio = mes.slice(0, 4);
  const [anioEditado, editarAnio] = useState(anio);
  useEffect(() => editarAnio(anio), [anio]);
  function desplazar(cantidad: number) {
    const fecha = new Date(`${mes}-01T00:00:00Z`);
    fecha.setUTCMonth(fecha.getUTCMonth() + cantidad);
    alSeleccionar(fecha.toISOString().slice(0, 7));
  }
  return <section aria-label="Selector mensual" className="selector-mensual">
    <button aria-label="Mes anterior" className="boton-secundario" disabled={disabled} onClick={() => desplazar(-1)} type="button">‹</button>
    <label>Mes<select aria-label="Mes" disabled={disabled} value={mes.slice(5, 7)} onChange={e => alSeleccionar(`${anio}-${e.target.value}`)}>{Array.from({ length: 12 }, (_, i) => { const numero = String(i + 1).padStart(2, "0"); return <option key={numero} value={numero}>{new Intl.DateTimeFormat("es-PE", { month: "long", timeZone: "UTC" }).format(new Date(`2000-${numero}-01T00:00:00Z`))}</option>; })}</select></label>
    <label>Año<input aria-label="Año" disabled={disabled} type="number" min="1900" max="9999" value={anioEditado} onChange={e => { editarAnio(e.target.value); if (/^\d{4}$/.test(e.target.value) && Number(e.target.value) >= 1900) alSeleccionar(`${e.target.value}-${mes.slice(5, 7)}`); }} /></label>
    <button aria-label="Mes siguiente" className="boton-secundario" disabled={disabled} onClick={() => desplazar(1)} type="button">›</button>
  </section>;
}
