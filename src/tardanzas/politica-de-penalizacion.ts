import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeConfigurarGlobalmente } from "@/autenticacion/permisos";

export interface SolicitudDePoliticaDePenalizacionPorTardanzas {
  sede: string;
  toleranciaEnMinutos: number;
  tardanzasAcumuladas: number;
  horasPenalizadas: number;
  version: number;
  vigenteDesde: string;
}

export interface SolicitudDePoliticaPorGrupo {
  grupo: string;
  toleranciaEnMinutos: number;
  tardanzasAcumuladas: number;
  horasPenalizadas: number;
}

export interface PoliticaDePenalizacionPorTardanzas extends SolicitudDePoliticaDePenalizacionPorTardanzas {
  configuradaPorId: string;
  configuradaEn: Date;
}

export interface SolicitudDeCalculoDeTardanza {
  dni: string;
  sede: string;
  fecha: string;
  entradaProgramada: string;
  entradaReal: string;
}

export interface TardanzaCalculada {
  minutosDeTardanza: number;
  minutosPenalizados: number;
  politicaVersion: number;
}

export interface RepositorioDeTardanzas {
  guardarPolitica(politica: PoliticaDePenalizacionPorTardanzas): Promise<void>;
  obtenerGrupo?(nombre: string): Promise<{ nombre: string; gestionaAsistencia: boolean } | undefined>;
  guardarPoliticaDeGrupo?(politica: SolicitudDePoliticaPorGrupo & { configuradaPorId: string; configuradaEn: Date }): Promise<void>;
  buscarPoliticaVigente(sede: string, fecha: string, dni?: string): Promise<PoliticaDePenalizacionPorTardanzas | undefined>;
  contarTardanzas(dni: string, inicio: string, fin: string): Promise<number>;
}

export type RepositorioParaCalcularTardanzas = Pick<RepositorioDeTardanzas, "buscarPoliticaVigente" | "contarTardanzas">;

export async function configurarPoliticaDePenalizacionPorTardanzas(
  repositorio: RepositorioDeTardanzas,
  actor: Actor,
  solicitud: SolicitudDePoliticaDePenalizacionPorTardanzas | SolicitudDePoliticaPorGrupo,
): Promise<void> {
  autorizarConfiguracion(actor);
  if ("grupo" in solicitud) {
    if (!solicitud.grupo.trim()) throw new Error("El grupo es obligatorio.");
    for (const valor of [solicitud.toleranciaEnMinutos, solicitud.tardanzasAcumuladas, solicitud.horasPenalizadas]) {
      if (!Number.isInteger(valor) || valor <= 0) throw new Error("Los valores de la política deben ser enteros positivos.");
    }
    if (!repositorio.obtenerGrupo || !repositorio.guardarPoliticaDeGrupo) throw new Error("No está disponible la configuración de políticas por grupo.");
    const grupo = await repositorio.obtenerGrupo(solicitud.grupo);
    if (!grupo) throw new Error("El grupo no existe.");
    if (!grupo.gestionaAsistencia) throw new Error("El grupo no gestiona asistencia.");
    await repositorio.guardarPoliticaDeGrupo({ ...solicitud, configuradaPorId: actor.id, configuradaEn: new Date() });
    return;
  }
  throw new Error("La política de tardanzas se configura por grupo operativo que gestiona asistencia.");
}

export async function calcularTardanza(
  repositorio: RepositorioParaCalcularTardanzas,
  solicitud: SolicitudDeCalculoDeTardanza,
): Promise<TardanzaCalculada | undefined> {
  const politica = await repositorio.buscarPoliticaVigente(solicitud.sede, solicitud.fecha, solicitud.dni);
  if (!politica) throw new Error("No existe una política de tardanzas vigente para la sede.");
  const minutosDeTardanza = minutosDeTardanzaFueraDeTolerancia(politica, solicitud.entradaProgramada, solicitud.entradaReal);
  if (minutosDeTardanza === undefined) return undefined;
  const periodo = obtenerPeriodoDePlanilla(solicitud.fecha);
  const tardanzasAnteriores = await repositorio.contarTardanzas(solicitud.dni, periodo.inicio, periodo.fin);
  return {
    minutosDeTardanza,
    minutosPenalizados: calcularMinutosPenalizados(tardanzasAnteriores + 1, politica),
    politicaVersion: politica.version,
  };
}

/** Minutos reales de tardanza si la entrada supera la tolerancia de la política; `undefined` si no hay tardanza. */
export function minutosDeTardanzaFueraDeTolerancia(
  politica: Pick<PoliticaDePenalizacionPorTardanzas, "toleranciaEnMinutos">,
  entradaProgramada: string,
  entradaReal: string,
): number | undefined {
  const minutos = calcularMinutosDeTardanza(entradaProgramada, entradaReal);
  return minutos > politica.toleranciaEnMinutos ? minutos : undefined;
}

export function calcularMinutosPenalizados(
  numeroDeTardanza: number,
  politica: Pick<PoliticaDePenalizacionPorTardanzas, "tardanzasAcumuladas" | "horasPenalizadas">,
): number {
  return numeroDeTardanza % politica.tardanzasAcumuladas === 0 ? politica.horasPenalizadas * 60 : 0;
}

export function calcularMinutosDeTardanza(entradaProgramada: string, entradaReal: string): number {
  const programada = minutosDelDia(entradaProgramada);
  const real = minutosDelDia(entradaReal.slice(11, 16));
  return real - programada;
}

function minutosDelDia(valor: string): number {
  const coincidencia = /^(\d{2}):(\d{2})$/.exec(valor);
  if (!coincidencia) throw new Error("La hora debe usar el formato HH:MM.");
  const horas = Number(coincidencia[1]);
  const minutos = Number(coincidencia[2]);
  if (horas > 23 || minutos > 59) throw new Error("La hora no es válida.");
  return horas * 60 + minutos;
}

function obtenerPeriodoDePlanilla(fecha: string): { inicio: string; fin: string } {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  if (!anio || !mes || !dia) throw new Error("La fecha no es válida.");
  const inicio = dia >= 26 ? new Date(Date.UTC(anio, mes - 1, 26)) : new Date(Date.UTC(anio, mes - 2, 26));
  const fin = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 25));
  return { inicio: formatoDeFecha(inicio), fin: formatoDeFecha(fin) };
}

function formatoDeFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function autorizarConfiguracion(actor: Actor): void {
  exigir(puedeConfigurarGlobalmente(actor), "No tiene permiso para configurar políticas de tardanzas.");
}
