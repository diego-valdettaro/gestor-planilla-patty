// Reglas puras de vigencia de las reglas legales (ADR 0008). Un valor nuevo agrega una vigencia y nunca reescribe
// las anteriores; consultar una fecha devuelve la última versión activa que ya había empezado. Una regla sin
// versión vigente falta: se devuelve undefined, jamás cero.

import type { EstadoDeVigencia } from "@/condiciones-laborales/vigencia";
import { desplazarFecha } from "@/turnos/semana";

import type { CodigoDeReglaLegal } from "./catalogo";

export type { EstadoDeVigencia } from "@/condiciones-laborales/vigencia";

export interface ReglaLegal {
  id: string;
  codigo: CodigoDeReglaLegal;
  /** Centésimas de punto porcentual (9,00 % = 900) o céntimos, según la unidad del código en el catálogo. */
  valor: number;
  vigenteDesde: string;
  /** Norma o enlace oficial del que sale el valor. */
  fuenteOficial: string;
  activadaPorId: string;
  /** Nombre de usuario de quien la activó. */
  activadaPor: string;
  activadaEn: Date;
  /** Una regla reemplazada (corrección) queda en el historial pero ya no rige. */
  reemplazadaEn: Date | null;
  motivoDeReemplazo: string | null;
}

export interface EntradaDeHistorial extends ReglaLegal {
  /** Último día de la vigencia (el día previo a la siguiente); null si es la última o está reemplazada. */
  vigenteHasta: string | null;
  estado: EstadoDeVigencia;
}

function activasDe(reglas: ReglaLegal[]): ReglaLegal[] {
  return reglas.filter((regla) => regla.reemplazadaEn === null).sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
}

/** Versión vigente en `fecha` (AAAA-MM-DD) de las reglas de un mismo código, o undefined si no hay ninguna. */
export function reglaVigenteEn(reglas: ReglaLegal[], fecha: string): ReglaLegal | undefined {
  return activasDe(reglas).filter((regla) => regla.vigenteDesde <= fecha).at(-1);
}

/** Historial de un código (activas y reemplazadas) en orden cronológico; `hoy` decide cuál rige y cuáles están programadas. */
export function armarHistorial(reglas: ReglaLegal[], hoy: string): EntradaDeHistorial[] {
  const activas = activasDe(reglas);
  const vigenteHoy = reglaVigenteEn(reglas, hoy);
  return [...reglas]
    .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde) || a.activadaEn.getTime() - b.activadaEn.getTime())
    .map((regla): EntradaDeHistorial => {
      if (regla.reemplazadaEn !== null) return { ...regla, vigenteHasta: null, estado: "reemplazado" };
      const siguiente = activas[activas.indexOf(regla) + 1];
      const estado: EstadoDeVigencia = regla.vigenteDesde > hoy ? "programado" : regla === vigenteHoy ? "vigente" : "anterior";
      return { ...regla, vigenteHasta: siguiente ? desplazarFecha(siguiente.vigenteDesde, -1) : null, estado };
    });
}
