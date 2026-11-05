"use client";

import Link from "next/link";
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

const claseDeInsigniaDeCategoria: Record<CategoriaDeFila, string> = {
  nuevo: "ok",
  igual: "neutro",
  pendiente: "aviso",
  confirmado: "error",
};

function TablaDeFilas({ filas }: { filas: FilaClasificada[] }) {
  return <div className="panel-tabla tabla-de-importacion" tabIndex={0}>
    <table>
      <thead><tr><th className="numerico" scope="col">Fila</th><th scope="col">DNI</th><th scope="col">Fecha</th><th scope="col">Resultado</th></tr></thead>
      <tbody>{filas.map((fila) => <tr key={`${fila.fila}-${fila.dni}-${fila.fecha}`}>
        <td className="numerico">{fila.fila}</td><td>{fila.dni}</td><td>{fila.fecha}</td>
        <td><span className={`insignia ${claseDeInsigniaDeCategoria[fila.categoria]}`}>{etiquetaDeCategoria[fila.categoria]}</span></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function ResumenDeVistaPrevia({ vistaPrevia }: { vistaPrevia: VistaPreviaDeImportacion }) {
  return <>
    <dl className="resumen-de-validacion">
      <div><dt>Nuevas</dt><dd>{vistaPrevia.conteos.nuevo}</dd></div>
      <div><dt>Sin cambios</dt><dd>{vistaPrevia.conteos.igual}</dd></div>
      <div><dt>Pendientes que cambian</dt><dd>{vistaPrevia.conteos.pendiente}</dd></div>
      <div><dt>Confirmadas que cambiarían</dt><dd>{vistaPrevia.conteos.confirmado}</dd></div>
    </dl>
    <TablaDeFilas filas={vistaPrevia.filas} />
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

  return <>
    <section aria-labelledby="titulo-importar-asistencias" className="tile panel importacion-asistencia">
      <header className="panel-cabecera"><div><h2 id="titulo-importar-asistencias">Importar asistencias</h2><p>Use un XLSX con la hoja Asistencias y las columnas DNI, Sede, Fecha, Entrada y Salida.</p></div></header>
      <form action={accion} className="formulario-dialogo formulario-de-importacion">
        <label>Archivo XLSX de asistencias<input
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          name="archivo"
          onChange={(evento) => { archivoSeleccionado.current = evento.target.files?.[0] ?? null; }}
          ref={archivoInput}
          required
          type="file"
        /></label>
        {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
        <div className="acciones-formulario">
          <button className="boton-principal" disabled={pendiente} type="submit">{pendiente ? "Importando…" : "Importar"}</button>
          <Link className="boton-secundario" href="/asistencias">Cancelar</Link>
        </div>
        <dialog aria-labelledby="titulo-confirmacion-importacion" className="dialogo-confirmacion dialogo-de-importacion" ref={dialogo}>
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
    </section>
    {estado.errores && <section aria-labelledby="titulo-resultado-importacion" className="tile panel">
      <header className="panel-cabecera"><div><h2 id="titulo-resultado-importacion">Resultado de la importación</h2></div><span className="insignia error">No se guardó nada</span></header>
      <div className="mensaje-operacion error" role="alert"><p>La importación no se guardó. Corrija el XLSX o el horario publicado y vuelva a intentarlo.</p></div>
      <div className="panel-tabla tabla-de-importacion" tabIndex={0}>
        <table>
          <thead><tr><th className="numerico" scope="col">Fila</th><th scope="col">DNI</th><th scope="col">Fecha</th><th scope="col">Motivo</th></tr></thead>
          <tbody>{estado.errores.map((error, indice) => <tr key={`${error.fila}-${error.dni}-${error.fecha}-${indice}`}><td className="numerico">{error.fila}</td><td>{error.dni || "—"}</td><td>{error.fecha || "—"}</td><td>{error.motivo}</td></tr>)}</tbody>
        </table>
      </div>
    </section>}
    {estado.resultado && <section aria-labelledby="titulo-resultado-importacion" className="tile panel">
      <header className="panel-cabecera"><div><h2 id="titulo-resultado-importacion">Resultado de la importación</h2></div><span className="insignia ok">Importado</span></header>
      <p className="mensaje-operacion listo" role="status">Se importaron {estado.resultado.jornadas} jornadas. Quedan pendientes de revisión.</p>
      {estado.vistaPrevia && <ResumenDeVistaPrevia vistaPrevia={estado.vistaPrevia} />}
      <div className="acciones-formulario"><Link className="boton-secundario" href="/asistencias">Ir a Registro de asistencias</Link></div>
    </section>}
  </>;
}
