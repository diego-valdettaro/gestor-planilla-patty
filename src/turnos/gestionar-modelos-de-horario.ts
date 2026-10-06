import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeOperarAsistenciaDelGrupo, puedeConsultarConfiguracion } from "@/autenticacion/permisos";

export interface ModeloDeHorario {
  id: string;
  sede: string;
  nombre: string;
  entrada: string;
  salida: string;
  activo: boolean;
}

export interface RepositorioDeModelosDeHorario {
  guardar(modelo: ModeloDeHorario, responsableId: string): Promise<void>;
  buscarPorId(id: string): Promise<ModeloDeHorario | undefined>;
  eliminar(id: string, responsableId: string): Promise<void>;
  tieneUso(id: string): Promise<boolean>;
  obtenerGrupoDeSede(sede: string): Promise<string | undefined>;
}

type ModeloNuevo = Omit<ModeloDeHorario, "activo">;

export async function crearModeloDeHorario(
  repositorio: RepositorioDeModelosDeHorario,
  actor: Actor,
  modelo: ModeloNuevo,
): Promise<void> {
  await exigirPermisoSobreSede(repositorio, actor, modelo.sede);
  validarHorario(modelo.entrada, modelo.salida);
  await repositorio.guardar({ ...modelo, activo: true }, actor.id);
}

export async function guardarModeloDeHorario(
  repositorio: RepositorioDeModelosDeHorario,
  actor: Actor,
  modelo: ModeloDeHorario,
): Promise<void> {
  exigir(puedeConsultarConfiguracion(actor), MENSAJE_SIN_PERMISO);
  validarHorario(modelo.entrada, modelo.salida);
  const existente = await repositorio.buscarPorId(modelo.id);
  if (!existente) throw new Error("El modelo de horario no existe.");
  await exigirPermisoSobreSede(repositorio, actor, existente.sede);
  if (modelo.sede !== existente.sede) await exigirPermisoSobreSede(repositorio, actor, modelo.sede);
  if (await repositorio.tieneUso(modelo.id)) {
    if (modelo.activo || modelo.sede !== existente.sede || modelo.nombre !== existente.nombre || modelo.entrada !== existente.entrada || modelo.salida !== existente.salida) {
      throw new Error("Un modelo de horario usado solo se puede desactivar.");
    }
  }
  await repositorio.guardar(modelo, actor.id);
}

export async function eliminarModeloDeHorario(
  repositorio: RepositorioDeModelosDeHorario,
  actor: Actor,
  id: string,
): Promise<void> {
  exigir(puedeConsultarConfiguracion(actor), MENSAJE_SIN_PERMISO);
  const modelo = await repositorio.buscarPorId(id);
  if (!modelo) throw new Error("El modelo de horario no existe.");
  await exigirPermisoSobreSede(repositorio, actor, modelo.sede);
  if (await repositorio.tieneUso(id)) {
    await repositorio.guardar({ ...modelo, activo: false }, actor.id);
    return;
  }
  await repositorio.eliminar(id, actor.id);
}

const MENSAJE_SIN_PERMISO = "No tiene permiso para administrar modelos de horario.";

async function exigirPermisoSobreSede(repositorio: RepositorioDeModelosDeHorario, actor: Actor, sede: string): Promise<void> {
  exigir(puedeConsultarConfiguracion(actor), MENSAJE_SIN_PERMISO);
  const grupo = await repositorio.obtenerGrupoDeSede(sede);
  exigir(grupo !== undefined && puedeOperarAsistenciaDelGrupo(actor, grupo), MENSAJE_SIN_PERMISO);
}

function validarHorario(entrada: string, salida: string): void {
  if (!esHoraValida(entrada) || !esHoraValida(salida)) throw new Error("El modelo requiere horas válidas.");
  if (salida <= entrada) throw new Error("El modelo requiere una salida posterior a la entrada y no permite horario nocturno.");
}

function esHoraValida(valor: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
}
