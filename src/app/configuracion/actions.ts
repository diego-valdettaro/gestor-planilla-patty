"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDeColaboradores } from "@/colaboradores/casos-de-uso-servidor";
import { repositorioDeColaboradores } from "@/colaboradores/servicio";
import { db } from "@/db/client";
import { politicasDePenalizacionPorTardanzas, sedes } from "@/db/schema";
import { crearCasosDeUsoDeTardanzas } from "@/tardanzas/casos-de-uso-servidor";
import { repositorioDeTardanzas } from "@/tardanzas/servicio";
import { asignarEquipoOperativo } from "@/turnos/configurar-equipos-operativos";
import { crearModeloDeHorario, eliminarModeloDeHorario, guardarModeloDeHorario } from "@/turnos/gestionar-modelos-de-horario";
import { repositorioDeModelosDeHorario, repositorioDeTurnos } from "@/turnos/servicio";

export async function guardarSede(formData: FormData): Promise<void> {
  await exigirAdministracion();
  const equipoOperativo = texto(formData, "equipoOperativo");
  if (equipoOperativo !== "tiendas" && equipoOperativo !== "taller") throw new Error("El grupo no es válido.");
  await db.insert(sedes).values({ nombre: texto(formData, "nombre"), equipoOperativo }).onConflictDoNothing();
  revalidatePath("/configuracion");
  revalidatePath("/turnos");
  revalidatePath("/asistencias");
}

export async function eliminarSede(formData: FormData): Promise<void> {
  await exigirAdministracion();
  const nombre = texto(formData, "nombre");
  const colaboradoresEnSede = await repositorioDeColaboradores.listar().then((items) => items.filter((item) => item.sede === nombre));
  if (colaboradoresEnSede.length) throw new Error("No puede eliminar una sede que tiene colaboradores asignados.");
  await db.delete(sedes).where(eq(sedes.nombre, nombre));
  revalidatePath("/configuracion");
  revalidatePath("/turnos");
  revalidatePath("/asistencias");
}

export interface EstadoDeAsignacionDeGrupo {
  error?: string;
  listo?: number;
}

export async function asignarEquipoOperativoASede(
  _estadoAnterior: EstadoDeAsignacionDeGrupo,
  formData: FormData,
): Promise<EstadoDeAsignacionDeGrupo> {
  try {
    await exigirAdministracion();
    const equipoOperativo = texto(formData, "equipoOperativo");
    if (equipoOperativo !== "tiendas" && equipoOperativo !== "taller") throw new Error("El grupo no es válido.");
    await asignarEquipoOperativo(
      repositorioDeTurnos,
      await obtenerActorActual(),
      texto(formData, "nombre"),
      equipoOperativo,
    );
    revalidatePath("/configuracion");
    revalidatePath("/turnos");
    return { listo: (_estadoAnterior.listo ?? 0) + 1 };
  } catch (causa) {
    return { error: causa instanceof Error ? causa.message : "No se pudo guardar el grupo de la sede." };
  }
}

export async function guardarColaborador(formData: FormData): Promise<void> {
  const casos = crearCasosDeUsoDeColaboradores(repositorioDeColaboradores, { obtenerActorActual });
  await casos.registrar({
    idHuellero: texto(formData, "idHuellero"),
    nombre: texto(formData, "nombre"),
    sede: texto(formData, "sede"),
    activo: true,
  });
  revalidatePath("/configuracion");
  revalidatePath("/turnos");
  revalidatePath("/asistencias");
}

export async function desactivarColaborador(formData: FormData): Promise<void> {
  await exigirAdministracion();
  const casos = crearCasosDeUsoDeColaboradores(repositorioDeColaboradores, { obtenerActorActual });
  const idHuellero = texto(formData, "idHuellero");
  const colaborador = await casos.consultar(idHuellero);
  if (!colaborador) throw new Error("No existe un colaborador con ese ID de huellero.");
  await casos.actualizar({ ...colaborador, activo: false });
  revalidatePath("/configuracion");
  revalidatePath("/turnos");
  revalidatePath("/asistencias");
}

