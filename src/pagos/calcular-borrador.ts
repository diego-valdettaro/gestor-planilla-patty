import type { RelacionConPersona } from "@/relaciones-laborales/gestionar-relaciones-laborales";
import type { Corte, HechoDiarioDeAsistencia, RevisionDeAsistenciaParaPagos } from "@/periodos/hechos-para-pagos";
import { DATOS_LABORALES, NOMBRE_DE_DATO, esAfp, type DatoLaboral, type ValorLaboral } from "@/condiciones-laborales/catalogo";
import { buscarDefinicion, type CodigoDeReglaLegal } from "@/reglas-legales/catalogo";
import type { ImporteExterno } from "@/fuentes-externas/gestionar-fuentes-externas";
import type { SustitutorioParaPagos } from "@/descansos-y-feriados/gestionar-descansos-y-feriados";
import { formatearSoles } from "@/condiciones-laborales/valores";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";
import { desplazarFecha } from "@/turnos/semana";

import { bloqueoPorNetoNegativo, lineasDeFuentesExternas, netoDe, totalesPorSede, type TotalDeSede, type LineaDeFuenteExterna } from "./fuentes-en-el-neto";
import { asociarAbono, descansosDe, diasConvencionalesDelMes, fechasEnMes, mesesDelDescanso, repartirAbono, ventanaDeVacaciones, type DescansoVacacional } from "./vacaciones";

/** Decisión de Finanzas sobre una jornada de permiso o suspensión: con o sin goce de remuneración (#123). */
export interface ClasificacionDeGoce {
  dni: string;
  fecha: string;
  conGoce: boolean;
  clasificadoPorId: string;
  clasificadoEn: Date;
}

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
  /**
   * Estado vigente de los descansos sustitutorios que afectan el corte: los de origen dentro de él y los «no otorgados»
   * de un origen anterior verificados dentro del corte. Se lee en vivo: una revisión cerrada congela el estado de ese
   * momento, y pagar según ella duplicaría el adicional que se regulariza aquí.
   */
  sustitutorios: SustitutorioParaPagos[];
  /** Jornadas de origen anteriores al corte que hay que regularizar; falta la jornada si no se pudo leer su revisión. */
  hechosDeOrigenPorDni: Record<string, HechoDiarioDeAsistencia[]>;
  fuentesPendientes: string[];
  importes: ImporteExterno[];
  /**
   * Fechas con jornada «vacaciones» aprobada en Asistencia por DNI, del mes anterior al siguiente al de pago: incluye los días
   * del mes calendario posteriores al corte, que viven en períodos aún abiertos.
   */
  diasDeVacaciones: Record<string, string[]>;
  /** Abonos vacacionales no anulados de cualquier mes de aplicación. */
  abonosVacacionales: ImporteExterno[];
  /** Algún día de vacaciones viene de un período abierto, es decir, todavía puede cambiar. */
  vacacionesProvisionales: boolean;
  /** Clasificaciones de goce de permisos y suspensiones del corte; sin clasificación la jornada queda pendiente y bloquea. */
  clasificacionesDeGoce?: ClasificacionDeGoce[];
}

