import type { CuentaLocal, RepositorioDeCuentas } from "./iniciar-sesion";
import { ROLES, exigir, puedeAdministrarCuentas, rolesQueSePuedenCrear, type Actor, type Rol } from "./permisos";

const LONGITUD_MINIMA_DE_CONTRASENA = 8;

export interface RepositorioDeGestionDeCuentas extends Pick<RepositorioDeCuentas, "buscarPorNombreUsuario"> {
  guardarCuenta(cuenta: Omit<CuentaLocal, "id">): Promise<void>;
  buscarCuentaPorId(id: string): Promise<{ id: string; nombreUsuario: string; rol: Rol } | undefined>;
  existeGrupo(nombre: string): Promise<boolean>;
  buscarGerenteDelGrupo(grupo: string): Promise<string | undefined>;
  /** Devuelve false si el grupo ya tenía gerente (un grupo tiene a lo sumo uno). */
  asignarGerente(grupo: string, cuentaId: string): Promise<boolean>;
  quitarGerente(grupo: string): Promise<void>;
}

export async function crearCuenta(
  repositorio: RepositorioDeGestionDeCuentas,
  actor: Actor,
  datos: { nombreUsuario: string; contrasena: string; rol: Rol },
  hashContrasena: (contrasena: string) => Promise<string>,
): Promise<void> {
  exigir(puedeAdministrarCuentas(actor), "No tiene permiso para crear cuentas de ese rol.");
  exigir(ROLES.includes(datos.rol), "El rol no es válido.");
  exigir(rolesQueSePuedenCrear(actor).includes(datos.rol), "No tiene permiso para crear cuentas de ese rol.");
  const nombreUsuario = datos.nombreUsuario.trim();
  exigir(Boolean(nombreUsuario), "El nombre de usuario es obligatorio.");
  exigir(datos.contrasena.length >= LONGITUD_MINIMA_DE_CONTRASENA, `La contraseña debe tener al menos ${LONGITUD_MINIMA_DE_CONTRASENA} caracteres.`);
  exigir(!(await repositorio.buscarPorNombreUsuario(nombreUsuario)), "Ya existe una cuenta con ese nombre de usuario.");

  await repositorio.guardarCuenta({ nombreUsuario, hashContrasena: await hashContrasena(datos.contrasena), rol: datos.rol });
}

export async function asignarGerenteAGrupo(
  repositorio: RepositorioDeGestionDeCuentas,
  actor: Actor,
  grupo: string,
  cuentaId: string,
): Promise<void> {
  exigir(puedeAdministrarCuentas(actor), "No tiene permiso para asignar gerentes a grupos.");
  const cuenta = await repositorio.buscarCuentaPorId(cuentaId);
  exigir(Boolean(cuenta), "La cuenta no existe.");
  exigir(cuenta?.rol === "gerente_de_area", "Solo se puede asignar grupos a una cuenta de gerente de área.");
  exigir(await repositorio.existeGrupo(grupo), "El grupo no existe.");

  const actual = await repositorio.buscarGerenteDelGrupo(grupo);
  if (actual === cuentaId) return;
  if (actual) throw new Error(`El grupo ${grupo} ya tiene gerente (${(await repositorio.buscarCuentaPorId(actual))?.nombreUsuario ?? "otra cuenta"}). Quítelo primero.`);
  exigir(await repositorio.asignarGerente(grupo, cuentaId), `El grupo ${grupo} ya tiene gerente. Quítelo primero.`);
}

export async function quitarGerenteDeGrupo(repositorio: RepositorioDeGestionDeCuentas, actor: Actor, grupo: string): Promise<void> {
  exigir(puedeAdministrarCuentas(actor), "No tiene permiso para asignar gerentes a grupos.");
  await repositorio.quitarGerente(grupo);
}
