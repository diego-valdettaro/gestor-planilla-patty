import type { Rol } from "@/colaboradores/registrar-colaborador";

import type { CuentaLocal } from "./iniciar-sesion";

export interface RepositorioDeProvisionamiento {
  existeAlgunaCuenta(): Promise<boolean>;
  guardarCuenta(cuenta: Omit<CuentaLocal, "id">): Promise<void>;
}

export async function provisionarPrimeraAdministracion(
  repositorio: RepositorioDeProvisionamiento,
  datos: { nombreUsuario: string; contrasena: string },
  hashContrasena: (contrasena: string) => Promise<string>,
): Promise<void> {
  if (await repositorio.existeAlgunaCuenta()) {
    throw new Error("Ya existe una cuenta local. El aprovisionamiento inicial solo puede ejecutarse una vez.");
  }

  await repositorio.guardarCuenta({
    nombreUsuario: datos.nombreUsuario,
    hashContrasena: await hashContrasena(datos.contrasena),
    rol: "administracion" satisfies Rol,
  });
}
