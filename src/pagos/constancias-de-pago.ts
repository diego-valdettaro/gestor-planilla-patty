// Constancia del pago realizado de un mes (#130, ADR 0013): el puerto que guarda y consulta la constancia que Finanzas registra una
// sola vez por mes, sobre la versión finalizada que pagó.

export interface ConstanciaDePago {
  mesDePago: string;
  /** Número de la versión finalizada que se pagó. */
  numeroDeVersion: number;
  /** Fecha en que Finanzas pagó, AAAA-MM-DD, tal como la escribió (sin huso). */
  fechaDelPago: string;
  confirmadaPorId: string;
  confirmadaPor: string;
  /** Instante en que la app registró la confirmación. */
  confirmadaEn: Date;
}

export type NuevaConstanciaDePago = Omit<ConstanciaDePago, "confirmadaPor">;

export const MENSAJE_DE_MES_YA_CONFIRMADO = "Este mes ya tiene su pago realizado confirmado.";

/** El mes ya tiene su constancia: solo se confirma una vez. */
export class ErrorDeMesYaConfirmado extends Error {
  constructor() {
    super(MENSAJE_DE_MES_YA_CONFIRMADO);
    this.name = "ErrorDeMesYaConfirmado";
  }
}

/** La versión que se quiere confirmar no existe como versión finalizada del mes. */
export class ErrorDeVersionNoFinalizada extends Error {
  constructor() {
    super("La versión que se quiere confirmar no está finalizada en ese mes.");
    this.name = "ErrorDeVersionNoFinalizada";
  }
}

/** Un período que sustenta la versión se reabrió antes de confirmar: la versión ya no es una base firme para el pago. */
export const MENSAJE_DE_PERIODO_FUENTE_REABIERTO = "Un período que sustenta esta versión se reabrió; finalice el mes otra vez antes de confirmar el pago.";

export class ErrorDePeriodoFuenteReabierto extends Error {
  constructor() {
    super(MENSAJE_DE_PERIODO_FUENTE_REABIERTO);
    this.name = "ErrorDePeriodoFuenteReabierto";
  }
}

export interface RepositorioDeConstancias {
  /** Guarda la constancia del mes o nada: rechaza si el mes ya la tiene o si la versión no existe. */
  confirmar(nueva: NuevaConstanciaDePago): Promise<ConstanciaDePago>;
  buscar(mes: string): Promise<ConstanciaDePago | undefined>;
  mesConPagoConfirmado(mes: string): Promise<boolean>;
}
