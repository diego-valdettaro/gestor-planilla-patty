import { hashDeContrasena } from "@/autenticacion/contrasenas";
import { provisionarPrimeraAdministracion } from "@/autenticacion/provisionar-primera-administracion";
import { repositorioDeCuentas } from "@/autenticacion/servicio";

const nombreUsuario = process.env.ADMIN_NOMBRE_USUARIO;
const contrasena = process.env.ADMIN_CONTRASENA;

async function main(): Promise<void> {
  if (!nombreUsuario || !contrasena) {
    throw new Error("Defina ADMIN_NOMBRE_USUARIO y ADMIN_CONTRASENA antes de aprovisionar la cuenta.");
  }

  await provisionarPrimeraAdministracion(
    repositorioDeCuentas,
    { nombreUsuario, contrasena },
    hashDeContrasena,
  );

  console.log("La primera cuenta de Administración fue aprovisionada.");
}

void main();
