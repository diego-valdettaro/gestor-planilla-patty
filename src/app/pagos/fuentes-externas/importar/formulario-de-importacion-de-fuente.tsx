"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { formatearSoles } from "@/condiciones-laborales/valores";
import { formatearMes } from "@/fuentes-externas/valores";

import { useDialogo } from "../../usar-dialogo";

import { procesarArchivoDeFuente, type EstadoDeImportacionDeFuente, type VistaDeArchivoDeFuente } from "./actions";

const estadoInicial: EstadoDeImportacionDeFuente = {};
const MAXIMO_DE_ERRORES_VISIBLES = 100;
// Next.js rechaza el cuerpo de una acción de servidor mayor que 1 MB con un error opaco: se avisa antes de enviar.
const MAXIMO_DE_BYTES_DEL_ARCHIVO = 1024 * 1024;

type AccionEnCurso = "validar" | "importar";

/** Diseño de interacción 4.5: archivo, vista previa con la validación y, solo sin errores, «Importar N filas» con su diálogo (6.4). */
export function FormularioDeImportacionDeFuente({ tipos, tipoInicial, mes }: { tipos: Array<{ codigo: string; nombre: string }>; tipoInicial: string; mes: string }) {
  const [estado, accion, pendiente] = useActionState(procesarArchivoDeFuente, estadoInicial);
  const [tipo, setTipo] = useState(tipoInicial);
  const [accionEnCurso, setAccionEnCurso] = useState<AccionEnCurso>("validar");
  // El archivo o el tipo cambiaron después de validar: la vista previa ya no describe lo que se va a importar.
  const [obsoletaDe, setObsoletaDe] = useState<EstadoDeImportacionDeFuente | undefined>();
  const { dialogo, titulo, abrir } = useDialogo(undefined);
  const archivoInput = useRef<HTMLInputElement>(null);
  const archivoSeleccionado = useRef<File | null>(null);
  const resultado = useRef<HTMLElement>(null);
  const tituloDeResultadoId = useId();
  const ayudaDeArchivoId = useId();

  const vista = estado.vista && obsoletaDe !== estado ? estado.vista : undefined;
  const sinErrores = vista !== undefined && vista.errores.length === 0;

  useEffect(() => { dialogo.current?.close(); }, [estado, dialogo]);

  // React limpia el input de archivo, sin controlarlo, tras cada envío de la acción; sin reponerlo, importar volvería a pedir el archivo.
  useEffect(() => {
    if (!estado.vista || !archivoSeleccionado.current || !archivoInput.current) return;
    const transferencia = new DataTransfer();
    transferencia.items.add(archivoSeleccionado.current);
    archivoInput.current.files = transferencia.files;
  }, [estado]);

  useEffect(() => { if (estado.resultado) resultado.current?.focus(); }, [estado.resultado]);

  const tipoElegido = tipos.find((candidato) => candidato.codigo === tipo);
  const invalidar = () => setObsoletaDe(estado);

  return <>
    <form action={accion} className="formulario-dialogo formulario-de-importacion-de-fuente">
      <input name="mes" type="hidden" value={mes} />
      <label>Tipo de fuente
        <select name="tipoDeFuente" onChange={(evento) => { setTipo(evento.target.value); invalidar(); }} value={tipo}>
          {tipos.map((opcion) => <option key={opcion.codigo} value={opcion.codigo}>{opcion.nombre}</option>)}
        </select>
      </label>
      <label>Archivo XLSX normalizado
        <input
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-describedby={ayudaDeArchivoId}
          name="archivo"
          onChange={(evento) => {
            archivoSeleccionado.current = evento.target.files?.[0] ?? null;
            evento.target.setCustomValidity(archivoSeleccionado.current && archivoSeleccionado.current.size > MAXIMO_DE_BYTES_DEL_ARCHIVO ? "El archivo supera 1 MB. Divida el listado en varios archivos por tipo de fuente." : "");
            invalidar();
          }}
          ref={archivoInput}
          required
          type="file"
        />
      </label>
      <small className="linea-de-relacion" id={ayudaDeArchivoId}>
        Hoja «Importes» con las columnas DNI, Concepto, Fecha del hecho, Mes de devengue e Importe. Los importes se aplican en el mes de pago {formatearMes(mes)}.{" "}
        <a download href={`/pagos/fuentes-externas/plantilla?tipo=${tipo}`}>Descargar plantilla normalizada<span className="sr-only"> de {tipoElegido?.nombre}</span></a>
      </small>

      {pendiente && <p className="mensaje-operacion" role="status">{accionEnCurso === "validar" ? "Validando archivo…" : "Importando archivo…"}</p>}
      {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
      {vista && <VistaPrevia vista={vista} />}

      <div className="acciones-dialogo">
        <button className={sinErrores ? "boton-secundario" : "boton-principal"} disabled={pendiente} name="accion" onClick={() => setAccionEnCurso("validar")} type="submit" value="validar">
          {pendiente && accionEnCurso === "validar" ? "Validando archivo…" : "Validar archivo"}
        </button>
        {vista && (sinErrores
          ? <button aria-haspopup="dialog" className="boton-principal" disabled={pendiente} onClick={abrir} type="button">Importar {vista.resumen.filasValidas} {vista.resumen.filasValidas === 1 ? "fila" : "filas"}</button>
          : <><button className="boton-secundario" disabled type="button">Importar</button><small className="linea-de-relacion">Corrija el archivo y vuelva a validarlo.</small></>)}
      </div>

      {vista && sinErrores && <dialog aria-labelledby={`${tituloDeResultadoId}-dialogo`} className="dialogo-confirmacion dialogo-de-pagos" ref={dialogo}>
        <section>
          <h2 id={`${tituloDeResultadoId}-dialogo`} ref={titulo} tabIndex={-1}>¿Importar {vista.resumen.filasValidas} {vista.resumen.filasValidas === 1 ? "fila" : "filas"} de {vista.tipoNombre} de {formatearMes(vista.mes)}?</h2>
          <p>Alcance: tipo de fuente {vista.tipoNombre}. Mes de pago: {formatearMes(vista.mes)}. {vista.resumen.filasValidas} {vista.resumen.filasValidas === 1 ? "fila" : "filas"}, {formatearSoles(vista.resumen.total)}.</p>
          <p>Archivo: {vista.nombre} (hash {vista.hashAbreviado}).</p>
          <p>{consecuenciaDeImportar(vista)}</p>
          <p>Cancelar no importa nada.</p>
          <div className="acciones-dialogo">
            <button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button>
            <button className="boton-principal" disabled={pendiente} name="accion" onClick={() => setAccionEnCurso("importar")} type="submit" value="importar">{pendiente && accionEnCurso === "importar" ? "Importando…" : `Importar ${vista.resumen.filasValidas} ${vista.resumen.filasValidas === 1 ? "fila" : "filas"}`}</button>
          </div>
        </section>
      </dialog>}
    </form>

    {estado.resultado && <section aria-labelledby={tituloDeResultadoId} className="mensaje-operacion listo" ref={resultado} role="status" tabIndex={-1}>
      <h2 id={tituloDeResultadoId}>Archivo importado</h2>
      <p>Se importaron {estado.resultado.filas} {estado.resultado.filas === 1 ? "fila" : "filas"} ({formatearSoles(estado.resultado.total)}) de {estado.resultado.tipoNombre} para el mes de pago {formatearMes(estado.resultado.mes)}.</p>
      <p>Archivo {estado.resultado.nombre} · hash {estado.resultado.hashAbreviado} · importado por {estado.resultado.responsable} el {estado.resultado.fecha}.</p>
      {estado.resultado.reemplazo && <p>Reemplazó las filas del archivo anterior ({estado.resultado.reemplazo}).</p>}
      <p>{estado.resultado.volvioAPendiente ? "La fuente estaba confirmada y volvió a Pendiente: confirme de nuevo su listado." : "Importar no confirma la fuente: confirme su listado cuando esté completo."}</p>
      <p><Link href={`/pagos/fuentes-externas?mes=${estado.resultado.mes}`}>Volver a fuentes externas</Link></p>
    </section>}
  </>;
}

function consecuenciaDeImportar(vista: VistaDeArchivoDeFuente): string {
  if (vista.reemplaza) return "Reemplaza las filas del archivo anterior y devuelve la fuente a Pendiente.";
  if (vista.fuenteConfirmada) return "La fuente está confirmada: al importar vuelve a Pendiente y habrá que confirmar su listado otra vez.";
  return "Las filas se suman a la fuente. Importar no la confirma: la confirmación del listado es una acción aparte.";
}

function VistaPrevia({ vista }: { vista: VistaDeArchivoDeFuente }) {
  const { resumen, errores } = vista;
  const visibles = errores.slice(0, MAXIMO_DE_ERRORES_VISIBLES);
  return <section aria-label="Resultado de la validación" className="resultado-de-validacion">
    <h2>Resultado de la validación</h2>
    <p>{vista.nombre} · hash {vista.hashAbreviado} · {vista.tipoNombre} · mes de pago {formatearMes(vista.mes)}</p>
    <dl className="resumen-de-validacion">
      <div><dt>Filas válidas</dt><dd>{resumen.filasValidas}</dd></div>
      <div><dt>Filas con error</dt><dd>{resumen.filasConError}</dd></div>
      <div><dt>Duplicadas</dt><dd>{resumen.duplicadas}</dd></div>
      <div><dt>Personas desconocidas</dt><dd>{resumen.personasDesconocidas}</dd></div>
      <div><dt>Total de filas válidas</dt><dd>{formatearSoles(resumen.total)}</dd></div>
    </dl>
    {vista.reemplaza && <p className="mensaje-operacion advertencia">Ya hay un archivo de {vista.tipoNombre} para este mes ({vista.reemplaza.archivoNombre}, importado por {vista.reemplaza.importadoPor} el {vista.reemplaza.importadaEn}). Importar este lo reemplaza.</p>}
    {errores.length > 0
      ? <section className="mensaje-operacion error" role="alert">
        <p>El archivo tiene {errores.length === 1 ? "1 error" : `${errores.length} errores`}: no se importa ninguna fila hasta corregirlo.</p>
        <ul className="errores-importacion">{visibles.map((error, indice) => <li key={`${error.fila}-${indice}`}>Fila {error.fila}{error.dni ? ` · ${error.dni}` : ""} · {error.motivo}</li>)}</ul>
        {errores.length > visibles.length && <p>Se muestran los primeros {visibles.length} de {errores.length} errores.</p>}
      </section>
      : <p className="mensaje-operacion listo">El archivo no tiene errores. Revise los conteos y pulse «Importar».</p>}
  </section>;
}
