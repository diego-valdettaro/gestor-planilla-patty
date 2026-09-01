import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import type { Actor } from "@/colaboradores/registrar-colaborador";

import { verificarContrasena } from "./contrasenas";
import { hashDelToken, iniciarSesion } from "./iniciar-sesion";
import { RepositorioPostgresDeCuentas } from "./repositorio-postgres";
import { db } from "@/db/client";

const NOMBRE_DE_COOKIE = "patty_session";
const DURACION_DE_LA_SESION_EN_SEGUNDOS = 14 * 24 * 60 * 60;

const repositorio = new RepositorioPostgresDeCuentas(db);

export async function iniciarSesionDelServidor(credenciales: {
  nombreUsuario: string;
  contrasena: string;
}): Promise<void> {
  const { token } = await iniciarSesion(
    repositorio,
    credenciales,
    { verificar: verificarContrasena },
    () => randomBytes(32).toString("base64url"),
    new Date(),
  );
  const almacenDeCookies = await cookies();

  almacenDeCookies.set(NOMBRE_DE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DURACION_DE_LA_SESION_EN_SEGUNDOS,
    path: "/",
  });
}

export async function obtenerActorActual(): Promise<Actor> {
  const almacenDeCookies = await cookies();
  const token = almacenDeCookies.get(NOMBRE_DE_COOKIE)?.value;

  if (!token) {
    throw new Error("La sesión no es válida.");
  }

  const actor = await repositorio.buscarActorPorTokenHash(hashDelToken(token), new Date());

  if (!actor) {
    throw new Error("La sesión no es válida.");
  }

  return actor;
}

export async function cerrarSesionDelServidor(): Promise<void> {
  const almacenDeCookies = await cookies();
  const token = almacenDeCookies.get(NOMBRE_DE_COOKIE)?.value;

  if (token) {
    await repositorio.eliminarSesion(hashDelToken(token));
  }
  almacenDeCookies.delete(NOMBRE_DE_COOKIE);
}
