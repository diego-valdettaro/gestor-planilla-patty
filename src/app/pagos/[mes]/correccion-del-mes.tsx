/**
 * Cómo corregir un mes ya finalizado cuyo pago aún no se confirmó (interacción §4.6 «Éxito», D19). La versión guardada no se toca: toda
 * corrección termina en otra versión. Se muestra solo con versión finalizada y sin pago realizado confirmado.
 */
export function CorreccionDelMes() {
  return <section aria-labelledby="titulo-correccion" className="tarjeta panel">
    <header className="panel-cabecera"><h2 id="titulo-correccion">Cómo corregir este mes</h2></header>
    <p>Si cambió la asistencia, Finanzas reabre el período en Períodos, el gerente corrige y vuelve a aprobar, Finanzas lo cierra de nuevo y entonces se finaliza otra versión.</p>
    <p>Si cambió una fuente externa o una regla y la asistencia no cambió, no se reabren períodos: se recalcula el borrador, se revisa y se finaliza otra versión.</p>
    <p>La versión anterior nunca cambia.</p>
  </section>;
}
