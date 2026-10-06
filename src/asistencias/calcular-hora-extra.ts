export interface HoraExtraCalculada {
  minutosAl25: number;
  minutosAl35: number;
  trabajoNocturno: boolean;
  estado: EstadoDeHoraExtra;
}

export type EstadoDeHoraExtra = "pendiente" | "aprobada" | "descartada";

export interface JornadaParaHoraExtra {
  entradaProgramada: string;
  salidaProgramada: string;
  entradaReal: string;
  salidaReal: string;
}

export const LIMITE_SEMANAL_EN_MINUTOS = 48 * 60;

const MINUTOS_POR_DIA = 1440;
const MINUTOS_DE_SOBRETIEMPO_AL_25 = 120;
const INICIO_NOCTURNO = 22 * 60;
const FIN_NOCTURNO = 6 * 60;

interface Medicion {
  minutosFueraDelTurno: number;
  minutosOrdinarios: number;
  trabajoNocturno: boolean;
}

/**
 * Sobretiempo de una jornada: minutos reales antes de la entrada y después de la salida
 * programadas, más el exceso semanal que aporta su tramo ordinario sobre los minutos
 * ordinarios que la persona ya acumuló esa semana.
 */
export function calcularHoraExtra(jornada: JornadaParaHoraExtra, minutosOrdinariosPrevios = 0): HoraExtraCalculada | undefined {
  return aHoraExtra(medir(jornada), minutosOrdinariosPrevios);
}

/** Calcula todas las jornadas de una semana lunes–domingo en orden cronológico, sin contar dos veces un tramo. */
export function calcularHorasExtraDeSemana(
  jornadas: Array<JornadaParaHoraExtra & { fecha: string }>,
): Map<string, HoraExtraCalculada | undefined> {
  const resultado = new Map<string, HoraExtraCalculada | undefined>();
  const ordinariosPorSemana = new Map<string, number>();
  for (const jornada of [...jornadas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const semana = lunesDeLaSemana(jornada.fecha);
    const previos = ordinariosPorSemana.get(semana) ?? 0;
    const medicion = medir(jornada);
    resultado.set(jornada.fecha, aHoraExtra(medicion, previos));
    ordinariosPorSemana.set(semana, previos + medicion.minutosOrdinarios);
  }
  return resultado;
}

export function lunesDeLaSemana(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const instante = new Date(Date.UTC(anio, mes - 1, dia));
  instante.setUTCDate(instante.getUTCDate() - ((instante.getUTCDay() + 6) % 7));
  return instante.toISOString().slice(0, 10);
}

function aHoraExtra(medicion: Medicion, minutosOrdinariosPrevios: number): HoraExtraCalculada | undefined {
  const excesoSemanal = Math.min(
    medicion.minutosOrdinarios,
    Math.max(0, minutosOrdinariosPrevios + medicion.minutosOrdinarios - LIMITE_SEMANAL_EN_MINUTOS),
  );
  const minutosDeSobretiempo = medicion.minutosFueraDelTurno + excesoSemanal;
  if (minutosDeSobretiempo === 0 && !medicion.trabajoNocturno) return undefined;
  return {
    minutosAl25: Math.min(minutosDeSobretiempo, MINUTOS_DE_SOBRETIEMPO_AL_25),
    minutosAl35: Math.max(minutosDeSobretiempo - MINUTOS_DE_SOBRETIEMPO_AL_25, 0),
    trabajoNocturno: medicion.trabajoNocturno,
    estado: "pendiente",
  };
}

function medir(jornada: JornadaParaHoraExtra): Medicion {
  const entradaReal = minutosAbsolutos(jornada.entradaReal);
  const salidaReal = minutosAbsolutos(jornada.salidaReal);
  if (salidaReal < entradaReal) throw new Error("La salida real debe ser posterior a la entrada real.");
  const diaDeEntrada = Math.floor(entradaReal / MINUTOS_POR_DIA) * MINUTOS_POR_DIA;
  const entradaProgramada = diaDeEntrada + minutosDelDia(jornada.entradaProgramada);
  let salidaProgramada = diaDeEntrada + minutosDelDia(jornada.salidaProgramada);
  if (salidaProgramada <= entradaProgramada) salidaProgramada += MINUTOS_POR_DIA;

  const antes = Math.max(0, Math.min(salidaReal, entradaProgramada) - entradaReal);
  const despues = Math.max(0, salidaReal - Math.max(entradaReal, salidaProgramada));
  return {
    minutosFueraDelTurno: antes + despues,
    minutosOrdinarios: salidaReal - entradaReal - antes - despues,
    trabajoNocturno: tocaElHorarioNocturno(entradaReal, salidaReal),
  };
}

function tocaElHorarioNocturno(entrada: number, salida: number): boolean {
  for (let dia = Math.floor(entrada / MINUTOS_POR_DIA) * MINUTOS_POR_DIA; dia <= salida; dia += MINUTOS_POR_DIA) {
    if (Math.min(salida, dia + FIN_NOCTURNO) > Math.max(entrada, dia)) return true;
    if (Math.min(salida, dia + MINUTOS_POR_DIA) > Math.max(entrada, dia + INICIO_NOCTURNO)) return true;
  }
  return false;
}

/** Minutos desde el origen común; usa la hora tal como está escrita, igual que el resto del cálculo de asistencia. */
function minutosAbsolutos(valor: string): number {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(valor);
  if (!coincidencia) throw new Error("La hora debe usar el formato AAAA-MM-DDTHH:MM.");
  const [, anio, mes, dia, horas, minutos] = coincidencia;
  validarHora(Number(horas), Number(minutos));
  return (Date.UTC(Number(anio), Number(mes) - 1, Number(dia)) / 60_000) + Number(horas) * 60 + Number(minutos);
}

function minutosDelDia(valor: string): number {
  const coincidencia = /^(\d{2}):(\d{2})/.exec(valor);
  if (!coincidencia) throw new Error("La hora debe usar el formato HH:MM.");
  validarHora(Number(coincidencia[1]), Number(coincidencia[2]));
  return Number(coincidencia[1]) * 60 + Number(coincidencia[2]);
}

function validarHora(horas: number, minutos: number): void {
  if (horas > 23 || minutos > 59) throw new Error("La hora no es válida.");
}
