"use client";

import { useActionState, useEffect, useId, useState } from "react";

import { AFILIACIONES, DATOS_LABORALES, ESQUEMAS_DE_COMISION, NOMBRE_DE_AFILIACION, NOMBRE_DE_DATO, NOMBRE_DE_ESQUEMA, NOMBRE_DE_REGIMEN, REGIMENES, enMinuscula, type DatoLaboral } from "@/condiciones-laborales/catalogo";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";
import { desplazarFecha } from "@/turnos/semana";

import { useDialogo } from "../../usar-dialogo";
import { corregirCondicionDesdeFormulario, registrarCondicionDesdeFormulario, type EstadoDeFormularioDeCondicion } from "../actions";

const estadoInicial: EstadoDeFormularioDeCondicion = {};

/** Control del valor según el dato: importe, horas o una lista del catálogo; las sedes son las existentes y activas. */
function CampoDeValor({ dato, sedes }: { dato: DatoLaboral; sedes: string[] }) {
  switch (dato) {
    case "sueldo":
      return <label>Sueldo mensual (S/)<input autoComplete="off" inputMode="decimal" name="valor" placeholder="1800,00" required /></label>;
    case "jornada_ordinaria_diaria":
      return <label>Jornada ordinaria diaria (horas)<input autoComplete="off" inputMode="decimal" name="valor" placeholder="8" required /></label>;
    case "regimen_laboral":
      return <label>Régimen laboral<select defaultValue="" name="valor" required><option disabled value="">Elija un régimen…</option>{REGIMENES.map((regimen) => <option key={regimen} value={regimen}>{NOMBRE_DE_REGIMEN[regimen]}</option>)}</select></label>;
    case "afiliacion_pensionaria":
      return <label>Afiliación pensionaria<select defaultValue="" name="valor" required><option disabled value="">Elija una afiliación…</option>{AFILIACIONES.map((afiliacion) => <option key={afiliacion} value={afiliacion}>{NOMBRE_DE_AFILIACION[afiliacion]}</option>)}</select></label>;
    case "comision_afp":
      return <label>Esquema de comisión AFP<select defaultValue="" name="valor" required><option disabled value="">Elija un esquema…</option>{ESQUEMAS_DE_COMISION.map((esquema) => <option key={esquema} value={esquema}>{NOMBRE_DE_ESQUEMA[esquema]}</option>)}</select></label>;
    case "elegibilidad_familiar":
      return <label>Elegibilidad familiar<select defaultValue="" name="valor" required><option disabled value="">Elija una opción…</option><option value="si">Elegible</option><option value="no">No elegible</option></select></label>;
    case "sede_de_adscripcion":
      return <label>Sede de adscripción<select defaultValue="" name="valor" required><option disabled value="">Elija una sede…</option>{sedes.map((sede) => <option key={sede} value={sede}>{sede}</option>)}</select></label>;
  }
}

