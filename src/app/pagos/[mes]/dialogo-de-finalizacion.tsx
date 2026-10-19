import { useId, type Ref } from "react";

import { formatearSoles } from "@/condiciones-laborales/valores";
import { formatearMes } from "@/fuentes-externas/valores";
import type { AlcanceDeFinalizacion, HuellaDeRevision, ResumenDeCambio } from "@/pagos/finalizar-mes";
import { ROTULO_DEL_NETO } from "@/pagos/fuentes-en-el-neto";

// Diálogo 6.1 del diseño de interacción: confirmar la finalización (6.1.a) o avisar que el cálculo cambió desde su revisión (6.1.b).
// Solo presenta lo que recibe: no llama al servidor ni abre el `<dialog>` (eso lo conecta `finalizacion-del-mes.tsx`).
export interface PropiedadesDelDialogo {
  mes: string;
  modo: "normal" | "cambio";
  alcance: AlcanceDeFinalizacion;
  /** Lo que Finanzas revisó; viaja en el formulario para que el servidor detecte si el cálculo cambió. */
  huella: HuellaDeRevision;
  cambio?: ResumenDeCambio;
  pendiente?: boolean;
  error?: string;
  accion?: (formData: FormData) => void;
  alCancelar?: () => void;
  alRevisar?: () => void;
  dialogoRef?: Ref<HTMLDialogElement>;
  tituloRef?: Ref<HTMLHeadingElement>;
}

/** «26/09–25/10»: el día y el mes de cada extremo del período. */
const textoDelPeriodo = ({ inicio, fin }: { inicio: string; fin: string }) => `${inicio.slice(8, 10)}/${inicio.slice(5, 7)}–${fin.slice(8, 10)}/${fin.slice(5, 7)}`;
const subtotalODePendiente = (centimos: number | null) => (centimos === null ? "Pendiente" : formatearSoles(centimos));

export function DialogoDeFinalizacion({ mes, modo, alcance, huella, cambio, pendiente = false, error, accion, alCancelar, alRevisar, dialogoRef, tituloRef }: PropiedadesDelDialogo) {
  const tituloId = useId();
  const cancelar = <button className="boton-secundario" onClick={alCancelar} type="button">Cancelar</button>;

  if (modo === "cambio") {
    return <dialog aria-labelledby={tituloId} className="dialogo-confirmacion dialogo-de-pagos" ref={dialogoRef}>
      <section>
        <h2 id={tituloId} ref={tituloRef} tabIndex={-1}>El cálculo cambió desde su revisión</h2>
        <p>Cambiaron datos desde el borrador que revisó. Revise el cálculo actualizado antes de finalizar.</p>
        {cambio && <>
          <p>{`Subtotal «${ROTULO_DEL_NETO}»: antes ${formatearSoles(cambio.subtotalAnteriorCentimos)}, ahora ${formatearSoles(cambio.subtotalActualCentimos)}.`}</p>
          {cambio.datosCambiados.length > 0 && <p>{`Datos que cambiaron: ${cambio.datosCambiados.join(", ")}.`}</p>}
          {cambio.personas.length > 0 && <ul>{cambio.personas.map(({ dni, nombre, anteriorCentimos, actualCentimos }) => <li key={dni}>{`${nombre}: ${subtotalODePendiente(anteriorCentimos)} → ${subtotalODePendiente(actualCentimos)}`}</li>)}</ul>}
        </>}
        <div className="acciones-dialogo">
          {cancelar}
          <button className="boton-principal" onClick={alRevisar} type="button">Revisar cálculo actualizado</button>
        </div>
      </section>
    </dialog>;
  }

  return <dialog aria-labelledby={tituloId} className="dialogo-confirmacion dialogo-de-pagos" ref={dialogoRef}>
    <form action={accion}>
      <input name="mes" type="hidden" value={mes} />
      <input name="huella" type="hidden" value={JSON.stringify(huella)} />
      <h2 id={tituloId} ref={tituloRef} tabIndex={-1}>¿Finalizar la preliquidación de {formatearMes(mes)}?</h2>
      <p>{`Se guardará una versión para ${alcance.personas} ${alcance.personas === 1 ? "persona" : "personas"} del mes (subtotal «${ROTULO_DEL_NETO}»: ${formatearSoles(alcance.subtotalCentimos)}). No se finaliza persona por persona.`}</p>
      <p>{`La versión ${alcance.numeroDeVersion} no se podrá editar. Queda vinculada a los períodos de planilla ${alcance.periodos.map(textoDelPeriodo).join(" y ")} y a las reglas y fuentes de hoy. Antes de confirmar el pago puede crear otra versión sin modificar esta.`}</p>
      <p>Cancelar no guarda nada.</p>
      {error && <p className="mensaje-operacion error" role="alert">{error}</p>}
      <div className="acciones-dialogo">
        {cancelar}
        <button className="boton-principal" disabled={pendiente} type="submit">{pendiente ? "Guardando…" : "Finalizar mes"}</button>
      </div>
    </form>
  </dialog>;
}