export interface LineaDeSueldo {
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

export interface LineaDeHoraExtra {
  concepto: "horas_extra_25" | "horas_extra_35";
  dias?: never;
  importeCentimos: number;
  minutos: number;
  fecha: string;
  grupo: string;
  mesDePago: string;
  corte: Corte;
  mesDeDevengue: string;
  origen: "Asistencia";
  evidencia: HechoDiarioDeAsistencia["evidencia"];
  remuneracionOrdinariaComputableCentimos: number;
  jornadaOrdinariaDiariaMinutos: number;
  sobretasaEnCentesimasDePunto: number;
}

export interface LineaDeTrabajoEnDescansoOFeriado {
  concepto: "trabajo_en_descanso_o_feriado";
  dias?: never;
  importeCentimos: number;
  minutos: number;
  fecha: string;
  grupo: string;
  clase: "descanso_semanal" | "feriado" | "primero_de_mayo";
  /** El adicional de un descanso sustitutorio no otorgado que se verificó después del corte de su día de origen. */
  regularizacion: boolean;
  mesDePago: string;
  corte: Corte;
  mesDeDevengue: string;
  origen: "Asistencia";
  evidencia: HechoDiarioDeAsistencia["evidencia"];
  remuneracionOrdinariaComputableCentimos: number;
  jornadaOrdinariaDiariaMinutos: number;
  sobretasaEnCentesimasDePunto: number;
}

/** Reducción por los minutos reales de tardanza; los minutos penalizados disciplinarios nunca la afectan. */
export interface LineaDeReduccionPorTardanza {
  concepto: "reduccion_por_tardanza";
  dias?: never;
  importeCentimos: number;
  minutos: number;
  fecha: string;
  grupo: string;
  mesDePago: string;
  corte: Corte;
  mesDeDevengue: string;
  origen: "Asistencia";
  evidencia: HechoDiarioDeAsistencia["evidencia"];
  remuneracionOrdinariaComputableCentimos: number;
  jornadaOrdinariaDiariaMinutos: number;
}

/** Reducción de un día de falta (o ausencia sin goce) o la proporcional del descanso semanal: una línea por hecho diario y causa. */
export interface LineaDeReduccionDeDia {
  concepto: "reduccion_por_falta" | "reduccion_por_descanso_semanal" | "reduccion_por_ausencia_sin_goce";
  dias: 1;
  importeCentimos: number;
  fecha: string;
  grupo: string;
  mesDePago: string;
  corte: Corte;
  mesDeDevengue: string;
  origen: "Asistencia";
  evidencia: HechoDiarioDeAsistencia["evidencia"];
  remuneracionOrdinariaComputableCentimos: number;
  /** Decisión de goce de Finanzas que originó la reducción; solo en permisos y suspensiones. */
  decision?: Pick<ClasificacionDeGoce, "conGoce" | "clasificadoPorId" | "clasificadoEn">;
}

export type LineaDeBorrador = LineaDeFuenteExterna | LineaDeReduccionDeDia | LineaDeReduccionPorTardanza | LineaDeSueldo | LineaDeRemuneracionVacacional | LineaDeAjusteDeVacaciones | LineaDeHoraExtra | LineaDeTrabajoEnDescansoOFeriado;

/** Reclasifica el sueldo básico de los días de descanso del mes; usa la base vigente al inicio del descanso. */
export interface LineaDeRemuneracionVacacional {
  concepto: "remuneracion_vacacional";
  dias: number;
  /** Días calendario de vacaciones de la línea; `dias` aplica la convención de 30 (el día 31 no suma). */
  diasCalendario: number;
  importeCentimos: number;
  desde: string;
  hasta: string;
  baseSueldoCentimos: number;
  inicioDelDescanso: string;
  finDelDescanso: string;
  mesDePago: string;
  corte: Corte;
  mesDeDevengue: string;
  origen: "Vacaciones aprobadas en Asistencia";
}

/** Diferencia entre el sueldo vigente cada día del descanso y la base vacacional fijada al inicio; puede ser negativa. */
export interface LineaDeAjusteDeVacaciones {
  concepto: "ajuste_por_variacion_de_sueldo_en_vacaciones";
  dias: number;
  importeCentimos: number;
  desde: string;
  hasta: string;
  baseSueldoCentimos: number;
  sueldoVigenteCentimos: number;
  inicioDelDescanso: string;
  finDelDescanso: string;
  mesDePago: string;
  corte: Corte;
  mesDeDevengue: string;
  origen: "Variación de sueldo durante el descanso";
}

type LineaDeRemuneracionMensual = LineaDeSueldo | LineaDeRemuneracionVacacional | LineaDeAjusteDeVacaciones;

/** Un mes calendario de un descanso: días, remuneración vacacional y el saldo tras los abonos asignados a ese mes. */
export interface VacacionesDelMes {
  mes: string;
  diasDeDescanso: number;
  diasConvencionales: number;
  /** null si falta el sueldo vigente al inicio del descanso. */
  remuneracionCentimos: number | null;
  abonosAsignadosCentimos: number;
  saldoCentimos: number | null;
}

export interface AbonoDelDescanso {
  id: string;
  fechaDelAbono: string;
  importeCentimos: number;
  mesDeAplicacion: string;
  asignaciones: Array<{ mes: string; centimos: number }>;
}

export interface DescansoVacacionalDelBorrador {
  inicio: string;
  fin: string;
  dias: number;
  baseSueldoCentimos: number | null;
  meses: VacacionesDelMes[];
  abonos: AbonoDelDescanso[];
}

export function totalDeHorasExtraCentimos(lineas: LineaDeBorrador[]): number {
  return lineas.reduce((total, linea) => total + (linea.concepto === "horas_extra_25" || linea.concepto === "horas_extra_35" ? linea.importeCentimos : 0), 0);
}

export function totalDeTrabajoEnDescansoOFeriadoCentimos(lineas: LineaDeBorrador[]): number {
  return lineas.reduce((total, linea) => total + (linea.concepto === "trabajo_en_descanso_o_feriado" ? linea.importeCentimos : 0), 0);
}

export interface PersonaDeBorrador {
  relacion: RelacionConPersona;
  sedeDeAdscripcion: string | null;
  lineas: LineaDeBorrador[];
  bloqueos: string[];
  /** Sueldo básico + remuneración vacacional + su ajuste: reclasificar vacaciones no cambia el total mensual. */
  sueldoCalculadoCentimos: number;
  vacaciones: DescansoVacacionalDelBorrador[];
  netoCentimos: number | null;
}

export interface BorradorDePagos {
  mesDePago: string;
  corte: Corte;
  revisiones: RevisionDeAsistenciaParaPagos[];
  personas: PersonaDeBorrador[];
  bloqueosDelMes: string[];
  sueldoCalculadoCentimos: number;
  vacacionesProvisionales: boolean;
  totalesPorSede: TotalDeSede[];
  /** Suma de los netos de las personas calculadas. */
  netoCalculadoCentimos: number;
  /** Personas sin neto por un bloqueo propio. */
  personasBloqueadas: number;
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

interface Pieza { inicio: string; fin: string; descanso: DescansoVacacional | null; vacaciones: number }

/** Parte un tramo de sueldo en piezas de días normales y días de descanso, en orden de fecha. */
function piezasDelTramo(inicio: string, fin: string, descansos: DescansoVacacional[]): Pieza[] {
  const piezas: Pieza[] = [];
  for (let fecha = inicio; fecha <= fin; fecha = desplazarFecha(fecha, 1)) {
    const descanso = descansos.find((candidato) => candidato.fechas.includes(fecha)) ?? null;
    const ultima = piezas.at(-1);
    if (ultima && ultima.descanso === descanso) {
      ultima.fin = fecha;
      if (descanso) ultima.vacaciones += 1;
    } else {
      piezas.push({ inicio: fecha, fin: fecha, descanso, vacaciones: descanso ? 1 : 0 });
    }
  }
  return piezas;
}

function lineasDelMes(entrada: EntradaDeBorrador, relacion: RelacionConPersona, mes: string, descansos: DescansoVacacional[]): { lineas: LineaDeRemuneracionMensual[]; bloqueos: string[] } {
  const primero = `${mes}-01`;
  const ultimo = finDeMes(mes);
  const desde = relacion.ingreso > primero ? relacion.ingreso : primero;
  const cese = relacion.ceseConfirmado ? relacion.cese : null;
  const hasta = cese && cese < ultimo ? cese : ultimo;
  if (desde > hasta) return { lineas: [], bloqueos: [] };

  const cambios = entrada.condiciones.filter((dato) => dato.relacionId === relacion.id && dato.dato === "sueldo" && dato.vigenteDesde > desde && dato.vigenteDesde <= hasta)
    .map((dato) => dato.vigenteDesde).sort();
  const inicios = [desde, ...new Set(cambios)];
  const lineas: LineaDeRemuneracionMensual[] = [];
  const bloqueos: string[] = [];
  const sinBase = new Set<string>();
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
    // Los días de descanso del tramo salen del sueldo básico y los paga la remuneración vacacional, sin sumar días.
    for (const pieza of piezasDelTramo(inicio, fin, descansos)) {
      const dias = diasDeTreinta(pieza.inicio, pieza.fin, diasAsignados);
      if (dias <= 0) continue;
      const comunes = { desde: pieza.inicio, hasta: pieza.fin, mesDePago: entrada.mesDePago, corte: entrada.corte, mesDeDevengue: mes };
      if (!pieza.descanso) {
        diasAsignados += dias;
        lineas.push({ concepto: "sueldo_basico", importeCentimos: mitadArriba(sueldo * dias, 30), dias, sueldoMensualCentimos: sueldo, ...comunes, origen: "Condición laboral" });
        continue;
      }
      const base = sueldoEn(entrada, relacion.id, pieza.descanso.inicio);
      if (base === undefined) {
        if (!sinBase.has(pieza.descanso.inicio)) bloqueos.push(`Sin sueldo vigente al inicio del descanso vacacional del ${formatearFechaDeRelacion(pieza.descanso.inicio)}. Registre el valor en Condiciones laborales.`);
        sinBase.add(pieza.descanso.inicio);
        continue;
      }
      diasAsignados += dias;
      const remuneracion = mitadArriba(base * dias, 30);
      const descanso = { inicioDelDescanso: pieza.descanso.inicio, finDelDescanso: pieza.descanso.fin };
      lineas.push({ concepto: "remuneracion_vacacional", importeCentimos: remuneracion, dias, diasCalendario: pieza.vacaciones, baseSueldoCentimos: base, ...descanso, ...comunes, origen: "Vacaciones aprobadas en Asistencia" });
      const ajuste = mitadArriba(sueldo * dias, 30) - remuneracion;
      if (ajuste !== 0) lineas.push({ concepto: "ajuste_por_variacion_de_sueldo_en_vacaciones", importeCentimos: ajuste, dias, baseSueldoCentimos: base, sueldoVigenteCentimos: sueldo, ...descanso, ...comunes, origen: "Variación de sueldo durante el descanso" });
    }
  }
  return { lineas, bloqueos };
}

/** Desglose por mes de los descansos que tocan el mes de pago y reparto de los abonos anticipados entre sus meses. */
function vacacionesDeLaPersona(entrada: EntradaDeBorrador, relacion: RelacionConPersona, mesesDePago: string[], descansos: DescansoVacacional[], lineas: LineaDeBorrador[]): { vacaciones: DescansoVacacionalDelBorrador[]; bloqueos: string[] } {
  const ventana = ventanaDeVacaciones(entrada.mesDePago);
  const cese = relacion.ceseConfirmado ? relacion.cese : null;
  const delDescanso = new Map<string, AbonoDelDescanso[]>();
  const bloqueos: string[] = [];
  for (const abono of entrada.abonosVacacionales.filter((candidato) => candidato.dni === relacion.dni && candidato.anuladoEn === null)) {
    // Un abono entregado antes de la ventana solo se ata si se aplicó en este mes: su descanso podría ser uno anterior que no se leyó.
    if (abono.fechaDelHecho < ventana.inicio && abono.mesDeAplicacion !== entrada.mesDePago) continue;
    // El abono pertenece a la relación laboral en que se entregó, aunque otra del mismo DNI tenga descansos posteriores.
    const enLaRelacion = abono.fechaDelHecho >= relacion.ingreso && (cese === null || abono.fechaDelHecho <= cese);
    const descanso = enLaRelacion ? asociarAbono(descansos, abono.fechaDelHecho) : undefined;
    if (!descanso) {
      if (abono.mesDeAplicacion === entrada.mesDePago) {
        bloqueos.push(`El abono vacacional del ${formatearFechaDeRelacion(abono.fechaDelHecho)} por ${formatearSoles(abono.monto)} no tiene un descanso con vacaciones aprobadas desde esa fecha. Revise las vacaciones en Asistencia o anule el abono.`);
      }
      continue;
    }
    const asignado: AbonoDelDescanso = { id: abono.id, fechaDelAbono: abono.fechaDelHecho, importeCentimos: abono.monto, mesDeAplicacion: abono.mesDeAplicacion, asignaciones: repartirAbono(descanso, abono.monto) };
    delDescanso.set(descanso.inicio, [...(delDescanso.get(descanso.inicio) ?? []), asignado]);
  }
  const vacaciones = descansos.filter((descanso) => mesesDelDescanso(descanso).some((mes) => mesesDePago.includes(mes))).map((descanso): DescansoVacacionalDelBorrador => {
    const base = sueldoEn(entrada, relacion.id, descanso.inicio) ?? null;
    const asignados = delDescanso.get(descanso.inicio) ?? [];
    const meses = mesesDelDescanso(descanso).map((mes): VacacionesDelMes => {
      const fechas = fechasEnMes(descanso, mes);
      const diasConvencionales = diasConvencionalesDelMes(fechas, mes);
      const delMes = lineas.filter((linea): linea is LineaDeRemuneracionVacacional => linea.concepto === "remuneracion_vacacional" && linea.inicioDelDescanso === descanso.inicio && linea.mesDeDevengue === mes);
      const remuneracion = delMes.length ? delMes.reduce((suma, linea) => suma + linea.importeCentimos, 0) : base === null ? null : mitadArriba(base * diasConvencionales, 30);
      const abonosAsignados = asignados.reduce((suma, abono) => suma + (abono.asignaciones.find((asignacion) => asignacion.mes === mes)?.centimos ?? 0), 0);
      return { mes, diasDeDescanso: fechas.length, diasConvencionales, remuneracionCentimos: remuneracion, abonosAsignadosCentimos: abonosAsignados, saldoCentimos: remuneracion === null ? null : remuneracion - abonosAsignados };
    });
    return { inicio: descanso.inicio, fin: descanso.fin, dias: descanso.fechas.length, baseSueldoCentimos: base, meses, abonos: asignados };
  });
  return { vacaciones, bloqueos };
}

function reglaEn(entrada: EntradaDeBorrador, codigo: CodigoDeReglaLegal, fecha: string): number | undefined {
  return entrada.reglas.filter((regla) => regla.codigo === codigo && regla.vigenteDesde <= fecha)
    .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde)).at(-1)?.valor;
}

