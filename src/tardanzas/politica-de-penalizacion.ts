import type { Actor } from "@/colaboradores/registrar-colaborador";

export interface SolicitudDePoliticaDePenalizacionPorTardanzas {
  sede: string;
  toleranciaEnMinutos: number;
  tardanzasAcumuladas: number;
  horasPenalizadas: number;
  version: number;
  vigenteDesde: string;
}

export interface PoliticaDePenalizacionPorTardanzas extends SolicitudDePoliticaDePenalizacionPorTardanzas {
  configuradaPorId: string;
  configuradaEn: Date;
}

export interface SolicitudDeCalculoDeTardanza {
  idHuellero: string;
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
  buscarPoliticaVigente(sede: string, fecha: string): Promise<PoliticaDePenalizacionPorTardanzas | undefined>;
  contarTardanzas(idHuellero: string, inicio: string, fin: string): Promise<number>;
}

export type RepositorioParaCalcularTardanzas = Pick<RepositorioDeTardanzas, "buscarPoliticaVigente" | "contarTardanzas">;

export async function configurarPoliticaDePenalizacionPorTardanzas(
  repositorio: RepositorioDeTardanzas,
  actor: Actor,
  solicitud: SolicitudDePoliticaDePenalizacionPorTardanzas,
): Promise<void> {
  autorizarConfiguracion(actor);
  validarPolitica(solicitud);
  await repositorio.guardarPolitica({ ...solicitud, configuradaPorId: actor.id, configuradaEn: new Date() });
}

export async function calcularTardanza(
  repositorio: RepositorioParaCalcularTardanzas,
  solicitud: SolicitudDeCalculoDeTardanza,
): Promise<TardanzaCalculada | undefined> {
  const politica = await repositorio.buscarPoliticaVigente(solicitud.sede, solicitud.fecha);
  if (!politica) throw new Error("No existe una política de tardanzas vigente para la sede.");
  const minutosDeTardanza = minutosEntreHorarios(solicitud.entradaProgramada, solicitud.entradaReal);
  if (minutosDeTardanza <= politica.toleranciaEnMinutos) return undefined;
  const periodo = obtenerPeriodoDePlanilla(solicitud.fecha);
  const tardanzasAnteriores = await repositorio.contarTardanzas(solicitud.idHuellero, periodo.inicio, periodo.fin);
  return {
    minutosDeTardanza,
    minutosPenalizados: (tardanzasAnteriores + 1) % politica.tardanzasAcumuladas === 0 ? politica.horasPenalizadas * 60 : 0,
    politicaVersion: politica.version,
  };
}

function validarPolitica(solicitud: SolicitudDePoliticaDePenalizacionPorTardanzas): void {
  if (!solicitud.sede.trim() || !solicitud.vigenteDesde.trim()) throw new Error("La sede y la vigencia son obligatorias.");
  for (const valor of [solicitud.toleranciaEnMinutos, solicitud.tardanzasAcumuladas, solicitud.horasPenalizadas, solicitud.version]) {
    if (!Number.isInteger(valor) || valor <= 0) throw new Error("Los valores de la política deben ser enteros positivos.");
  }
}

function minutosEntreHorarios(entradaProgramada: string, entradaReal: string): number {
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
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") {
    throw new Error("No tiene permiso para configurar políticas de tardanzas.");
  }
}
