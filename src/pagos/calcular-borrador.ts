import type { RelacionConPersona } from "@/relaciones-laborales/gestionar-relaciones-laborales";
import type { Corte, HechoDiarioDeAsistencia, RevisionDeAsistenciaParaPagos } from "@/periodos/hechos-para-pagos";
import { DATOS_LABORALES, NOMBRE_DE_DATO, esAfp, type DatoLaboral, type ValorLaboral } from "@/condiciones-laborales/catalogo";
import { buscarDefinicion, type CodigoDeReglaLegal } from "@/reglas-legales/catalogo";
import type { ImporteExterno } from "@/fuentes-externas/gestionar-fuentes-externas";

/** Entrada coherente y ya leída. El cálculo nunca consulta la base. */
export interface EntradaDeBorrador {
  mesDePago: string;
  corte: Corte;
  relaciones: RelacionConPersona[];
  condiciones: Array<{ relacionId: string; dato: DatoLaboral; valor: ValorLaboral; vigenteDesde: string }>;
  reglas: Array<{ codigo: CodigoDeReglaLegal; valor: number; vigenteDesde: string }>;
  problemasDelCorte: string[];
  revisiones: RevisionDeAsistenciaParaPagos[];
  hechosPorDni: Record<string, HechoDiarioDeAsistencia[]>;
  fuentesPendientes: string[];
  importes: ImporteExterno[];
}

export interface LineaDeBorrador {
  concepto: "sueldo_basico";
  importeCentimos: number;
  dias: number;
  sueldoMensualCentimos: number;
  desde: string;
  hasta: string;
  mesDePago: string;
  corte: Corte;
  mesDeDevengue: string;
  origen: "Condición laboral";
}

export interface PersonaDeBorrador {
  relacion: RelacionConPersona;
  sedeDeAdscripcion: string | null;
  lineas: LineaDeBorrador[];
  bloqueos: string[];
  sueldoCalculadoCentimos: number;
  netoCentimos: number | null;
}

export interface BorradorDeSueldo {
  mesDePago: string;
  corte: Corte;
  revisiones: RevisionDeAsistenciaParaPagos[];
  personas: PersonaDeBorrador[];
  bloqueosDelMes: string[];
  sueldoCalculadoCentimos: number;
}

function finDeMes(mes: string): string {
  const [anio, numero] = mes.split("-").map(Number);
  return new Date(Date.UTC(anio, numero, 0)).toISOString().slice(0, 10);
}

function mesAnterior(mes: string): string {
  const [anio, numero] = mes.split("-").map(Number);
  return new Date(Date.UTC(anio, numero - 2, 1)).toISOString().slice(0, 7);
}

function diasDeTreinta(desde: string, hasta: string, yaAsignados: number): number {
  const mes = desde.slice(0, 7);
  const inicio = Number(desde.slice(-2));
  if (inicio === 31) return yaAsignados === 0 ? 1 : 0;
  const fin = hasta === finDeMes(mes) ? 30 : Math.min(Number(hasta.slice(-2)), 30);
  // En febrero el último día completa el mes convencional. El 31 no suma a días ya devengados.
  return Math.min(Math.max(0, 30 - yaAsignados), Math.max(0, fin - inicio + 1));
}

function mitadArriba(numerador: number, divisor: number): number {
  return Math.floor((numerador + divisor / 2) / divisor);
}

function sueldoEn(entrada: EntradaDeBorrador, relacionId: string, fecha: string): number | undefined {
  return Number(condicionEn(entrada, relacionId, "sueldo", fecha)) || undefined;
}

function condicionEn(entrada: EntradaDeBorrador, relacionId: string, datoBuscado: DatoLaboral, fecha: string): ValorLaboral | undefined {
  const vigentes = entrada.condiciones.filter((dato) => dato.relacionId === relacionId && dato.dato === datoBuscado && dato.vigenteDesde <= fecha)
    .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
  return vigentes.at(-1)?.valor;
}

