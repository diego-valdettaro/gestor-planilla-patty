import type { RelacionConPersona } from "@/relaciones-laborales/gestionar-relaciones-laborales";
import type { Corte, HechoDiarioDeAsistencia, RevisionDeAsistenciaParaPagos } from "@/periodos/hechos-para-pagos";
import { DATOS_LABORALES, NOMBRE_DE_DATO, esAfp, type DatoLaboral, type ValorLaboral } from "@/condiciones-laborales/catalogo";
import { buscarDefinicion, type CodigoDeReglaLegal } from "@/reglas-legales/catalogo";
import type { ImporteExterno } from "@/fuentes-externas/gestionar-fuentes-externas";
import { formatearSoles } from "@/condiciones-laborales/valores";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";
import { desplazarFecha } from "@/turnos/semana";

import { asociarAbono, descansosDe, diasConvencionalesDelMes, fechasEnMes, mesesDelDescanso, repartirAbono, ventanaDeVacaciones, type DescansoVacacional } from "./vacaciones";

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
  /**
   * Fechas con jornada «vacaciones» aprobada en Asistencia por DNI, del mes anterior al siguiente al de pago: incluye los días
   * del mes calendario posteriores al corte, que viven en períodos aún abiertos.
   */
  diasDeVacaciones: Record<string, string[]>;
  /** Abonos vacacionales no anulados de cualquier mes de aplicación. */
  abonosVacacionales: ImporteExterno[];
  /** Algún día de vacaciones viene de un período abierto, es decir, todavía puede cambiar. */
  vacacionesProvisionales: boolean;
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

export type LineaDeBorrador = LineaDeSueldo | LineaDeRemuneracionVacacional | LineaDeAjusteDeVacaciones | LineaDeHoraExtra;
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
    const sueldo = sueldoEn(entrada, relacion.id, hecho.fecha);
    const jornada = Number(condicionEn(entrada, relacion.id, "jornada_ordinaria_diaria", hecho.fecha));
    // El booleano registra el beneficio que Patty ya otorgó, también en REMYPE; el DNI del menor se verifica fuera.
    const familiar = condicionEn(entrada, relacion.id, "elegibilidad_familiar", hecho.fecha);
    const rmv = reglaEn(entrada, "rmv", hecho.fecha);
    const porcentajeFamiliar = reglaEn(entrada, "asignacion_familiar_porcentaje_de_rmv", hecho.fecha);
    if (!sueldo || !jornada || familiar === undefined) {
      bloqueos.push(`Falta remuneración ordinaria computable o jornada ordinaria diaria vigente el ${hecho.fecha}. Revise Condiciones laborales y Reglas legales.`);
      continue;
    }
    if (familiar === true && (rmv === undefined || porcentajeFamiliar === undefined)) {
      bloqueos.push(`Falta la regla de asignación familiar vigente el ${hecho.fecha}. Revise Reglas legales.`);
      continue;
    }
    // Las comisiones externas son complementarias variables: no forman parte del valor hora de sobretiempo.
    const asignacionFamiliarCentimos = familiar === true && rmv !== undefined && porcentajeFamiliar !== undefined
      ? rmv * porcentajeFamiliar / 10_000 : 0;
    const remuneracionOrdinariaComputableCentimos = sueldo + asignacionFamiliarCentimos;
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

/** Calcula sueldo y sobretiempo del borrador; los demás conceptos entran en sus tickets propios. */
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
    // El sueldo es visible aun cuando otro concepto o la cobertura impida un neto confiable.
    const lineas: LineaDeBorrador[] = [...arrastre.lineas, ...actual.lineas, ...sobretiempo.lineas];
    const desglose = vacacionesDeLaPersona(entrada, relacion, conArrastre ? [anterior, mes] : [mes], descansos, lineas);
    bloqueos.push(...desglose.bloqueos);
    return { relacion, vacaciones: desglose.vacaciones, sedeDeAdscripcion: String(condicionEn(entrada, relacion.id, "sede_de_adscripcion", fechaDeConsulta) ?? "") || null,
      lineas, bloqueos, sueldoCalculadoCentimos: [...arrastre.lineas, ...actual.lineas].reduce((suma, linea) => suma + linea.importeCentimos, 0), netoCentimos: null };
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
    sueldoCalculadoCentimos: personas.reduce((suma, persona) => suma + persona.sueldoCalculadoCentimos, 0) };
}