export async function reactivarColaborador(formData: FormData): Promise<void> {
  await exigirAdministracion();
  const casos = crearCasosDeUsoDeColaboradores(repositorioDeColaboradores, { obtenerActorActual });
  const idHuellero = texto(formData, "idHuellero");
  const colaborador = await casos.consultar(idHuellero);
  if (!colaborador) throw new Error("No existe un colaborador con ese ID de huellero.");
  await casos.actualizar({ ...colaborador, activo: true });
  revalidatePath("/configuracion");
  revalidatePath("/turnos");
  revalidatePath("/asistencias");
}

export async function guardarPoliticaDeTardanzas(formData: FormData): Promise<void> {
  const casos = crearCasosDeUsoDeTardanzas(repositorioDeTardanzas, { obtenerActorActual });
  const sede = texto(formData, "sede");
  const [ultimaPolitica] = await db.select({ version: politicasDePenalizacionPorTardanzas.version })
    .from(politicasDePenalizacionPorTardanzas)
    .where(eq(politicasDePenalizacionPorTardanzas.sede, sede))
    .orderBy(desc(politicasDePenalizacionPorTardanzas.version))
    .limit(1);
  await casos.configurarPolitica({
    sede,
    toleranciaEnMinutos: entero(formData, "toleranciaEnMinutos"),
    tardanzasAcumuladas: entero(formData, "tardanzasAcumuladas"),
    horasPenalizadas: entero(formData, "horasPenalizadas"),
    version: (ultimaPolitica?.version ?? 0) + 1,
    vigenteDesde: texto(formData, "vigenteDesde"),
  });
  revalidatePath("/configuracion");
}

export async function crearModeloHorario(formData: FormData): Promise<void> {
  await crearModeloDeHorario(repositorioDeModelosDeHorario, await obtenerActorActual(), {
    id: crypto.randomUUID(),
    sede: texto(formData, "sede"),
    nombre: texto(formData, "nombre"),
    entrada: texto(formData, "entrada"),
    salida: texto(formData, "salida"),
  });
  revalidatePath("/configuracion");
  revalidatePath("/turnos");
}

export async function guardarModeloHorario(formData: FormData): Promise<void> {
  await guardarModeloDeHorario(repositorioDeModelosDeHorario, await obtenerActorActual(), {
    id: texto(formData, "id"),
    sede: texto(formData, "sede"),
    nombre: texto(formData, "nombre"),
    entrada: texto(formData, "entrada"),
    salida: texto(formData, "salida"),
    activo: formData.get("activo") === "true",
  });
  revalidatePath("/configuracion");
  revalidatePath("/turnos");
}

export async function eliminarModeloHorario(formData: FormData): Promise<void> {
  await eliminarModeloDeHorario(repositorioDeModelosDeHorario, await obtenerActorActual(), texto(formData, "id"));
  revalidatePath("/configuracion");
  revalidatePath("/turnos");
}

export async function desactivarModeloHorario(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  const modelo = await repositorioDeModelosDeHorario.buscarPorId(id);
  if (!modelo) throw new Error("El modelo de horario no existe.");
  await guardarModeloDeHorario(repositorioDeModelosDeHorario, await obtenerActorActual(), { ...modelo, activo: false });
  revalidatePath("/configuracion");
  revalidatePath("/turnos");
}

export async function reactivarModeloHorario(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  const modelo = await repositorioDeModelosDeHorario.buscarPorId(id);
  if (!modelo) throw new Error("El modelo de horario no existe.");
  await guardarModeloDeHorario(repositorioDeModelosDeHorario, await obtenerActorActual(), { ...modelo, activo: true });
  revalidatePath("/configuracion");
  revalidatePath("/turnos");
}

async function exigirAdministracion(): Promise<void> {
  const actor = await obtenerActorActual();
  if (actor.rol !== "administracion") throw new Error("No tiene permiso para cambiar la configuración.");
}

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`El campo ${campo} es obligatorio.`);
  return valor.trim();
}

function entero(formData: FormData, campo: string): number {
  const valor = Number(texto(formData, campo));
  if (!Number.isInteger(valor) || valor <= 0) throw new Error(`El campo ${campo} debe ser un entero positivo.`);
  return valor;
}