interface BaseDeValoracion { remuneracionOrdinariaComputableCentimos: number; jornada: number; }

/** Base común del valor hora y del valor día: sueldo más asignación familiar otorgada, y jornada pactada vigentes en la fecha. */
function baseDeValoracion(entrada: EntradaDeBorrador, relacion: RelacionConPersona, fecha: string): BaseDeValoracion | { bloqueo: string } {
  const sueldo = sueldoEn(entrada, relacion.id, fecha);
  const jornada = Number(condicionEn(entrada, relacion.id, "jornada_ordinaria_diaria", fecha));
  // El booleano registra el beneficio que Patty ya otorgó, también en REMYPE; el DNI del menor se verifica fuera.
  const familiar = condicionEn(entrada, relacion.id, "elegibilidad_familiar", fecha);
  const rmv = reglaEn(entrada, "rmv", fecha);
  const porcentajeFamiliar = reglaEn(entrada, "asignacion_familiar_porcentaje_de_rmv", fecha);
  if (!sueldo || !jornada || familiar === undefined) {
    return { bloqueo: `Falta remuneración ordinaria computable o jornada ordinaria diaria vigente el ${fecha}. Revise Condiciones laborales y Reglas legales.` };
  }
  if (familiar === true && (rmv === undefined || porcentajeFamiliar === undefined)) {
    return { bloqueo: `Falta la regla de asignación familiar vigente el ${fecha}. Revise Reglas legales.` };
  }
  // Las comisiones externas son complementarias variables: no forman parte del valor hora ni del valor día.
  const asignacionFamiliarCentimos = familiar === true && rmv !== undefined && porcentajeFamiliar !== undefined
    ? rmv * porcentajeFamiliar / 10_000 : 0;
  return { remuneracionOrdinariaComputableCentimos: sueldo + asignacionFamiliarCentimos, jornada };
}

