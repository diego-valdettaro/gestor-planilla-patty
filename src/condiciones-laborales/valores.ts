import {
  AFILIACIONES,
  ESQUEMAS_DE_COMISION,
  NOMBRE_DE_AFILIACION,
  NOMBRE_DE_ESQUEMA,
  NOMBRE_DE_REGIMEN,
  REGIMENES,
  type Afiliacion,
  type DatoLaboral,
  type EsquemaDeComision,
  type Regimen,
  type ValorLaboral,
} from "./catalogo";

const MAXIMO_DE_CENTIMOS = 2_147_483_647;
const MINUTOS_POR_DIA = 1440;
const NUMERO_DECIMAL = /^(\d+)(?:[.,](\d{1,2}))?$/;

function enCatalogo<T extends string>(catalogo: readonly T[], texto: string, mensaje: string): T {
  const valor = texto.trim();
  const encontrado = catalogo.find((candidato) => candidato === valor);
  if (!encontrado) throw new Error(mensaje);
  return encontrado;
}

/** Escribe `1800,5` como 180050 céntimos; nunca acepta cero ni negativos. */
function interpretarSueldo(texto: string): number {
  const coincide = NUMERO_DECIMAL.exec(texto.trim());
  const centimos = coincide ? Number(coincide[1]) * 100 + Number((coincide[2] ?? "").padEnd(2, "0")) : NaN;
  if (!Number.isSafeInteger(centimos) || centimos <= 0 || centimos > MAXIMO_DE_CENTIMOS) {
    throw new Error("El sueldo debe ser un importe en soles mayor que cero, con hasta dos decimales (por ejemplo 1800 o 1800,50).");
  }
  return centimos;
}

/** Horas con hasta dos decimales → minutos enteros: 8 → 480, 7,5 → 450; 7,33 no es un número entero de minutos. */
function interpretarJornada(texto: string): number {
  const coincide = NUMERO_DECIMAL.exec(texto.trim());
  const centesimasDeHora = coincide ? Number(coincide[1]) * 100 + Number((coincide[2] ?? "").padEnd(2, "0")) : NaN;
  const minutos = (centesimasDeHora * 60) / 100;
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > MINUTOS_POR_DIA) {
    throw new Error("La jornada ordinaria diaria debe ser un número de horas entre 0 y 24 que equivalga a minutos enteros (por ejemplo 8 o 7,5).");
  }
  return minutos;
}

/** Convierte el texto de un formulario en el valor tipado de su dato; el mensaje de error es para Finanzas. */
export function interpretarValor(dato: DatoLaboral, texto: string): ValorLaboral {
  switch (dato) {
    case "sueldo": return interpretarSueldo(texto);
    case "jornada_ordinaria_diaria": return interpretarJornada(texto);
    case "regimen_laboral": return enCatalogo<Regimen>(REGIMENES, texto, "Elija un régimen laboral: general o REMYPE pequeña empresa.");
    case "afiliacion_pensionaria": return enCatalogo<Afiliacion>(AFILIACIONES, texto, "Elija una afiliación pensionaria: ONP o una AFP de la lista.");
    case "comision_afp": return enCatalogo<EsquemaDeComision>(ESQUEMAS_DE_COMISION, texto, "Elija el esquema de comisión AFP: flujo o mixta.");
    case "elegibilidad_familiar": {
      const valor = texto.trim();
      if (valor !== "si" && valor !== "no") throw new Error("Indique si Patty otorgó la asignación familiar tras verificar el sustento fuera de la app.");
      return valor === "si";
    }
    case "sede_de_adscripcion": {
      const sede = texto.trim();
      if (!sede) throw new Error("Elija la sede de adscripción.");
      return sede;
    }
  }
}

/** `S/ 1.234,56`, con punto de millar y coma decimal (contrato visual). */
export function formatearSoles(centimos: number): string {
  const enteros = Math.floor(centimos / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `S/ ${enteros},${String(centimos % 100).padStart(2, "0")}`;
}

export function formatearJornada(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (!horas) return `${resto} min`;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

export function formatearValor(dato: DatoLaboral, valor: ValorLaboral): string {
  switch (dato) {
    case "sueldo": return formatearSoles(Number(valor));
    case "jornada_ordinaria_diaria": return formatearJornada(Number(valor));
    case "regimen_laboral": return NOMBRE_DE_REGIMEN[valor as Regimen];
    case "afiliacion_pensionaria": return NOMBRE_DE_AFILIACION[valor as Afiliacion];
    case "comision_afp": return NOMBRE_DE_ESQUEMA[valor as EsquemaDeComision];
    case "elegibilidad_familiar": return valor ? "Otorgada" : "No otorgada";
    case "sede_de_adscripcion": return String(valor);
  }
}
