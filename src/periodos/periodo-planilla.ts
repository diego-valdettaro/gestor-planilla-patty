import type { Actor } from "@/colaboradores/registrar-colaborador";

export type EstadoDePeriodo = "abierto" | "cerrado";
export type AccionDePeriodo = "cierre" | "reapertura";

export interface PeriodoPlanilla {
  id: string;
  inicio: string;
  fin: string;
  estado: EstadoDePeriodo;
  cerradoPorId?: string | null;
  cerradoEn?: Date | null;
}

export interface FiltrosDeResumen { periodoId: string; sede?: string; idHuellero?: string; }
export interface FilaDeResumen {
  idHuellero: string; nombre: string; sede: string; minutosTrabajados: number;
  cantidadTardanzas: number; minutosPenalizados: number; minutosAl25: number; minutosAl35: number;
}

export interface RepositorioDePeriodos {
  listar(): Promise<PeriodoPlanilla[]>;
  buscar(id: string): Promise<PeriodoPlanilla | undefined>;
  listarResumen(filtros: FiltrosDeResumen): Promise<FilaDeResumen[]>;
  cerrar(id: string, responsableId: string, registradoEn: Date): Promise<void>;
  reabrir(id: string, responsableId: string, motivo: string, registradoEn: Date): Promise<void>;
}

export function autorizarGestionDePeriodos(actor: Actor): void {
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") throw new Error("No tiene permiso para gestionar períodos de planilla.");
}

export async function cerrarPeriodo(repositorio: RepositorioDePeriodos, actor: Actor, id: string, ahora = new Date()): Promise<void> {
  autorizarGestionDePeriodos(actor);
  await repositorio.cerrar(id, actor.id, ahora);
}

export async function reabrirPeriodo(repositorio: RepositorioDePeriodos, actor: Actor, id: string, motivo: string, ahora = new Date()): Promise<void> {
  autorizarGestionDePeriodos(actor);
  const texto = motivo.trim();
  if (!texto) throw new Error("La reapertura del período requiere un motivo.");
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") throw new Error("No tiene permiso para reabrir períodos de planilla.");
  await repositorio.reabrir(id, actor.id, texto, ahora);
}