function horasExtraDelCorte(entrada: EntradaDeBorrador, relacion: RelacionConPersona, hechos: HechoDiarioDeAsistencia[]): {
  lineas: LineaDeHoraExtra[]; bloqueos: string[];
} {
  const lineas: LineaDeHoraExtra[] = [];
  const bloqueos: string[] = [];
  for (const hecho of hechos) {
    const extra = hecho.horaExtra;
    if (!extra) continue;
    if (extra.estado === "descartada") continue;
    if (extra.trabajoNocturno) {
      bloqueos.push(`Trabajo entre 22:00 y 06:00 el ${hecho.fecha}. Aún no se calcula; la finalización queda bloqueada hasta definir y validar la regla.`);
      continue;
    }
    if (extra.estado === "pendiente") {
      bloqueos.push(`Hay horas extra pendientes de decisión el ${hecho.fecha}. Revise la candidata en Períodos.`);
      continue;
    }
    const base = baseDeValoracion(entrada, relacion, hecho.fecha);
    if ("bloqueo" in base) {
      bloqueos.push(base.bloqueo);
      continue;
    }
    const { remuneracionOrdinariaComputableCentimos, jornada } = base;
    for (const [concepto, minutos, codigo] of [
      ["horas_extra_25", extra.minutosAl25, "horas_extra_sobretasa_primeras_dos_horas"],
      ["horas_extra_35", extra.minutosAl35, "horas_extra_sobretasa_horas_posteriores"],
    ] as const) {
      if (minutos <= 0) continue;
      const sobretasa = reglaEn(entrada, codigo, hecho.fecha);
      if (sobretasa === undefined) {
        bloqueos.push(`No hay ${buscarDefinicion(codigo)?.nombre ?? codigo} vigente el ${hecho.fecha}. Active el valor en Reglas legales.`);
        continue;
      }
      lineas.push({ concepto, minutos, fecha: hecho.fecha, grupo: hecho.grupo, mesDePago: entrada.mesDePago, corte: entrada.corte,
        mesDeDevengue: hecho.fecha.slice(0, 7), origen: "Asistencia", evidencia: hecho.evidencia,
        remuneracionOrdinariaComputableCentimos, jornadaOrdinariaDiariaMinutos: jornada,
        sobretasaEnCentesimasDePunto: sobretasa,
        importeCentimos: Math.floor(remuneracionOrdinariaComputableCentimos * minutos * (10_000 + sobretasa) / (30 * jornada * 10_000) + 0.5),
      });
    }
  }
  return { lineas, bloqueos };
}

