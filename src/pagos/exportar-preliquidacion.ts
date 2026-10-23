import * as XLSX from "xlsx";

import { fechaDeHoyEnLima } from "@/condiciones-laborales/vigencia";
import type { CondicionLaboral } from "@/condiciones-laborales/vigencia";
import { buscarConcepto } from "@/conceptos-de-preliquidacion/catalogo";
import { formatearMes } from "@/fuentes-externas/valores";
import type { Corte } from "@/periodos/hechos-para-pagos";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";

import type { BasesPorDevengue } from "./aportes-y-bases";
import type { LineaDeBorrador } from "./calcular-borrador";
import { efectoEnElSubtotal } from "./fuentes-en-el-neto";

// Exportación de la preliquidación a XLSX (#131, interacción 4.8): un archivo distinto de la exportación del período, en nombre y contenido.

export interface PersonaParaExportar {
  dni: string;
  nombre: string;
  sedeDeAdscripcion: string | null;
  sueldoCalculadoCentimos: number | null;
  /** null: la persona está bloqueada y no tiene neto. */
  netoCentimos: number | null;
  bloqueos: string[];
  lineas: LineaDeBorrador[];
  bases: BasesPorDevengue[];
}

export type EstadoParaExportar = { tipo: "borrador" } | { tipo: "version"; numero: number; finalizadaPor: string; finalizadaEn: Date };

export interface PreliquidacionParaExportar {
  mes: string;
  corte: Corte;
  estado: EstadoParaExportar;
  generadaEn: Date;
  generadaPor: string;
  revisiones: Array<{ inicio: string; fin: string; numero: number | null }>;
  personas: PersonaParaExportar[];
  fuentes: Array<{ nombre: string; estado: string; filas: number }>;
}

export interface ArchivoDePreliquidacion {
  nombre: string;
  contenido: Uint8Array;
}

type Celda = string | number;
type Fila = Celda[];

export const HOJA_DE_ENCABEZADO = "Preliquidación";
export const AVISO_DE_LA_PRELIQUIDACION = "No es una planilla oficial ni sustituye PLAME. Para el resumen de asistencia, use la exportación del período.";

const fecha = formatearFechaDeRelacion;

/** `preliquidacion-AAAA-MM-borrador.xlsx` o `preliquidacion-AAAA-MM-version-N.xlsx`; la exportación del período se llama `resumen-<inicio>.xlsx`. */
function nombreDelArchivo({ mes, estado }: PreliquidacionParaExportar): string {
  return `preliquidacion-${mes}-${estado.tipo === "borrador" ? "borrador" : `version-${estado.numero}`}.xlsx`;
}

function encabezado(p: PreliquidacionParaExportar): Fila[] {
  const { estado } = p;
  const bloqueadas = p.personas.filter((persona) => persona.netoCentimos === null).length;
  return [
    ["Documento", `Preliquidación del mes de pago ${formatearMes(p.mes)}`],
    ["Aviso", AVISO_DE_LA_PRELIQUIDACION],
    ["Mes de pago", formatearMes(p.mes)],
    ["Corte de incidencias", `${fecha(p.corte.inicio)} al ${fecha(p.corte.fin)}`],
    ["Estado", estado.tipo === "borrador" ? "Borrador, no definitivo" : `Versión ${estado.numero} finalizada`],
    ["Identificador", estado.tipo === "borrador" ? "Sin versión finalizada" : `${p.mes}-v${estado.numero}`],
    ...(estado.tipo === "version" ? [["Finalizada por", estado.finalizadaPor], ["Finalizada el", fecha(fechaDeHoyEnLima(estado.finalizadaEn))]] : []),
    ["Revisiones de asistencia", p.revisiones.map((r) => `Período ${fecha(r.inicio)} al ${fecha(r.fin)}, revisión n.º ${r.numero ?? "—"}`).join("; ")],
    ["Personas", p.personas.length],
    ["Personas con bloqueo", bloqueadas],
    ["Subtotal de las personas calculadas (S/)", soles(p.personas.reduce((suma, persona) => suma + (persona.netoCentimos ?? 0), 0))],
    ["Cobertura del subtotal", bloqueadas === 0 ? "Completo" : `Incompleto: ${bloqueadas} ${bloqueadas === 1 ? "persona con bloqueo no suma" : "personas con bloqueo no suman"}`],
    ["Generado el", fecha(fechaDeHoyEnLima(p.generadaEn))],
    ["Generado por", p.generadaPor],
  ];
}

/** Soles con dos decimales como número, para que la hoja de cálculo pueda sumarlos. */
const soles = (centimos: number): number => Math.round(centimos) / 100;
const solesOPendiente = (centimos: number | null): Celda => (centimos === null ? "Pendiente" : soles(centimos));

const EFECTO_EN_EL_SUBTOTAL = { suma: "Suma", resta: "Resta", ninguno: "No entra al subtotal" } as const;

/** Lo que una línea sabe de cuándo ocurrió el hecho: el día, la fuente externa o el tramo que cubre. */
function fechaDelHecho(linea: LineaDeBorrador): string {
  if ("fecha" in linea && linea.fecha) return fecha(linea.fecha);
  if ("fechaDelHecho" in linea) return fecha(linea.fechaDelHecho);
  if ("desde" in linea && "hasta" in linea) return `${fecha(linea.desde)} al ${fecha(linea.hasta)}`;
  return "";
}

