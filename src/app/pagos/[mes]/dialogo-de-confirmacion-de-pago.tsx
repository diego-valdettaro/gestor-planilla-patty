import { useId, type Ref } from "react";

import { formatearSoles } from "@/condiciones-laborales/valores";
import { formatearMes } from "@/fuentes-externas/valores";

// Diálogo 6.2 del diseño de interacción: confirmar que el mes se pagó fuera de la app. Solo presenta lo que recibe: no llama al servidor ni abre el
// `<dialog>` (eso lo conecta `confirmacion-del-pago.tsx`).
export interface PropiedadesDelDialogoDePago {
  mes: string;
  /** La versión vigente que Finanzas ve y declara pagada; viaja en el formulario para que el servidor detecte si dejó de ser la vigente. */
  numeroDeVersion: number;
  personas: number;
  subtotalCentimos: number;
  /** Nombre de usuario con el que se registrará la constancia (solo informativo: el servidor toma al responsable de la sesión). */
  responsable: string;
  /** Hoy en Lima (AAAA-MM-DD): la fecha del pago no puede ser posterior. */
  hoy: string;
  pendiente?: boolean;
  error?: string;
  accion?: (formData: FormData) => void;
  alCancelar?: () => void;
  dialogoRef?: Ref<HTMLDialogElement>;
  tituloRef?: Ref<HTMLHeadingElement>;
}

export function DialogoDeConfirmacionDePago({ mes, numeroDeVersion, personas, subtotalCentimos, responsable, hoy, pendiente = false, error, accion, alCancelar, dialogoRef, tituloRef }: PropiedadesDelDialogoDePago) {
  const tituloId = useId();
  return <dialog aria-labelledby={tituloId} className="dialogo-confirmacion dialogo-de-pagos" ref={dialogoRef}>
    <form action={accion}>
      <input name="mes" type="hidden" value={mes} />
      <input name="version" type="hidden" value={numeroDeVersion} />
      <h2 id={tituloId} ref={tituloRef} tabIndex={-1}>¿Confirmar que se pagó {formatearMes(mes)} fuera de la app?</h2>
      <p>{`Versión ${numeroDeVersion} del mes completo, ${personas} ${personas === 1 ? "persona" : "personas"}, ${formatearSoles(subtotalCentimos)}.`}</p>
      <p>No se podrá reemplazar esta preliquidación ni reabrir los períodos de planilla que la sustentan. No se puede deshacer en esta versión de la app. La app no ejecuta ni verifica la transferencia: solo registra su constancia.</p>
      <label>Fecha del pago<input max={hoy} name="fecha" required type="date" /></label>
      <p>{`Se registrará a nombre de ${responsable}`}</p>
      <p>Cancelar no registra nada.</p>
      {error && <p className="mensaje-operacion error" role="alert">{error}</p>}
      <div className="acciones-dialogo">
        <button className="boton-secundario" onClick={alCancelar} type="button">Cancelar</button>
        <button className="boton-principal" disabled={pendiente} type="submit">{pendiente ? "Registrando…" : "Confirmar pago realizado"}</button>
      </div>
    </form>
  </dialog>;
}
