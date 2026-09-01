import type { Rol } from "@/colaboradores/registrar-colaborador";

import { hashDeContrasena } from "@/autenticacion/contrasenas";
import { provisionarCuentaLocal } from "@/autenticacion/provisionar-cuenta-local";
import { repositorioDeCuentas } from "@/autenticacion/servicio";

const nombreUsuario = process.env.CUENTA_NOMBRE_USUARIO;
const contrasena = process.env.CUENTA_CONTRASENA;
const rol = process.env.CUENTA_ROL;
const roles: Rol[] = ["operaciones", "administracion", "finanzas"];

async function main(): Promise<void> {
  if (!nombreUsuario || !contrasena || !rol || !roles.includes(rol as Rol)) {
    throw new Error("Defina CUENTA_NOMBRE_USUARIO, CUENTA_CONTRASENA y CUENTA_ROL válido.");
  }

  await provisionarCuentaLocal(
    repositorioDeCuentas,
    { nombreUsuario, contrasena, rol: rol as Rol },
    hashDeContrasena,
  );

  console.log("La cuenta local fue aprovisionada.");
}

void main();
