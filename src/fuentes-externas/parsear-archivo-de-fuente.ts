// Archivo fuente de preliquidación: XLSX normalizado con los importes externos de un tipo de fuente (issue #119, ADR 0009).
// Solo lee el formato que la app publica en su plantilla; no interpreta el Excel histórico. Este módulo valida la forma de cada
// celda; las reglas del dominio (persona, concepto del tipo, duplicados) las aplica `importar-fuente.ts`.
import * as XLSX from "xlsx";

import { validarDni } from "@/colaboradores/registrar-colaborador";
import { buscarConcepto } from "@/conceptos-de-preliquidacion/catalogo";

import type { TipoDeFuente } from "./tipos-de-fuente";
import { interpretarMonto } from "./valores";

export const HOJA_DE_IMPORTES = "Importes";
export const ENCABEZADOS_DE_FUENTE = ["DNI", "Concepto", "Fecha del hecho", "Mes de devengue", "Importe"] as const;

export interface FilaDeArchivoDeFuente {
  /** Número de fila en la hoja (el encabezado es la 1). */
  fila: number;
  dni: string;
  /** Código o nombre del concepto tal como lo escribió quien preparó el archivo; el dominio lo resuelve. */
  concepto: string;
  fechaDelHecho: string;
  mesDeDevengue: string;
  /** Céntimos. */
  monto: number;
}

export interface ErrorDeFilaDeFuente {
  fila: number;
  dni: string;
  motivo: string;
}

export interface ResultadoDelArchivoDeFuente {
  /** El archivo entero no se puede leer: sin vista previa por fila. */
  errorDelArchivo?: string;
  filas: FilaDeArchivoDeFuente[];
  errores: ErrorDeFilaDeFuente[];
}

const ANIO_MINIMO = 2000;
const ANIO_MAXIMO = 2100;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function parsearArchivoDeFuente(nombre: string, contenido: ArrayBuffer | Uint8Array): ResultadoDelArchivoDeFuente {
  if (!nombre.toLowerCase().endsWith(".xlsx")) return conErrorDelArchivo("El archivo debe tener extensión .xlsx.");

  // SheetJS lee cualquier texto como CSV; un XLSX es un ZIP y empieza con «PK».
  const bytes = contenido instanceof Uint8Array ? contenido : new Uint8Array(contenido);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return conErrorDelArchivo("No se pudo leer el archivo XLSX.");

  let libro: XLSX.WorkBook;
  try {
    libro = XLSX.read(bytes, { type: "array", cellDates: false });
  } catch {
    return conErrorDelArchivo("No se pudo leer el archivo XLSX.");
  }
  const hoja = libro.Sheets[HOJA_DE_IMPORTES];
  if (!hoja) return conErrorDelArchivo(`Falta la hoja obligatoria "${HOJA_DE_IMPORTES}". Descargue la plantilla normalizada.`);

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: "", raw: true });
  const encabezados = (matriz[0] ?? []).map(texto);
  const columnas = ENCABEZADOS_DE_FUENTE.map((encabezado) => encabezados.indexOf(encabezado));
  const faltantes = ENCABEZADOS_DE_FUENTE.filter((_, indice) => columnas[indice] === -1);
  if (faltantes.length) return conErrorDelArchivo(`Faltan los encabezados obligatorios: ${faltantes.join(", ")}. Descargue la plantilla normalizada.`);

  const filas: FilaDeArchivoDeFuente[] = [];
  const errores: ErrorDeFilaDeFuente[] = [];
  let conContenido = 0;
  for (const [indice, valores] of matriz.slice(1).entries()) {
    if (valores.every((valor) => texto(valor) === "")) continue;
    conContenido += 1;
    const fila = indice + 2;
    const [celdaDni, celdaConcepto, celdaFecha, celdaMes, celdaImporte] = columnas.map((columna) => valores[columna]);
    const dni = texto(celdaDni);
    const concepto = texto(celdaConcepto);
    const problemas: string[] = [];

    try { validarDni(dni); } catch (causa) { problemas.push(causa instanceof Error ? causa.message : "El DNI no es válido."); }
    if (!concepto) problemas.push("Falta el concepto.");
    const fechaDelHecho = fechaIso(celdaFecha);
    if (!fechaDelHecho) problemas.push(texto(celdaFecha) ? "La fecha del hecho debe ser una fecha de Excel o usar AAAA-MM-DD." : "Falta la fecha del hecho.");
    const mesDeDevengue = mesIso(celdaMes);
    if (!mesDeDevengue) problemas.push(texto(celdaMes) ? "El mes de devengue debe ser una fecha de Excel o usar AAAA-MM." : "Falta el mes de devengue.");
    const monto = importeEnCentimos(celdaImporte, problemas);

    if (problemas.length || !fechaDelHecho || !mesDeDevengue || monto === undefined) {
      for (const motivo of problemas) errores.push({ fila, dni, motivo });
      continue;
    }
    filas.push({ fila, dni, concepto, fechaDelHecho, mesDeDevengue, monto });
  }
  if (!conContenido) return conErrorDelArchivo(`La hoja "${HOJA_DE_IMPORTES}" no tiene filas para importar.`);
  return { filas, errores };
}

