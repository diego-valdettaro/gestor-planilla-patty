"use server";

import { redirect } from "next/navigation";

import { iniciarSesionDelServidor } from "@/autenticacion/sesion-del-servidor";

export interface EstadoDeInicioSesion {
  error?: string;
}

export async function iniciarSesionDesdeFormulario(
  _estadoAnterior: EstadoDeInicioSesion,
  formData: FormData,
): Promise<EstadoDeInicioSesion> {
  try {
    const nombreUsuario = obtenerTexto(formData, "nombreUsuario");
    const contrasena = obtenerTexto(formData, "contrasena");

    await iniciarSesionDelServidor({ nombreUsuario, contrasena });
  } catch (error) {
    return { error: mensajeParaElFormulario(error) };
  }

  redirect("/");
}

function obtenerTexto(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre);

  if (typeof valor !== "string" || !valor.trim()) {
    throw new Error(`El campo ${nombre} es obligatorio.`);
  }

  return valor.trim();
}

function mensajeParaElFormulario(error: unknown): string {
  if (error instanceof Error && error.message === "Las credenciales no son válidas.") {
    return error.message;
  }

  return "No se pudo iniciar sesión. Inténtelo de nuevo.";
}