/** Diálogo 6.6: dato, valor y «Vigente desde», con el alcance y la consecuencia escritos antes de confirmar. */
export function RegistroDeCondicion({ relacionId, nombreDeLaPersona, sedes, limites, cese }: {
  relacionId: string;
  nombreDeLaPersona: string;
  sedes: string[];
  /** Por dato: primera fecha permitida y, si ya tiene valores, el inicio de su última vigencia. */
  limites: Record<DatoLaboral, { minimo: string; ultima?: string }>;
  cese: string | null;
}) {
  const [estado, accion, pendiente] = useActionState(registrarCondicionDesdeFormulario, estadoInicial);
  const [dato, setDato] = useState<DatoLaboral>("sueldo");
  const [desde, setDesde] = useState("");
  const { dialogo, titulo, abrir } = useDialogo(estado.listo);
  const tituloId = useId();
  // Tras guardar, el formulario vuelve a su estado inicial.
  useEffect(() => { if (estado.listo) { setDato("sueldo"); setDesde(""); } }, [estado.listo]);
  const nombreDelDato = enMinuscula(NOMBRE_DE_DATO[dato]);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(desde) ? formatearFechaDeRelacion(desde) : undefined;
  const { minimo, ultima } = limites[dato];

  return <>
    <button aria-haspopup="dialog" className="boton-principal" onClick={abrir} type="button">Registrar nuevo valor</button>
    <dialog aria-labelledby={tituloId} className="dialogo-confirmacion dialogo-de-pagos" ref={dialogo}>
      <form action={accion} key={estado.listo ?? 0}>
        <input name="relacionId" type="hidden" value={relacionId} />
        <h2 id={tituloId} ref={titulo} tabIndex={-1}>¿Registrar el nuevo {nombreDelDato} de {nombreDeLaPersona}{fecha ? ` desde el ${fecha}` : ""}?</h2>
        <div className="formulario-dialogo">
          <label>Dato<select name="dato" onChange={(evento) => setDato(evento.target.value as DatoLaboral)} value={dato}>{DATOS_LABORALES.map((opcion) => <option key={opcion} value={opcion}>{NOMBRE_DE_DATO[opcion]}</option>)}</select></label>
          <CampoDeValor dato={dato} key={dato} sedes={sedes} />
          <label>Vigente desde<input max={cese ?? undefined} min={minimo} name="vigenteDesde" onChange={(evento) => setDesde(evento.target.value)} required type="date" value={desde} /></label>
        </div>
        <p>Alcance: solo la relación laboral de {nombreDeLaPersona} y solo el dato {NOMBRE_DE_DATO[dato]}. {ultima
          ? `El valor anterior queda vigente hasta ${fecha ? `el ${formatearFechaDeRelacion(desplazarFecha(desde, -1))}` : "el día previo a la fecha elegida"} y no se reescribe. El valor nuevo debe empezar desde el ${formatearFechaDeRelacion(minimo)}.`
          : `Todavía no tiene un valor de ${nombreDelDato}: este será el primero y puede empezar desde el ${formatearFechaDeRelacion(minimo)}.`}</p>
        <p>Los borradores desde esa fecha usarán el nuevo valor. Las versiones finalizadas no cambian. Si necesita corregir un mes ya finalizado, use un ajuste de preliquidación.</p>
        <p>Cancelar no registra nada.</p>
        {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
        <div className="acciones-dialogo">
          <button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button>
          <button className="boton-principal" disabled={pendiente} type="submit">{pendiente ? "Registrando…" : "Registrar valor"}</button>
        </div>
      </form>
    </dialog>
  </>;
}

/** Corrección (D20): otro valor con la misma vigencia y un motivo obligatorio; el anterior queda «Reemplazado». */
export function CorreccionDeCondicion({ condicionId, dato, valorActual, vigenteDesde, nombreDeLaPersona, sedes }: {
  condicionId: string;
  dato: DatoLaboral;
  valorActual: string;
  vigenteDesde: string;
  nombreDeLaPersona: string;
  sedes: string[];
}) {
  const [estado, accion, pendiente] = useActionState(corregirCondicionDesdeFormulario, estadoInicial);
  const { dialogo, titulo, abrir } = useDialogo(estado.listo);
  const tituloId = useId();
  const nombreDelDato = enMinuscula(NOMBRE_DE_DATO[dato]);
  const fecha = formatearFechaDeRelacion(vigenteDesde);

  return <>
    <button aria-haspopup="dialog" className="boton-secundario" onClick={abrir} type="button">Corregir<span className="sr-only"> {nombreDelDato} vigente desde el {fecha}</span></button>
    <dialog aria-labelledby={tituloId} className="dialogo-confirmacion dialogo-de-pagos" ref={dialogo}>
      <form action={accion} key={estado.listo ?? 0}>
        <input name="condicionId" type="hidden" value={condicionId} />
        <h2 id={tituloId} ref={titulo} tabIndex={-1}>¿Reemplazar el {nombreDelDato} de {nombreDeLaPersona} vigente desde el {fecha}?</h2>
        <p>Alcance: solo este valor ({valorActual}) y solo su vigencia desde el {fecha}. El resto del historial no cambia.</p>
        <div className="formulario-dialogo">
          <CampoDeValor dato={dato} sedes={sedes} />
          <label>Motivo de la corrección<input autoComplete="off" maxLength={250} name="motivo" required /></label>
        </div>
        <p>El valor anterior queda en el historial como Reemplazado. Las versiones finalizadas no cambian.</p>
        <p>Cancelar no reemplaza nada.</p>
        {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
        <div className="acciones-dialogo">
          <button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button>
          <button className="boton-principal" disabled={pendiente} type="submit">{pendiente ? "Reemplazando…" : "Reemplazar valor"}</button>
        </div>
      </form>
    </dialog>
  </>;
}
