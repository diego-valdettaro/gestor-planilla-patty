import { hashDeContrasena } from "@/autenticacion/contrasenas";
import { provisionarPrimerAdministrador } from "@/autenticacion/provisionar-primer-administrador";
import { repositorioDeCuentas } from "@/autenticacion/servicio";

const nombreUsuario = process.env.ADMIN_NOMBRE_USUARIO;
const contrasena = process.env.ADMIN_CONTRASENA;

async function main(): Promise<void> {
  if (!nombreUsuario || !contrasena) {
    throw new Error("Defina ADMIN_NOMBRE_USUARIO y ADMIN_CONTRASENA antes de aprovisionar la cuenta.");
  }

  await provisionarPrimerAdministrador(
    repositorioDeCuentas,
    { nombreUsuario, contrasena },
    hashDeContrasena,
  );

  console.log("La primera cuenta de Administrador del sistema fue aprovisionada.");
}

void main();
