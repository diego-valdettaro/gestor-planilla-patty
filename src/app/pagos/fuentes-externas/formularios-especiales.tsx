"use client";

import { useActionState } from "react";

import { CONCEPTOS } from "@/conceptos-de-preliquidacion/catalogo";
import { formatearMes } from "@/fuentes-externas/valores";

import { decidirIncidenciaDesdeFormulario, registrarAbonoVacacionalDesdeFormulario, registrarAjusteDesdeFormulario, registrarIncidenciaDesdeFormulario, type EstadoEspecial } from "./acciones-especiales";

const inicial: EstadoEspecial = {};

function Resultado({ estado }: { estado: EstadoEspecial }) {
  return <>{estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}{estado.listo && <p className="mensaje-operacion listo" role="status">Cambio guardado.</p>}</>;
}

function CamposComunes({ mes }: { mes: string }) {
  return <>
    <label>DNI de la persona<input name="dni" inputMode="numeric" pattern="\d{8}" required /></label>
    <label>Fecha del hecho<input name="fechaDelHecho" required type="date" /></label>
    <label>Mes de devengue<input defaultValue={mes} name="mesDeDevengue" required type="month" /></label>
    <input name="mesDeAplicacion" type="hidden" value={mes} />
    <label>Importe (S/)<input name="monto" inputMode="decimal" placeholder="250,00" required /></label>
    <small className="linea-de-relacion">Mes de aplicación: {formatearMes(mes)}.</small>
  </>;
}

export function RegistroDeIncidencia({ mes }: { mes: string }) {
  const [estado, accion, pendiente] = useActionState(registrarIncidenciaDesdeFormulario, inicial);
  return <form action={accion} className="formulario-dialogo formulario-de-importe"><CamposComunes mes={mes} /><p>La incidencia se guarda «Sin sustento» y queda fuera del neto hasta autorizarla.</p><Resultado estado={estado} /><button className="boton-principal" disabled={pendiente} type="submit">Registrar incidencia de tienda</button></form>;
}

export function DecisionDeIncidencia({ id, estadoActual }: { id: string; estadoActual: string | null }) {
  const [estadoDeAutorizacion, autorizar, autorizando] = useActionState(decidirIncidenciaDesdeFormulario, inicial);
  const [estadoDeInvestigacion, noDescontar, investigando] = useActionState(decidirIncidenciaDesdeFormulario, inicial);
  if (!estadoActual || estadoActual === "descuento_autorizado") return null;
  return <div className="formulario-dialogo">
    <form action={autorizar} className="formulario-dialogo">
      <input name="id" type="hidden" value={id} />
      <input name="decision" type="hidden" value="autorizar" />
      <label>Texto de sustento<textarea maxLength={1000} name="sustento" required rows={2} /></label>
      <label>Quién autoriza<input maxLength={200} name="autorizadoPor" required /></label>
      <label>Fecha de autorización<input name="fechaDeAutorizacion" required type="date" /></label>
      <Resultado estado={estadoDeAutorizacion} />
      <button className="boton-principal" disabled={autorizando || investigando} type="submit">Autorizar descuento</button>
    </form>
    <form action={noDescontar}>
      <input name="id" type="hidden" value={id} />
      <input name="decision" type="hidden" value="no_descontar" />
      <Resultado estado={estadoDeInvestigacion} />
      <button className="boton-secundario" disabled={autorizando || investigando} type="submit">No descontar en este pago</button>
    </form>
  </div>;
}

export function RegistroDeAjuste({ mes }: { mes: string }) {
  const [estado, accion, pendiente] = useActionState(registrarAjusteDesdeFormulario, inicial);
  return <form action={accion} className="formulario-dialogo formulario-de-importe"><CamposComunes mes={mes} />
    <label>Concepto que se corrige<select name="conceptoAjustado" required>{CONCEPTOS.filter((concepto) => concepto.codigo !== "ajuste_de_preliquidacion").map((concepto) => <option key={concepto.codigo} value={concepto.codigo}>{concepto.nombre}</option>)}</select></label>
    <label>Sentido del ajuste<select name="sentidoAjuste"><option value="suma">Aumentar el concepto</option><option value="resta">Reducir el concepto</option></select></label>
    <label>Motivo<textarea maxLength={250} name="motivo" required rows={2} /></label>
    <p>El ajuste toma el efecto sobre el neto y las bases del concepto corregido. La versión finalizada anterior queda intacta.</p>
    <Resultado estado={estado} /><button className="boton-principal" disabled={pendiente} type="submit">Registrar ajuste de preliquidación</button>
  </form>;
}

export function RegistroDeAbonoVacacional({ mes }: { mes: string }) {
  const [estado, accion, pendiente] = useActionState(registrarAbonoVacacionalDesdeFormulario, inicial);
  return <form action={accion} className="formulario-dialogo formulario-de-importe">
    <label>DNI de la persona<input name="dni" inputMode="numeric" pattern="\d{8}" required /></label>
    <label>Fecha del abono<input name="fechaDelAbono" required type="date" /></label>
    <input name="mesDeAplicacion" type="hidden" value={mes} />
    <label>Importe (S/)<input name="monto" inputMode="decimal" placeholder="300,00" required /></label>
    <small className="linea-de-relacion">Mes de aplicación: {formatearMes(mes)}.</small>
    <p>Los días del descanso salen de las vacaciones que el gerente aprobó en Asistencia. El abono se ata al descanso que empieza en o después de su fecha y se reparte por días calendario entre los meses del descanso: reduce el saldo de cada mes una sola vez y no cambia su mes de devengue.</p>
    <Resultado estado={estado} /><button className="boton-principal" disabled={pendiente} type="submit">Registrar abono vacacional</button>
  </form>;
}
