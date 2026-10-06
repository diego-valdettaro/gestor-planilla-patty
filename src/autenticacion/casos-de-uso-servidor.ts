import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import { hashDeContrasena } from "./contrasenas";
import { asignarGerenteAGrupo, crearCuenta, quitarGerenteDeGrupo, type RepositorioDeGestionDeCuentas } from "./gestionar-cuentas";
import type { Rol } from "./permisos";

export function crearCasosDeUsoDeCuentas(
  repositorio: RepositorioDeGestionDeCuentas,
  sesion: SesionDelServidor,
  hashContrasena: (contrasena: string) => Promise<string> = hashDeContrasena,
) {
  return {
    async crear(datos: { nombreUsuario: string; contrasena: string; rol: Rol }): Promise<void> {
      await crearCuenta(repositorio, await sesion.obtenerActorActual(), datos, hashContrasena);
    },
    async asignarGerente(grupo: string, cuentaId: string): Promise<void> {
      await asignarGerenteAGrupo(repositorio, await sesion.obtenerActorActual(), grupo, cuentaId);
    },
    async quitarGerente(grupo: string): Promise<void> {
      await quitarGerenteDeGrupo(repositorio, await sesion.obtenerActorActual(), grupo);
    },
  };
}
