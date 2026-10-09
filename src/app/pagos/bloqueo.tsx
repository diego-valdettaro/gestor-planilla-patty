import Link from "next/link";

export function BloqueoDePagos({ mensaje, mes, relacionId }: { mensaje: string; mes: string; relacionId?: string }) {
  let destino = "/periodos";
  let siguiente = "Revise el período de planilla y su aprobación.";
  if (mensaje.startsWith("Sin ")) {
    destino = `/pagos/condiciones-laborales/${relacionId}`;
    siguiente = "Registre el valor vigente en Condiciones laborales.";
  } else if (mensaje.startsWith("No hay ")) {
    destino = "/pagos/reglas-legales";
    siguiente = "Active el valor vigente en Reglas legales.";
  } else if (mensaje.startsWith("Fuente externa")) {
    destino = `/pagos/fuentes-externas?mes=${mes}`;
    siguiente = "Confirme el listado de esta fuente.";
  } else if (mensaje.includes("22:00")) {
    return <p className="mensaje-operacion advertencia" role="status">{mensaje} Afecta a esta persona y bloquea el mes. Este caso todavía no tiene regla de cálculo; Finanzas debe definirla antes de finalizar.</p>;
  }
  return <p className="mensaje-operacion advertencia" role="status">{mensaje} Afecta {relacionId ? "a esta persona" : "al mes completo"}. <Link href={destino}>{siguiente}</Link></p>;
}