function lineasDelMes(entrada: EntradaDeBorrador, relacion: RelacionConPersona, mes: string): { lineas: LineaDeBorrador[]; bloqueos: string[] } {
  const primero = `${mes}-01`;
  const ultimo = finDeMes(mes);
  const desde = relacion.ingreso > primero ? relacion.ingreso : primero;
  const cese = relacion.ceseConfirmado ? relacion.cese : null;
  const hasta = cese && cese < ultimo ? cese : ultimo;
  if (desde > hasta) return { lineas: [], bloqueos: [] };

  const cambios = entrada.condiciones.filter((dato) => dato.relacionId === relacion.id && dato.dato === "sueldo" && dato.vigenteDesde > desde && dato.vigenteDesde <= hasta)
    .map((dato) => dato.vigenteDesde).sort();
  const inicios = [desde, ...new Set(cambios)];
  const lineas: LineaDeBorrador[] = [];
  const bloqueos: string[] = [];
  let diasAsignados = 0;
  for (let i = 0; i < inicios.length; i += 1) {
    const inicio = inicios[i];
    const siguiente = inicios[i + 1];
    const fin = siguiente ? new Date(Date.parse(`${siguiente}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : hasta;
    const sueldo = sueldoEn(entrada, relacion.id, inicio);
    if (sueldo === undefined) {
      bloqueos.push(`Sin sueldo vigente el ${inicio}. Registre el valor en Condiciones laborales.`);
      continue;
    }
    const dias = diasDeTreinta(inicio, fin, diasAsignados);
    if (dias <= 0) continue;
    diasAsignados += dias;
    lineas.push({ concepto: "sueldo_basico", importeCentimos: mitadArriba(sueldo * dias, 30), dias,
      sueldoMensualCentimos: sueldo, desde: inicio, hasta: fin, mesDePago: entrada.mesDePago,
      corte: entrada.corte, mesDeDevengue: mes, origen: "Condición laboral" });
  }
  return { lineas, bloqueos };
}

/** Sueldo calculable del borrador. Otros conceptos siguen pendientes hasta que sus reglas entren en tickets propios. */
export function calcularBorrador(entrada: EntradaDeBorrador): BorradorDeSueldo {
  const mes = entrada.mesDePago;
  const anterior = mesAnterior(mes);
  const bloqueosDelMes = [...entrada.problemasDelCorte, ...entrada.fuentesPendientes.map((tipo) => `Fuente externa pendiente: ${tipo}.`)];
  const personas = entrada.relaciones.filter((relacion) => {
    if (!relacion.ingresoConfirmado) return false;
    const cese = relacion.ceseConfirmado ? relacion.cese : null;
    const empieza = `${mes}-01`;
    const termina = finDeMes(mes);
    const enMes = relacion.ingreso <= termina && (cese === null || cese >= empieza) && relacion.ingreso <= `${mes}-25`;
    const arrastre = relacion.ingreso.slice(0, 7) === anterior && Number(relacion.ingreso.slice(-2)) > 25;
    return enMes || arrastre;
  }).map((relacion): PersonaDeBorrador => {
    const actual = lineasDelMes(entrada, relacion, mes);
    const arrastre = relacion.ingreso.slice(0, 7) === anterior && Number(relacion.ingreso.slice(-2)) > 25
      ? lineasDelMes(entrada, relacion, anterior) : { lineas: [], bloqueos: [] };
    const hechos = entrada.hechosPorDni[relacion.dni] ?? [];
    const bloqueos = [...actual.bloqueos, ...arrastre.bloqueos];
    const fechaDeConsulta = relacion.ingreso > `${mes}-25` ? relacion.ingreso : `${mes}-25`;
    const afiliacion = condicionEn(entrada, relacion.id, "afiliacion_pensionaria", fechaDeConsulta);
    for (const dato of DATOS_LABORALES) {
      if (dato === "sueldo" || (dato === "comision_afp" && !esAfp(afiliacion))) continue;
      if (condicionEn(entrada, relacion.id, dato, fechaDeConsulta) === undefined) {
        bloqueos.push(`Sin ${NOMBRE_DE_DATO[dato].toLocaleLowerCase("es")} vigente el ${fechaDeConsulta}. Registre el valor en Condiciones laborales.`);
      }
    }
    if (hechos.some((hecho) => hecho.resultado === "pendiente")) bloqueos.push("Hay jornadas pendientes de revisión en el corte de incidencias.");
    if (hechos.some((hecho) => hecho.horaExtra?.trabajoNocturno)) bloqueos.push("Hay trabajo entre 22:00 y 06:00 sin regla de cálculo.");
    // El sueldo es visible aun cuando otro concepto o la cobertura impida un neto confiable.
    const lineas = [...arrastre.lineas, ...actual.lineas];
    return { relacion, sedeDeAdscripcion: String(condicionEn(entrada, relacion.id, "sede_de_adscripcion", fechaDeConsulta) ?? "") || null,
      lineas, bloqueos, sueldoCalculadoCentimos: lineas.reduce((suma, linea) => suma + linea.importeCentimos, 0), netoCentimos: null };
  }).sort((a, b) => a.relacion.nombre.localeCompare(b.relacion.nombre) || a.relacion.dni.localeCompare(b.relacion.dni));
  if (personas.length) {
    const necesarias = new Set<CodigoDeReglaLegal>(["essalud_tasa", "essalud_base_minima"]);
    for (const persona of personas) {
      const afiliacion = condicionEn(entrada, persona.relacion.id, "afiliacion_pensionaria", `${mes}-25`);
      if (afiliacion === "onp") necesarias.add("onp_tasa");
      if (esAfp(afiliacion)) {
        necesarias.add("afp_aporte_obligatorio");
        necesarias.add("afp_prima_seguro");
        necesarias.add("afp_remuneracion_maxima_asegurable");
        const comision = condicionEn(entrada, persona.relacion.id, "comision_afp", `${mes}-25`);
        if (comision === "flujo" || comision === "mixta") necesarias.add(`${afiliacion}_comision_${comision}` as CodigoDeReglaLegal);
      }
      if (condicionEn(entrada, persona.relacion.id, "elegibilidad_familiar", `${mes}-25`) === true) {
        necesarias.add("rmv");
        necesarias.add("asignacion_familiar_porcentaje_de_rmv");
      }
    }
    for (const codigo of necesarias) {
      if (!entrada.reglas.some((regla) => regla.codigo === codigo && regla.vigenteDesde <= `${mes}-25`)) {
        bloqueosDelMes.push(`No hay ${buscarDefinicion(codigo)?.nombre ?? codigo} vigente para ${mes}. Active el valor en Reglas legales.`);
      }
    }
  }
  return { mesDePago: mes, corte: entrada.corte, revisiones: entrada.revisiones, personas, bloqueosDelMes,
    sueldoCalculadoCentimos: personas.reduce((suma, persona) => suma + persona.sueldoCalculadoCentimos, 0) };
}