function detalle(linea: LineaDeBorrador): string {
  if ("dias" in linea && linea.dias) return `${linea.dias} ${linea.dias === 1 ? "día" : "días"}`;
  if ("minutos" in linea && linea.minutos) return `${linea.minutos} min`;
  return "";
}

const procedencia = (linea: LineaDeBorrador): string => ("procedencia" in linea && linea.origen === "Fuente externa" ? `Fuente externa · ${linea.procedencia}` : linea.origen);

function hojaDeConceptos(personas: PersonaParaExportar[], mes: string): Fila[] {
  return [
    ["DNI", "Persona", "Sede de adscripción", "Concepto", "Efecto en el neto", "Importe (S/)", "Fecha del hecho", "Mes de devengue", "Mes de aplicación", "Mes de pago", "Procedencia", "Detalle"],
    ...personas.flatMap((persona) => persona.lineas.map((linea): Fila => [
      persona.dni, persona.nombre, persona.sedeDeAdscripcion ?? "Sede pendiente", buscarConcepto(linea.concepto)?.nombre ?? linea.concepto,
      EFECTO_EN_EL_SUBTOTAL[efectoEnElSubtotal(linea)], soles(linea.importeCentimos), fechaDelHecho(linea), formatearMes(linea.mesDeDevengue), formatearMes(linea.mesDePago), formatearMes(mes),
      procedencia(linea), detalle(linea),
    ])),
  ];
}

function hojaDeBases(personas: PersonaParaExportar[]): Fila[] {
  return [
    ["DNI", "Persona", "Sede de adscripción", "Mes de devengue", "Base pensionaria (S/)", "Base de EsSalud remunerativa (S/)", "Base de EsSalud aplicable (S/)", "Base de quinta categoría (S/)"],
    ...personas.flatMap((persona) => persona.bases.map((b): Fila => [
      persona.dni, persona.nombre, persona.sedeDeAdscripcion ?? "Sede pendiente", formatearMes(b.mesDeDevengue),
      solesOPendiente(b.pensionariaCentimos), solesOPendiente(b.essaludRemunerativaCentimos), solesOPendiente(b.essaludAplicableCentimos), solesOPendiente(b.quintaCentimos),
    ])),
  ];
}

function hojaDePersonas(personas: PersonaParaExportar[]): Fila[] {
  return [
    ["DNI", "Persona", "Sede de adscripción", "Sueldo calculado (S/)", "Neto antes de aportes del trabajador (S/)", "Estado", "Bloqueos"],
    ...personas.map((persona): Fila => [
      persona.dni, persona.nombre, persona.sedeDeAdscripcion ?? "Sede pendiente", persona.sueldoCalculadoCentimos === null ? "Pendiente" : soles(persona.sueldoCalculadoCentimos),
      persona.netoCentimos === null ? "Incompleto" : soles(persona.netoCentimos), persona.netoCentimos === null ? "Bloqueada" : "Calculada", persona.bloqueos.join(" | "),
    ]),
  ];
}

/**
 * La versión finalizada no guarda la sede de adscripción de cada persona: se reconstruye con las condiciones laborales tal como estaban al finalizar
 * (registradas hasta ese momento y no reemplazadas todavía), consultadas el día 25 del mes de pago o el ingreso, si es posterior; como hace el cálculo del borrador.
 */
export function sedeDeAdscripcionAlFinalizar({ condiciones, relacionId, ingreso, mes, finalizadaEn }: {
  condiciones: CondicionLaboral[]; relacionId: string; ingreso: string; mes: string; finalizadaEn: Date;
}): string | null {
  const consulta = ingreso > `${mes}-25` ? ingreso : `${mes}-25`;
  const vigentes = condiciones.filter((c) => c.relacionId === relacionId && c.dato === "sede_de_adscripcion" && c.vigenteDesde <= consulta
    && c.registradaEn <= finalizadaEn && (c.reemplazadaEn === null || c.reemplazadaEn > finalizadaEn))
    .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde) || a.registradaEn.getTime() - b.registradaEn.getTime());
  return String(vigentes.at(-1)?.valor ?? "") || null;
}

function hojaDeFuentes(fuentes: PreliquidacionParaExportar["fuentes"]): Fila[] {
  return [["Tipo de fuente", "Estado", "Filas (n.º)"], ...fuentes.map((fuente): Fila => [fuente.nombre, fuente.estado, fuente.filas])];
}

export function construirArchivoDePreliquidacion(preliquidacion: PreliquidacionParaExportar): ArchivoDePreliquidacion {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(encabezado(preliquidacion)), HOJA_DE_ENCABEZADO);
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(hojaDePersonas(preliquidacion.personas)), "Personas");
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(hojaDeConceptos(preliquidacion.personas, preliquidacion.mes)), "Conceptos");
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(hojaDeBases(preliquidacion.personas)), "Bases");
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(hojaDeFuentes(preliquidacion.fuentes)), "Fuentes");
  return { nombre: nombreDelArchivo(preliquidacion), contenido: XLSX.write(libro, { type: "array", bookType: "xlsx" }) as Uint8Array };
}