const MARCA_DE_SOBRETASA = {
  descanso_semanal: { codigo: "trabajo_en_descanso_o_feriado_sobretasa", etiqueta: "descanso o feriado" },
  feriado: { codigo: "trabajo_en_descanso_o_feriado_sobretasa", etiqueta: "descanso o feriado" },
  primero_de_mayo: { codigo: "trabajo_en_primero_de_mayo_sobretasa", etiqueta: "1 de mayo" },
} as const satisfies Record<LineaDeTrabajoEnDescansoOFeriado["clase"], { codigo: CodigoDeReglaLegal; etiqueta: string }>;

/** El feriado manda sobre el descanso semanal cuando coinciden, y el 1 de mayo es el más específico (como `origenDeSustitutorio`). */
function claseDelDiaEspecial(diaEspecial: NonNullable<HechoDiarioDeAsistencia["diaEspecial"]>): LineaDeTrabajoEnDescansoOFeriado["clase"] {
  return diaEspecial.feriado ?? "descanso_semanal";
}

/**
 * Adicional por trabajar en el descanso semanal asignado o en un feriado sin descanso sustitutorio (ADR 0009).
 * VALIDAR CON FINANZAS O EL CONTADOR (#96, #124): la fórmula y las sobretasas siguen pendientes de validación legal.
 *
 *   importe = remuneración ordinaria computable × minutos ÷ (30 × jornada ordinaria diaria) × (1 + sobretasa)
 *
 * - Solo una jornada trabajada en un día con `diaEspecial` genera la línea; un domingo sin descanso asignado no.
 * - Sustitutorio «previsto» u «otorgado»: sin línea. «No otorgado»: se debe el adicional; va en el pago del día de
 *   origen si se verificó hasta el fin de su corte y, si se verificó después, se regulariza en el pago cuyo corte
 *   contiene la fecha de verificación, con el devengue original. Sin sustitutorio: línea provisional.
 * - Los minutos de horas extra del mismo día se valoran en su propio concepto: aquí solo cuentan los minutos
 *   ordinarios, para que ningún minuto se pague dos veces.
 */
