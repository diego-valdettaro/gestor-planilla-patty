import Link from "next/link";

import { fechaDeHoyEnLima } from "@/condiciones-laborales/vigencia";
import type { ResumenDeVersion } from "@/pagos/finalizar-mes";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";

import { TablaDesplazable } from "./tabla-desplazable";

/** Bloque «Historial de versiones» del mes (interacción §4.2, D15): una fila por versión finalizada; sin versiones no hay bloque. */
export function HistorialDeVersiones({ mes, versiones }: { mes: string; versiones: ResumenDeVersion[] }) {
  if (versiones.length === 0) return null;
  return <section aria-labelledby="titulo-historial" className="tarjeta panel">
    <header className="panel-cabecera"><h2 id="titulo-historial">Historial de versiones</h2></header>
    <TablaDesplazable etiqueta="Historial de versiones">
      <thead><tr><th>Versión</th><th>Fecha</th><th>Responsable</th><th>Estado</th><th>Acción</th></tr></thead>
      <tbody>{versiones.map(({ numero, finalizadaEn, finalizadaPor, estado, pago }) => <tr key={numero}>
        <th scope="row">Versión {numero}</th>
        <td>{formatearFechaDeRelacion(fechaDeHoyEnLima(finalizadaEn))}</td>
        <td>{finalizadaPor}</td>
        <td><span className={`insignia ${estado === "Reemplazada" ? "neutro" : "ok"}`}>{estado}</span>{pago && <small className="linea-de-relacion">{`Pagado el ${formatearFechaDeRelacion(pago.fechaDelPago)} · ${pago.responsable}`}</small>}</td>
        <td><Link href={`/pagos/${mes}?version=${numero}`}>Abrir versión {numero}</Link></td>
      </tr>)}</tbody>
    </TablaDesplazable>
  </section>;
}
