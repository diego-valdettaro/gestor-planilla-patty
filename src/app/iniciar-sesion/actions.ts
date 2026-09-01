"use server";

import { redirect } from "next/navigation";

import { iniciarSesionDelServidor } from "@/autenticacion/sesion-del-servidor";

export async function iniciarSesionDesdeFormulario(formData: FormData): Promise<void> {
  const nombreUsuario = obtenerTexto(formData, "nombreUsuario");
  const contrasena = obtenerTexto(formData, "contrasena");

  await iniciarSesionDelServidor({ nombreUsuario, contrasena });
  redirect("/turnos");
}

function obtenerTexto(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre);

  if (typeof valor !== "string" || !valor.trim()) {
    throw new Error(`El campo ${nombre} es obligatorio.`);
  }

  return valor.trim();
}
