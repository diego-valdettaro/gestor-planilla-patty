import { hash, verify } from "@node-rs/argon2";
import type { Algorithm } from "@node-rs/argon2";

const OPCIONES_ARGON2ID = {
  algorithm: 2 as Algorithm,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

export function hashDeContrasena(contrasena: string): Promise<string> {
  return hash(contrasena, OPCIONES_ARGON2ID);
}

export function verificarContrasena(hashContrasena: string, contrasena: string): Promise<boolean> {
  return verify(hashContrasena, contrasena);
}
