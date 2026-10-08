// Tipos de fuente externa (ADR 0009): agrupan los conceptos que Finanzas carga por persona desde fuera del huellero.
// Finanzas confirma cada tipo para el mes completo; solo entonces la ausencia de una fila equivale a cero.
// Aquí viven los tipos genéricos de importe. Los demás tipos del diseño de interacción (4.4) los agrega el ticket que
// construye su flujo propio, con una entrada nueva en este catálogo y sin migración: incidencias de tienda y ajustes de
// preliquidación (#120), abonos anticipados de remuneración vacacional y descansos sustitutorios previstos (#125, #124)
// y la conciliación de la liquidación por cese (#128).

export type CodigoDeTipoDeFuente =
  | "comisiones_de_ventas"
  | "movilidad_supeditada_a_asistencia"
  | "adelantos"
  | "prestamos"
  | "retencion_de_quinta"
  | "gratificacion_y_bonificacion"
  | "incidencias_de_tienda"
  | "ajustes_de_preliquidacion";

export interface TipoDeFuente {
  codigo: CodigoDeTipoDeFuente;
  nombre: string;
  /** Códigos de conceptos del catálogo que este tipo puede cargar; todos son de origen «fuente_externa». */
  conceptos: readonly string[];
  /** Estos tipos requieren sus propios campos y nunca aceptan la carga genérica ni XLSX. */
  flujoPropio?: boolean;
}

export const TIPOS_DE_FUENTE: readonly TipoDeFuente[] = [
  { codigo: "comisiones_de_ventas", nombre: "Comisiones de ventas", conceptos: ["comision_de_ventas"] },
  { codigo: "movilidad_supeditada_a_asistencia", nombre: "Movilidad supeditada a asistencia", conceptos: ["movilidad_supeditada_a_asistencia"] },
  { codigo: "adelantos", nombre: "Adelantos", conceptos: ["adelanto"] },
  { codigo: "prestamos", nombre: "Préstamos (cuotas)", conceptos: ["cuota_de_prestamo"] },
  { codigo: "retencion_de_quinta", nombre: "Retención de quinta categoría", conceptos: ["retencion_de_quinta"] },
  { codigo: "gratificacion_y_bonificacion", nombre: "Gratificación legal y bonificación extraordinaria", conceptos: ["gratificacion_legal", "bonificacion_extraordinaria"] },
  { codigo: "incidencias_de_tienda", nombre: "Incidencias de tienda", conceptos: ["descuento_autorizado_por_incidencia"], flujoPropio: true },
  { codigo: "ajustes_de_preliquidacion", nombre: "Ajustes de preliquidación", conceptos: ["ajuste_de_preliquidacion"], flujoPropio: true },
];

export function buscarTipoDeFuente(codigo: string): TipoDeFuente | undefined {
  return TIPOS_DE_FUENTE.find((tipo) => tipo.codigo === codigo);
}