function trabajoEnDescansoOFeriadoDelCorte(entrada: EntradaDeBorrador, relacion: RelacionConPersona, hechos: HechoDiarioDeAsistencia[]): {
  lineas: LineaDeTrabajoEnDescansoOFeriado[]; bloqueos: string[];
} {
  const lineas: LineaDeTrabajoEnDescansoOFeriado[] = [];
  const bloqueos: string[] = [];
  const sustitutorioDe = (fecha: string) => entrada.sustitutorios.find((candidato) => candidato.dni === relacion.dni && candidato.origenFecha === fecha);

  const valorar = (hecho: HechoDiarioDeAsistencia, regularizacion: boolean) => {
    const diaEspecial = hecho.diaEspecial;
    const minutos = hecho.minutosTrabajados - (hecho.horaExtra ? hecho.horaExtra.minutosAl25 + hecho.horaExtra.minutosAl35 : 0);
    if (hecho.resultado !== "trabajada" || !diaEspecial || minutos <= 0) return;
    const base = baseDeValoracion(entrada, relacion, hecho.fecha);
    if ("bloqueo" in base) {
      bloqueos.push(base.bloqueo);
      return;
    }
    const clase = claseDelDiaEspecial(diaEspecial);
    const { codigo, etiqueta } = MARCA_DE_SOBRETASA[clase];
    const sobretasa = reglaEn(entrada, codigo, hecho.fecha);
    if (sobretasa === undefined) {
      bloqueos.push(`No hay ${buscarDefinicion(codigo)?.nombre ?? codigo} vigente el ${hecho.fecha} (${etiqueta}). Active el valor en Reglas legales.`);
      return;
    }
    lineas.push({ concepto: "trabajo_en_descanso_o_feriado", minutos, fecha: hecho.fecha, grupo: hecho.grupo, clase, regularizacion,
      mesDePago: entrada.mesDePago, corte: entrada.corte, mesDeDevengue: hecho.fecha.slice(0, 7), origen: "Asistencia", evidencia: hecho.evidencia,
      remuneracionOrdinariaComputableCentimos: base.remuneracionOrdinariaComputableCentimos, jornadaOrdinariaDiariaMinutos: base.jornada,
      sobretasaEnCentesimasDePunto: sobretasa,
      importeCentimos: Math.floor(base.remuneracionOrdinariaComputableCentimos * minutos * (10_000 + sobretasa) / (30 * base.jornada * 10_000) + 0.5),
    });
  };

  for (const hecho of hechos) {
    const sustitutorio = sustitutorioDe(hecho.fecha);
    if (sustitutorio?.estado === "previsto" || sustitutorio?.estado === "otorgado") continue;
    // Verificado después del corte: lo paga el pago cuyo corte contiene la verificación.
    if (sustitutorio?.estado === "no_otorgado" && sustitutorio.verificadoEnLima !== null && sustitutorio.verificadoEnLima > entrada.corte.fin) continue;
    valorar(hecho, false);
  }

  const origenes = entrada.hechosDeOrigenPorDni[relacion.dni] ?? [];
  for (const sustitutorio of entrada.sustitutorios) {
    if (sustitutorio.dni !== relacion.dni || sustitutorio.estado !== "no_otorgado" || sustitutorio.origenFecha >= entrada.corte.inicio) continue;
    if (sustitutorio.verificadoEnLima === null || sustitutorio.verificadoEnLima < entrada.corte.inicio || sustitutorio.verificadoEnLima > entrada.corte.fin) continue;
    if (sustitutorio.origenFecha < relacion.ingreso || (relacion.ceseConfirmado && relacion.cese !== null && sustitutorio.origenFecha > relacion.cese)) continue;
    const origen = origenes.find((hecho) => hecho.fecha === sustitutorio.origenFecha);
    if (!origen) {
      bloqueos.push(`No se pudo leer la jornada del ${sustitutorio.origenFecha} para regularizar su descanso sustitutorio no otorgado. Revise la revisión de asistencia en Períodos.`);
      continue;
    }
    valorar(origen, true);
  }
  return { lineas, bloqueos };
}

