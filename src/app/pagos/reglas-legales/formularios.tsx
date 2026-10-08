"use client";

import { useActionState, useEffect, useId, useState } from "react";

import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";
import { conArticulo, type DefinicionDeReglaLegal, type UnidadDeRegla } from "@/reglas-legales/catalogo";
import { formatearValorLegal, interpretarValorLegal } from "@/reglas-legales/valores";

import { useDialogo } from "../usar-dialogo";

import { activarReglaDesdeFormulario, corregirReglaDesdeFormulario, type EstadoDeFormularioDeRegla } from "./actions";

const estadoInicial: EstadoDeFormularioDeRegla = {};

function CampoDeValor({ unidad }: { unidad: UnidadDeRegla }) {
  return unidad === "porcentaje"
    ? <label>Valor (%)<input autoComplete="off" inputMode="decimal" name="valor" placeholder="9,00" required /></label>
    : <label>Valor (S/)<input autoComplete="off" inputMode="decimal" name="valor" placeholder="1130,00" required /></label>;
}

/** El valor escrito con su formato final (`9,00 %`), o undefined mientras todavía no es un valor válido. */
function valorEscrito(unidad: UnidadDeRegla, texto: string): string | undefined {
  try {
    return formatearValorLegal(unidad, interpretarValorLegal(unidad, texto));
  } catch {
    return undefined;
  }
}

/** Diálogo 6.7: valor, «Vigente desde» y fuente oficial, con el alcance y la consecuencia escritos antes de confirmar. */
export function ActivacionDeRegla({ definiciones, codigoInicial, usuario }: {
  /** Valores legales entre los que se elige; con uno solo (pantalla de un valor) no hay selector. */
  definiciones: readonly DefinicionDeReglaLegal[];
  codigoInicial?: string;
  usuario: string;
}) {
  const [estado, accion, pendiente] = useActionState(activarReglaDesdeFormulario, estadoInicial);
  const [codigo, setCodigo] = useState(codigoInicial ?? definiciones[0]?.codigo ?? "");
  const [valor, setValor] = useState("");
  const [desde, setDesde] = useState("");
  const [fuente, setFuente] = useState("");
  const { dialogo, titulo, abrir } = useDialogo(estado.listo);
  const tituloId = useId();
  // Tras guardar, el formulario vuelve a su estado inicial.
  useEffect(() => { if (estado.listo) { setValor(""); setDesde(""); setFuente(""); } }, [estado.listo]);
  const definicion = definiciones.find((candidata) => candidata.codigo === codigo) ?? definiciones[0];
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(desde) ? formatearFechaDeRelacion(desde) : undefined;
  const valorFormateado = valorEscrito(definicion.unidad, valor);

  return <>
    <button aria-haspopup="dialog" className="boton-principal" onClick={abrir} type="button">Activar nuevo valor</button>
    <dialog aria-labelledby={tituloId} className="dialogo-confirmacion dialogo-de-pagos" ref={dialogo}>
      <form action={accion} key={estado.listo ?? 0}>
        <h2 id={tituloId} ref={titulo} tabIndex={-1}>¿Activar {conArticulo(definicion)}{valorFormateado ? ` de ${valorFormateado}` : ""}{fecha ? ` desde el ${fecha}` : ""}?</h2>
        <div className="formulario-dialogo">
          {definiciones.length > 1
            ? <label>Valor legal<select name="codigo" onChange={(evento) => { setCodigo(evento.target.value); setValor(""); }} value={definicion.codigo}>{definiciones.map((opcion) => <option key={opcion.codigo} value={opcion.codigo}>{opcion.nombre}</option>)}</select></label>
            : <input name="codigo" type="hidden" value={definicion.codigo} />}
          <label>{definicion.unidad === "porcentaje" ? "Valor (%)" : "Valor (S/)"}<input autoComplete="off" inputMode="decimal" name="valor" onChange={(evento) => setValor(evento.target.value)} placeholder={definicion.unidad === "porcentaje" ? "9,00" : "1130,00"} required value={valor} /></label>
          <label>Vigente desde<input name="vigenteDesde" onChange={(evento) => setDesde(evento.target.value)} required type="date" value={desde} /></label>
          <label>Fuente oficial (norma o enlace)<input autoComplete="off" maxLength={500} name="fuenteOficial" onChange={(evento) => setFuente(evento.target.value)} required value={fuente} /></label>
        </div>
        <p>Alcance: aplica a todas las personas con cálculo desde esa fecha. Fuente oficial: {fuente.trim() || "la que indique arriba"}.</p>
        <p>Los borradores usarán este valor desde esa fecha. Las versiones finalizadas conservan el valor que aplicaron. Quedará registrado a nombre de {usuario}.</p>
        <p>Cancelar no activa nada.</p>
        {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
        <div className="acciones-dialogo">
          <button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button>
          <button className="boton-principal" disabled={pendiente} type="submit">{pendiente ? "Activando…" : "Activar valor"}</button>
        </div>
      </form>
    </dialog>
  </>;
}

/** Corrección (D20): otro valor con la misma vigencia y un motivo obligatorio; el anterior queda «Reemplazado». */
export function CorreccionDeRegla({ reglaId, definicion, valorActual, fuenteActual, vigenteDesde }: {
  reglaId: string;
  definicion: DefinicionDeReglaLegal;
  valorActual: string;
  fuenteActual: string;
  vigenteDesde: string;
}) {
  const [estado, accion, pendiente] = useActionState(corregirReglaDesdeFormulario, estadoInicial);
  const { dialogo, titulo, abrir } = useDialogo(estado.listo);
  const tituloId = useId();
  const fecha = formatearFechaDeRelacion(vigenteDesde);

  return <>
    <button aria-haspopup="dialog" className="boton-secundario" onClick={abrir} type="button">Corregir<span className="sr-only"> {definicion.nombre} vigente desde el {fecha}</span></button>
    <dialog aria-labelledby={tituloId} className="dialogo-confirmacion dialogo-de-pagos" ref={dialogo}>
      <form action={accion} key={estado.listo ?? 0}>
        <input name="reglaId" type="hidden" value={reglaId} />
        <h2 id={tituloId} ref={titulo} tabIndex={-1}>¿Reemplazar {conArticulo(definicion)} vigente desde el {fecha}?</h2>
        <p>Alcance: solo este valor ({valorActual}) y solo su vigencia desde el {fecha}. El resto del historial no cambia.</p>
        <div className="formulario-dialogo">
          <CampoDeValor unidad={definicion.unidad} />
          <label>Fuente oficial (norma o enlace)<input autoComplete="off" defaultValue={fuenteActual} maxLength={500} name="fuenteOficial" required /></label>
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
