import type { ContenidoDeAviso } from "../aviso-flotante";
import { NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA, type EstadoDeCeldaAsistencia } from "./estado-de-celda";

// Dónde se registra la asistencia desde la vista que muestra el día: en el calendario mensual se abre el día; en la matriz semanal hay que pasar a la vista mensual.
export type DondeRegistrar = "abrir-el-dia" | "vista-mensual";

export interface DetalleDeDia { titulo: string; detalle: string; siguientePaso: string }

// El nombre del estado, su color y la leyenda ya identifican cada día: la causa (qué marcas faltan, por qué no hay planificación) no se repite en la celda.
// Vive en el tooltip del día y en el diálogo del día. «Registrada» no necesita explicación.
export function detalleDeDia(estado: EstadoDeCeldaAsistencia, donde: DondeRegistrar): DetalleDeDia | undefined {
  const nombre = NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA[estado];
  const registrar = donde === "abrir-el-dia" ? "abra el día" : "pase a la vista mensual";
  switch (estado) {
    case "sin-planificacion":
      return { titulo: nombre, detalle: "no hay un horario publicado para este día.", siguientePaso: "publique el horario en Planificación de horarios antes de registrar la asistencia." };
    case "esperada":
      return { titulo: `${nombre} · faltan marcas`, detalle: "aún no hay marcas del huellero para este día.", siguientePaso: `importe el archivo del huellero o ${registrar} para registrar la asistencia.` };
    case "pendiente-de-revision":
      return { titulo: `${nombre} · marcas incompletas`, detalle: "hay marcas del huellero, pero no alcanzan para proponer una entrada y una salida completas.", siguientePaso: `${registrar} para revisar las marcas y registrar la asistencia.` };
    case "liquidado":
      return { titulo: `${nombre} · período cerrado`, detalle: "la fecha cae en un período de planilla cerrado y quedó congelada.", siguientePaso: "no requiere acción: los días de un período cerrado no se editan." };
    default:
      return undefined;
  }
}

export function avisoDeDia(estado: EstadoDeCeldaAsistencia, donde: DondeRegistrar): ContenidoDeAviso | undefined {
  const detalle = detalleDeDia(estado, donde);
  if (!detalle) return undefined;
  return { titulo: detalle.titulo, filas: [{ rotulo: "Detalle", texto: detalle.detalle }, { rotulo: "Siguiente paso", texto: detalle.siguientePaso }] };
}

// Clase del estado compartido con Horarios (paleta única en global.css, bajo `.pagina-ajustes`).
export const CLASE_DE_ESTADO_DE_ASISTENCIA: Record<EstadoDeCeldaAsistencia, string> = {
  "sin-planificacion": "est-sinplan",
  esperada: "est-esperada",
  "pendiente-de-revision": "est-pendiente",
  registrada: "est-registrada",
  liquidado: "est-liquidado",
};
