import { createHash } from "node:crypto";

import type { Actor, Rol } from "@/colaboradores/registrar-colaborador";

const DURACION_DE_LA_SESION_EN_DIAS = 14;

export interface CuentaLocal {
  id: string;
  nombreUsuario: string;
  hashContrasena: string;
  rol: Rol;
}

export interface SesionPersistida {
  cuentaId: string;
  tokenHash: string;
  venceEn: Date;
}

export interface RepositorioDeCuentas {
  buscarPorNombreUsuario(nombreUsuario: string): Promise<CuentaLocal | undefined>;
  guardarSesion(sesion: SesionPersistida): Promise<void>;
}

export interface VerificadorDeContrasenas {
  verificar(hash: string, contrasena: string): Promise<boolean>;
}

export async function iniciarSesion(
  repositorio: RepositorioDeCuentas,
  credenciales: { nombreUsuario: string; contrasena: string },
  verificador: VerificadorDeContrasenas,
  generarToken: () => string,
  ahora: Date,
): Promise<{ actor: Actor; token: string }> {
  const cuenta = await repositorio.buscarPorNombreUsuario(credenciales.nombreUsuario);

  if (!cuenta || !(await verificador.verificar(cuenta.hashContrasena, credenciales.contrasena))) {
    throw new Error("Las credenciales no son válidas.");
  }

  const token = generarToken();
  const venceEn = new Date(ahora);
  venceEn.setUTCDate(venceEn.getUTCDate() + DURACION_DE_LA_SESION_EN_DIAS);

  await repositorio.guardarSesion({
    cuentaId: cuenta.id,
    tokenHash: hashDelToken(token),
    venceEn,
  });

  return { actor: { id: cuenta.id, rol: cuenta.rol }, token };
}

export function hashDelToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
