"use client";

import { useActionState, useEffect, useRef } from "react";

import type { CategoriaDeFila, FilaClasificada, VistaPreviaDeImportacion } from "@/importaciones/importar-semana-por-sede";

import { importarAsistencia, type EstadoDeImportacion } from "./actions";

const estadoInicial: EstadoDeImportacion = {};

const etiquetaDeCategoria: Record<CategoriaDeFila, string> = {
  nuevo: "Nueva",
  igual: "Sin cambios",
  pendiente: "Pendiente que cambia",
  confirmado: "Confirmada que cambiaría",
};

function ListaDeFilas({ filas }: { filas: FilaClasificada[] }) {
  return <ul className="filas-importacion">
    {filas.map((fila) => <li key={`${fila.fila}-${fila.idHuellero}-${fila.fecha}`}>
      Fila {fila.fila} · {fila.idHuellero} · {fila.fecha}: {etiquetaDeCategoria[fila.categoria]}
    </li>)}
  </ul>;
}

function ResumenDeVistaPrevia({ vistaPrevia }: { vistaPrevia: VistaPreviaDeImportacion }) {
  return <>
    <ul>
      <li>Nuevas: {vistaPrevia.conteos.nuevo}</li>
      <li>Sin cambios: {vistaPrevia.conteos.igual}</li>
      <li>Pendientes que cambian: {vistaPrevia.conteos.pendiente}</li>
      <li>Confirmadas que cambiarían: {vistaPrevia.conteos.confirmado}</li>
    </ul>
    <ListaDeFilas filas={vistaPrevia.filas} />
  </>;
}

export function FormularioDeImportacion() {
  const [estado, accion, pendiente] = useActionState(importarAsistencia, estadoInicial);
  const dialogo = useRef<HTMLDialogElement>(null);
  const archivoInput = useRef<HTMLInputElement>(null);
  const archivoSeleccionado = useRef<File | null>(null);
  const conteoConfirmado = estado.vistaPrevia?.conteos.confirmado ?? 0;

  useEffect(() => {
    if (conteoConfirmado > 0) dialogo.current?.showModal();
  }, [estado.vistaPrevia, conteoConfirmado]);

  useEffect(() => {
    if (estado.resultado || estado.error || estado.errores) dialogo.current?.close();
  }, [estado.resultado, estado.error, estado.errores]);

  // React limpia el input de archivo, sin controlarlo, tras cada envío exitoso de la acción.
  // Antes de mostrar la confirmación hay que reponerlo para que el segundo envío (Confirmar
  // reemplazo) siga incluyendo el mismo archivo.
  useEffect(() => {
    if (!estado.vistaPrevia || !archivoSeleccionado.current || !archivoInput.current) return;
    const transferencia = new DataTransfer();
    transferencia.items.add(archivoSeleccionado.current);
    archivoInput.current.files = transferencia.files;
  }, [estado.vistaPrevia]);

  return <section className="tarjeta importacion-asistencia">
    <header className="encabezado-seccion"><div><h2>Importar asistencias</h2><p>Use un XLSX con la hoja Asistencias y las columnas ID de huellero, Sede, Fecha, Entrada y Salida.</p></div></header>
    <form action={accion} className="filtros">
      <label>Archivo XLSX de asistencias<input
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        name="archivo"
        onChange={(evento) => { archivoSeleccionado.current = evento.target.files?.[0] ?? null; }}
        ref={archivoInput}
        required
        type="file"
      /></label>
      <button disabled={pendiente} type="submit">{pendiente ? "Importando…" : "Importar"}</button>
      <dialog aria-labelledby="titulo-confirmacion-importacion" className="dialogo-confirmacion" ref={dialogo}>
        <section>
          <header>
            <h2 id="titulo-confirmacion-importacion">Confirmar reemplazo de asistencias confirmadas</h2>
            <p>La carga reemplazaría {conteoConfirmado} jornada{conteoConfirmado === 1 ? "" : "s"} ya confirmada{conteoConfirmado === 1 ? "" : "s"}. Se conservará el valor anterior para auditoría y esas jornadas volverán a quedar pendientes de revisión.</p>
          </header>
          {estado.vistaPrevia && <ResumenDeVistaPrevia vistaPrevia={estado.vistaPrevia} />}
          <footer className="acciones-dialogo">
            <button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button>
            <button className="boton-principal" disabled={pendiente} name="confirmarReemplazoDeConfirmadas" type="submit" value="true">{pendiente ? "Confirmando…" : "Confirmar reemplazo"}</button>
          </footer>
        </section>
      </dialog>
    </form>
    {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
    {estado.errores && <section className="mensaje-operacion error" role="alert"><p>La importación no se guardó. Corrija el XLSX o el horario publicado y vuelva a intentarlo.</p><ul className="errores-importacion">{estado.errores.map((error, indice) => <li key={`${error.fila}-${error.idHuellero}-${error.fecha}-${indice}`}>Fila {error.fila}{error.idHuellero ? ` · ${error.idHuellero}` : ""}{error.fecha ? ` · ${error.fecha}` : ""}: {error.motivo}</li>)}</ul></section>}
    {estado.resultado && <section className="mensaje-operacion listo" role="status">
      <p>Se importaron {estado.resultado.jornadas} jornadas. Quedan pendientes de revisión.</p>
      {estado.vistaPrevia && <ResumenDeVistaPrevia vistaPrevia={estado.vistaPrevia} />}
    </section>}
  </section>;
}
