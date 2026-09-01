"use server";

import { redirect } from "next/navigation";

import { cerrarSesionDelServidor } from "@/autenticacion/sesion-del-servidor";

export async function cerrarSesionDesdeFormulario(): Promise<never> {
  await cerrarSesionDelServidor();
  redirect("/iniciar-sesion");
}
