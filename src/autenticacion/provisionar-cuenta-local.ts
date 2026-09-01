import type { Rol } from "@/colaboradores/registrar-colaborador";

import type { CuentaLocal, RepositorioDeCuentas } from "./iniciar-sesion";

export async function provisionarCuentaLocal(
  repositorio: RepositorioDeCuentas & Pick<RepositorioDeProvisionamiento, "guardarCuenta">,
  datos: { nombreUsuario: string; contrasena: string; rol: Rol },
  hashContrasena: (contrasena: string) => Promise<string>,
): Promise<void> {
  if (await repositorio.buscarPorNombreUsuario(datos.nombreUsuario)) {
    throw new Error("Ya existe una cuenta con ese nombre de usuario.");
  }

  await repositorio.guardarCuenta({
    nombreUsuario: datos.nombreUsuario,
    hashContrasena: await hashContrasena(datos.contrasena),
    rol: datos.rol,
  });
}

interface RepositorioDeProvisionamiento {
  guardarCuenta(cuenta: Omit<CuentaLocal, "id">): Promise<void>;
}