/** Plantilla descargable: la hoja de importes solo con encabezados, y las instrucciones con los conceptos que admite el tipo. */
export function crearPlantillaDeFuente(tipo: TipoDeFuente): Buffer {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([[...ENCABEZADOS_DE_FUENTE]]), HOJA_DE_IMPORTES);
  const conceptos = tipo.conceptos.flatMap((codigo) => buscarConcepto(codigo) ?? []);
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
    [`Plantilla normalizada de ${tipo.nombre}`],
    [`Complete la hoja "${HOJA_DE_IMPORTES}" con una fila por importe, empezando en la fila 2. Todo el archivo se rechaza si una fila tiene un error.`],
    ["DNI: 8 dígitos, escrito como texto si empieza con 0."],
    ["Concepto: el código o el nombre de la lista de abajo."],
    ["Fecha del hecho: fecha de Excel o AAAA-MM-DD."],
    ["Mes de devengue: fecha de Excel o AAAA-MM. El mes de aplicación es el mes de pago que elija al importar."],
    ["Importe: soles, mayor que cero y con hasta dos decimales (por ejemplo 250,50). El signo sobre el neto lo da el concepto."],
    [],
    ["Código del concepto", "Nombre del concepto"],
    ...conceptos.map((concepto) => [concepto.codigo, concepto.nombre]),
  ]), "Instrucciones");
  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" });
}

function conErrorDelArchivo(errorDelArchivo: string): ResultadoDelArchivoDeFuente {
  return { errorDelArchivo, filas: [], errores: [] };
}

function texto(valor: unknown): string {
  return typeof valor === "string" || typeof valor === "number" ? String(valor).trim() : "";
}

function importeEnCentimos(celda: unknown, problemas: string[]): number | undefined {
  if (texto(celda) === "") {
    problemas.push("Falta el importe.");
    return undefined;
  }
  try {
    if (typeof celda === "number") {
      const centimos = Math.round(celda * 100);
      // Un número con más de dos decimales no se redondea en silencio.
      return interpretarMonto(Math.abs(celda * 100 - centimos) > 1e-6 ? String(celda) : (centimos / 100).toFixed(2));
    }
    return interpretarMonto(texto(celda));
  } catch (causa) {
    problemas.push(causa instanceof Error ? causa.message : "El importe no es válido.");
    return undefined;
  }
}

function fechaIso(valor: unknown): string | undefined {
  if (typeof valor === "number") {
    const fecha = XLSX.SSF.parse_date_code(valor);
    return fecha ? desdePartes(fecha.y, fecha.m, fecha.d) : undefined;
  }
  const fecha = FECHA.exec(texto(valor));
  return fecha ? desdePartes(Number(fecha[1]), Number(fecha[2]), Number(fecha[3])) : undefined;
}

function mesIso(valor: unknown): string | undefined {
  if (typeof valor === "number") return fechaIso(valor)?.slice(0, 7);
  return MES.test(texto(valor)) ? texto(valor) : undefined;
}

function desdePartes(anio: number, mes: number, dia: number): string | undefined {
  if (anio < ANIO_MINIMO || anio > ANIO_MAXIMO) return undefined;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
    ? `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
    : undefined;
}
