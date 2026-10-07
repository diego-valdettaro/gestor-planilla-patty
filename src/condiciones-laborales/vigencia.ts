// Reglas puras de vigencia de las condiciones laborales (ADR 0008). Un valor nuevo agrega una vigencia y nunca
// reescribe las anteriores; consultar una fecha devuelve la última vigencia activa que ya había empezado.
// Un dato sin vigencia falta: se devuelve undefined, jamás cero.

import { desplazarFecha } from "@/turnos/semana";

import { DATOS_LABORALES, esAfp, type DatoLaboral, type ValorLaboral } from "./catalogo";

export interface CondicionLaboral {
  id: string;
  relacionId: string;
  dato: DatoLaboral;
  valor: ValorLaboral;
  vigenteDesde: string;
  registradaPorId: string;
  /** Nombre de usuario de quien la registró. */
  registradaPor: string;
  registradaEn: Date;
  /** Una condición reemplazada (corrección) queda en el historial pero ya no rige. */
  reemplazadaEn: Date | null;
  motivoDeReemplazo: string | null;
}

export type EstadoDeVigencia = "vigente" | "anterior" | "programado" | "reemplazado";

export interface EntradaDeHistorial extends CondicionLaboral {
  /** Último día de la vigencia (el día previo a la siguiente); null si es la última o está reemplazada. */
  vigenteHasta: string | null;
  estado: EstadoDeVigencia;
}

export type ValoresVigentes = Record<DatoLaboral, ValorLaboral | undefined>;

function activasDe(condiciones: CondicionLaboral[], dato?: DatoLaboral): CondicionLaboral[] {
  return condiciones
    .filter((condicion) => condicion.reemplazadaEn === null && (dato === undefined || condicion.dato === dato))
    .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
}

/** Valor del dato vigente en `fecha` (AAAA-MM-DD), o undefined si todavía no tiene ninguna vigencia. */
export function valorVigenteEn(condiciones: CondicionLaboral[], dato: DatoLaboral, fecha: string): ValorLaboral | undefined {
  const empezadas = activasDe(condiciones, dato).filter((condicion) => condicion.vigenteDesde <= fecha);
  return empezadas.at(-1)?.valor;
}

/** Los siete datos vigentes en la fecha; undefined donde falta. */
export function valoresVigentesEn(condiciones: CondicionLaboral[], fecha: string): ValoresVigentes {
  return Object.fromEntries(DATOS_LABORALES.map((dato) => [dato, valorVigenteEn(condiciones, dato, fecha)])) as ValoresVigentes;
}

/** Historial de un dato (activas y reemplazadas) en orden cronológico; `hoy` decide cuál rige y cuáles están programadas. */
export function armarHistorial(condiciones: CondicionLaboral[], hoy: string): EntradaDeHistorial[] {
  const activas = activasDe(condiciones);
  const vigenteHoy = activas.filter((condicion) => condicion.vigenteDesde <= hoy).at(-1);
  return [...condiciones]
    .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde) || a.registradaEn.getTime() - b.registradaEn.getTime())
    .map((condicion): EntradaDeHistorial => {
      if (condicion.reemplazadaEn !== null) return { ...condicion, vigenteHasta: null, estado: "reemplazado" };
      const siguiente = activas[activas.indexOf(condicion) + 1];
      const estado: EstadoDeVigencia = condicion.vigenteDesde > hoy ? "programado" : condicion === vigenteHoy ? "vigente" : "anterior";
      return { ...condicion, vigenteHasta: siguiente ? desplazarFecha(siguiente.vigenteDesde, -1) : null, estado };
    });
}

/** Datos que la persona todavía no tiene en la fecha. El esquema de comisión solo se exige con afiliación AFP. */
export function datosFaltantes(vigentes: ValoresVigentes): DatoLaboral[] {
  return DATOS_LABORALES.filter((dato) => {
    if (dato === "comision_afp" && !esAfp(vigentes.afiliacion_pensionaria)) return false;
    return vigentes[dato] === undefined;
  });
}

/** Fecha civil de hoy en Lima (AAAA-MM-DD); la fecha UTC adelanta el día por las noches. */
export function fechaDeHoyEnLima(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}