/** Reducciones del corte por incidencias de asistencia (#123): tardanza real, falta, descanso semanal y ausencia sin goce. */
function reduccionesDelCorte(entrada: EntradaDeBorrador, relacion: RelacionConPersona, hechos: HechoDiarioDeAsistencia[]): {
  lineas: Array<LineaDeReduccionPorTardanza | LineaDeReduccionDeDia>; bloqueos: string[];
} {
  const lineas: Array<LineaDeReduccionPorTardanza | LineaDeReduccionDeDia> = [];
  const bloqueos: string[] = [];
  for (const hecho of hechos) {
    const esAusencia = hecho.resultado === "permiso" || hecho.resultado === "suspension";
    if (hecho.resultado === "falta" || esAusencia) {
      const clasificacion = esAusencia ? entrada.clasificacionesDeGoce?.find((candidata) => candidata.dni === relacion.dni && candidata.fecha === hecho.fecha) : undefined;
      if (esAusencia && !clasificacion) {
        bloqueos.push(`${hecho.resultado === "permiso" ? "El permiso" : "La suspensión"} del ${hecho.fecha} no tiene clasificación de goce. Finanzas debe clasificarla con o sin goce en Pagos; no se asume sin goce.`);
        continue;
      }
      if (clasificacion?.conGoce) continue;
      const base = baseDeValoracion(entrada, relacion, hecho.fecha);
      if ("bloqueo" in base) {
        bloqueos.push(base.bloqueo);
        continue;
      }
      const comunes = { dias: 1 as const, fecha: hecho.fecha, grupo: hecho.grupo, mesDePago: entrada.mesDePago, corte: entrada.corte,
        mesDeDevengue: hecho.fecha.slice(0, 7), origen: "Asistencia" as const, evidencia: hecho.evidencia,
        remuneracionOrdinariaComputableCentimos: base.remuneracionOrdinariaComputableCentimos,
        ...(clasificacion ? { decision: { conGoce: clasificacion.conGoce, clasificadoPorId: clasificacion.clasificadoPorId, clasificadoEn: clasificacion.clasificadoEn } } : {}) };
      // El valor día es la remuneración ordinaria ÷ 30; el descanso semanal proporcional es un treintavo de ese valor día.
      lineas.push({ concepto: esAusencia ? "reduccion_por_ausencia_sin_goce" : "reduccion_por_falta", importeCentimos: Math.floor(base.remuneracionOrdinariaComputableCentimos / 30 + 0.5), ...comunes });
      lineas.push({ concepto: "reduccion_por_descanso_semanal", importeCentimos: Math.floor(base.remuneracionOrdinariaComputableCentimos / 900 + 0.5), ...comunes });
      continue;
    }
    if (hecho.resultado !== "trabajada" || !hecho.tardanza || hecho.tardanza.minutos <= 0) continue;
    const base = baseDeValoracion(entrada, relacion, hecho.fecha);
    if ("bloqueo" in base) {
      bloqueos.push(base.bloqueo);
      continue;
    }
    lineas.push({ concepto: "reduccion_por_tardanza", minutos: hecho.tardanza.minutos, fecha: hecho.fecha, grupo: hecho.grupo,
      mesDePago: entrada.mesDePago, corte: entrada.corte, mesDeDevengue: hecho.fecha.slice(0, 7), origen: "Asistencia", evidencia: hecho.evidencia,
      remuneracionOrdinariaComputableCentimos: base.remuneracionOrdinariaComputableCentimos, jornadaOrdinariaDiariaMinutos: base.jornada,
      importeCentimos: Math.floor(base.remuneracionOrdinariaComputableCentimos * hecho.tardanza.minutos / (30 * base.jornada) + 0.5) });
  }
  return { lineas, bloqueos };
}

