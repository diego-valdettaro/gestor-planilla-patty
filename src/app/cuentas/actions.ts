"use server";

import { revalidatePath } from "next/cache";

import { crearCasosDeUsoDeCuentas } from "@/autenticacion/casos-de-uso-servidor";
import { ROLES, type Rol } from "@/autenticacion/permisos";
import { repositorioDeCuentas } from "@/autenticacion/servicio";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";

export interface EstadoDeFormularioDeCuentas {
  error?: string;
  listo?: number;
}

function casosDeUso() {
  return crearCasosDeUsoDeCuentas(repositorioDeCuentas, { obtenerActorActual });
}

export async function crearCuentaDesdeFormulario(estadoAnterior: EstadoDeFormularioDeCuentas, formData: FormData): Promise<EstadoDeFormularioDeCuentas> {
  try {
    const rol = texto(formData, "rol");
    if (!(ROLES as readonly string[]).includes(rol)) throw new Error("El rol no es válido.");
    await casosDeUso().crear({ nombreUsuario: texto(formData, "nombreUsuario"), contrasena: texto(formData, "contrasena"), rol: rol as Rol });
    revalidatePath("/cuentas");
    return { listo: (estadoAnterior.listo ?? 0) + 1 };
  } catch (causa) {
    return { error: causa instanceof Error ? causa.message : "No se pudo crear la cuenta." };
  }
}

export async function asignarGerenteDesdeFormulario(estadoAnterior: EstadoDeFormularioDeCuentas, formData: FormData): Promise<EstadoDeFormularioDeCuentas> {
  try {
    await casosDeUso().asignarGerente(texto(formData, "grupo"), texto(formData, "cuentaId"));
    revalidatePath("/cuentas");
    revalidatePath("/configuracion");
    return { listo: (estadoAnterior.listo ?? 0) + 1 };
  } catch (causa) {
    return { error: causa instanceof Error ? causa.message : "No se pudo asignar el gerente." };
  }
}

export async function quitarGerenteDesdeFormulario(formData: FormData): Promise<void> {
  await casosDeUso().quitarGerente(texto(formData, "grupo"));
  revalidatePath("/cuentas");
  revalidatePath("/configuracion");
}

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`El campo ${campo} es obligatorio.`);
  return campo === "contrasena" ? valor : valor.trim();
}