/** Calcula sueldo, sobretiempo y trabajo en descanso o feriado del borrador; los demás conceptos entran en sus tickets propios. */
export function calcularBorrador(entrada: EntradaDeBorrador): BorradorDePagos {
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
    const descansos = descansosDe((entrada.diasDeVacaciones[relacion.dni] ?? []).filter((fecha) =>
      fecha >= relacion.ingreso && (!relacion.ceseConfirmado || relacion.cese === null || fecha <= relacion.cese)));
    const actual = lineasDelMes(entrada, relacion, mes, descansos);
    const conArrastre = relacion.ingreso.slice(0, 7) === anterior && Number(relacion.ingreso.slice(-2)) > 25;
    const arrastre = conArrastre ? lineasDelMes(entrada, relacion, anterior, descansos) : { lineas: [], bloqueos: [] };
    const hechos = (entrada.hechosPorDni[relacion.dni] ?? []).filter((hecho) =>
      hecho.fecha >= relacion.ingreso && (!relacion.ceseConfirmado || relacion.cese === null || hecho.fecha <= relacion.cese));
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
    const sobretiempo = horasExtraDelCorte(entrada, relacion, hechos);
    bloqueos.push(...sobretiempo.bloqueos);
    const enDescanso = trabajoEnDescansoOFeriadoDelCorte(entrada, relacion, hechos);
    bloqueos.push(...enDescanso.bloqueos);
    const reduccionesDeAsistencia = reduccionesDelCorte(entrada, relacion, hechos);
    bloqueos.push(...reduccionesDeAsistencia.bloqueos);
    // El sueldo es visible aun cuando otro concepto o la cobertura impida un neto confiable.
    const externas = lineasDeFuentesExternas(entrada.importes, relacion.dni, mes, entrada.corte);
    const lineas: LineaDeBorrador[] = [...arrastre.lineas, ...actual.lineas, ...sobretiempo.lineas, ...enDescanso.lineas, ...reduccionesDeAsistencia.lineas, ...externas];
    const desglose = vacacionesDeLaPersona(entrada, relacion, conArrastre ? [anterior, mes] : [mes], descansos, lineas);
    bloqueos.push(...desglose.bloqueos);
    const sueldoCalculadoCentimos = [...arrastre.lineas, ...actual.lineas].reduce((suma, linea) => suma + linea.importeCentimos, 0);
    const neto = entrada.fuentesPendientes.length || bloqueos.length ? null : netoDe(externas, sueldoCalculadoCentimos);
    if (neto !== null && neto < 0) bloqueos.push(bloqueoPorNetoNegativo(neto));
    return { relacion, vacaciones: desglose.vacaciones, sedeDeAdscripcion: String(condicionEn(entrada, relacion.id, "sede_de_adscripcion", fechaDeConsulta) ?? "") || null,
      lineas, bloqueos, sueldoCalculadoCentimos, netoCentimos: neto === null || neto < 0 ? null : neto };
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
    vacacionesProvisionales: entrada.vacacionesProvisionales,
    sueldoCalculadoCentimos: personas.reduce((suma, persona) => suma + persona.sueldoCalculadoCentimos, 0),
    totalesPorSede: totalesPorSede(personas), netoCalculadoCentimos: personas.reduce((suma, persona) => suma + (persona.netoCentimos ?? 0), 0),
    personasBloqueadas: personas.filter(({ bloqueos }) => bloqueos.length > 0).length };
}
