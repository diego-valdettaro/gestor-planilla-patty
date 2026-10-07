import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeGestionarPagos } from "@/autenticacion/permisos";
import { validarFechaDeRelacion } from "@/relaciones-laborales/gestionar-relaciones-laborales";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";

import { DATOS_LABORALES, NOMBRE_DE_DATO, type DatoLaboral, type ValorLaboral } from "./catalogo";
import { interpretarValor } from "./valores";
import { armarHistorial, datosFaltantes, valoresVigentesEn, type CondicionLaboral, type EntradaDeHistorial, type ValoresVigentes } from "./vigencia";

export type { CondicionLaboral, EntradaDeHistorial, ValoresVigentes } from "./vigencia";

/** Relación laboral con ingreso confirmado por Recursos Humanos; `cese` es solo el cese confirmado. */
export interface RelacionParaCondiciones {
  id: string;
  dni: string;
  nombre: string;
  grupo: string;
  ingreso: string;
  cese: string | null;
}

/** Versión finalizada de un mes de pago que aplicó una condición (`mes` es AAAA-MM). */
export interface VersionFinalizada {
  mes: string;
  numero: number;
}

export interface NuevaCondicion {
  relacionId: string;
  dato: DatoLaboral;
  valor: ValorLaboral;
  vigenteDesde: string;
  responsableId: string;
}

/** Operaciones sobre las condiciones de una relación; dentro de `ejecutarSobreRelacion` corren en una transacción con la relación bloqueada. */
export interface AlmacenDeCondiciones {
  /** Solo relaciones con ingreso confirmado. */
  buscarRelacion(id: string): Promise<RelacionParaCondiciones | undefined>;
  /** Sedes existentes (el mismo catálogo de Configuración); no hay otro catálogo de centros de costo. */
  buscarSede(nombre: string): Promise<{ nombre: string; activa: boolean } | undefined>;
  /** Todas las condiciones de la relación, también las reemplazadas. */
  listar(relacionId: string): Promise<CondicionLaboral[]>;
  buscar(id: string): Promise<CondicionLaboral | undefined>;
  /** undefined si el dato ya tiene un valor activo con esa vigencia. */
  insertar(condicion: NuevaCondicion): Promise<CondicionLaboral | undefined>;
  /** false si ya estaba reemplazada. */
  reemplazar(id: string, motivo: string, reemplazadaEn: Date): Promise<boolean>;
}

export interface RepositorioDeCondicionesLaborales extends AlmacenDeCondiciones {
  listarRelaciones(): Promise<RelacionParaCondiciones[]>;
  listarTodas(): Promise<CondicionLaboral[]>;
  listarSedesActivas(): Promise<string[]>;
  /**
   * Versiones finalizadas de Pagos que aplicaron esta condición. Pagos todavía no finaliza versiones: el ticket de
   * finalización debe implementar esta consulta, que hoy no devuelve nada.
   */
  versionesFinalizadasQueUsan(condicionId: string): Promise<VersionFinalizada[]>;
  /** Serializa las operaciones de una misma relación para que dos registros simultáneos no se pisen. */
  ejecutarSobreRelacion<T>(relacionId: string, operacion: (almacen: AlmacenDeCondiciones) => Promise<T>): Promise<T>;
}

export interface FiltrosDeCondiciones {
  grupo?: string;
  sede?: string;
  /** Texto contenido en el nombre o el DNI. */
  persona?: string;
  soloFaltantes?: boolean;
}

export interface FilaDeCondiciones extends RelacionParaCondiciones {
  vigentes: ValoresVigentes;
  faltantes: DatoLaboral[];
}

export interface ListadoDeCondiciones {
  filas: FilaDeCondiciones[];
  /** Sedes activas y las que alguna persona tiene hoy como sede de adscripción, aunque se hayan desactivado. */
  sedes: string[];
  /** Relaciones confirmadas antes de filtrar. */
  total: number;
  grupos: string[];
}

export interface HistorialDeDato {
  dato: DatoLaboral;
  historial: EntradaDeHistorial[];
  vigente: ValorLaboral | undefined;
}

export interface DetalleDeRelacion {
  relacion: RelacionParaCondiciones;
  datos: HistorialDeDato[];
  /** Condiciones activas que una versión finalizada ya usa: solo se corrigen con un ajuste de preliquidación. */
  usadasPorVersiones: Record<string, VersionFinalizada[]>;
}

const MAXIMO_DE_CARACTERES_DEL_MOTIVO = 250;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirPermiso(actor: Actor): void {
  exigir(puedeGestionarPagos(actor), "No tiene permiso para consultar ni editar Pagos.");
}

function exigirDato(dato: string): DatoLaboral {
  const encontrado = DATOS_LABORALES.find((candidato) => candidato === dato);
  if (!encontrado) throw new Error("Elija el dato laboral que quiere registrar.");
  return encontrado;
}

/** «Lo usa la versión 2 de 09/2026; corríjalo con un ajuste de preliquidación.» */
export function textoDeUsoEnVersiones(versiones: VersionFinalizada[]): string {
  const detalle = versiones.map(({ numero, mes }) => `la versión ${numero} de ${mes.slice(5, 7)}/${mes.slice(0, 4)}`).join(" y ");
  return `Lo usa ${detalle}; corríjalo con un ajuste de preliquidación.`;
}

async function exigirSedeActiva(repositorio: Pick<AlmacenDeCondiciones, "buscarSede">, sede: string): Promise<void> {
  const existente = await repositorio.buscarSede(sede);
  if (!existente) throw new Error(`No existe la sede «${sede}». La sede de adscripción debe ser una de las sedes de Configuración.`);
  if (!existente.activa) throw new Error(`La sede «${sede}» está inactiva: elija una sede activa.`);
}

const RELACION_INEXISTENTE = "No existe esa relación laboral confirmada por Recursos Humanos.";

async function relacionConfirmada(fuente: Pick<AlmacenDeCondiciones, "buscarRelacion">, relacionId: string): Promise<RelacionParaCondiciones> {
  const relacion = UUID.test(relacionId) ? await fuente.buscarRelacion(relacionId) : undefined;
  if (!relacion) throw new Error(RELACION_INEXISTENTE);
  return relacion;
}

function exigirVigenciaDentroDeLaRelacion(relacion: RelacionParaCondiciones, vigenteDesde: string): void {
  if (vigenteDesde < relacion.ingreso) {
    throw new Error(`La vigencia no puede empezar antes del ingreso (${formatearFechaDeRelacion(relacion.ingreso)}).`);
  }
  if (relacion.cese !== null && vigenteDesde > relacion.cese) {
    throw new Error(`La vigencia no puede empezar después del cese (${formatearFechaDeRelacion(relacion.cese)}).`);
  }
}

/**
 * Registra un valor nuevo desde `vigenteDesde`, que debe ser posterior a la última vigencia del dato. No modifica
 * ninguna fila existente: el valor anterior deja de regir el día previo y su historia queda intacta. Las
 * comprobaciones corren con la relación bloqueada, así un cese confirmado o una sede desactivada no se cuelan.
 * `valor` es el texto del formulario.
 */
export async function registrarCondicionLaboral(
  repositorio: RepositorioDeCondicionesLaborales,
  actor: Actor,
  solicitud: { relacionId: string; dato: string; valor: string; vigenteDesde: string },
): Promise<CondicionLaboral> {
  exigirPermiso(actor);
  const dato = exigirDato(solicitud.dato);
  validarFechaDeRelacion(solicitud.vigenteDesde, "inicio de la vigencia");
  const valor = interpretarValor(dato, solicitud.valor);
  const rechazoPorVigencia = (desde: string) => new Error(`${NOMBRE_DE_DATO[dato]} ya tiene un valor desde el ${formatearFechaDeRelacion(desde)}. Un valor nuevo debe empezar después de esa fecha; para cambiar uno ya registrado use «Corregir».`);

  // Un identificador que no es UUID no existe; así la base no recibe un valor que no puede interpretar ni bloquea nada.
  if (!UUID.test(solicitud.relacionId)) throw new Error(RELACION_INEXISTENTE);
  return repositorio.ejecutarSobreRelacion(solicitud.relacionId, async (almacen) => {
    const relacion = await relacionConfirmada(almacen, solicitud.relacionId);
    exigirVigenciaDentroDeLaRelacion(relacion, solicitud.vigenteDesde);
    if (dato === "sede_de_adscripcion") await exigirSedeActiva(almacen, String(valor));
    const ultima = (await almacen.listar(relacion.id)).filter((condicion) => condicion.dato === dato && condicion.reemplazadaEn === null).map(({ vigenteDesde }) => vigenteDesde).sort().at(-1);
    if (ultima !== undefined && solicitud.vigenteDesde <= ultima) throw rechazoPorVigencia(ultima);
    const registrada = await almacen.insertar({ relacionId: relacion.id, dato, valor, vigenteDesde: solicitud.vigenteDesde, responsableId: actor.id });
    if (!registrada) throw rechazoPorVigencia(solicitud.vigenteDesde);
    return registrada;
  });
}

/**
 * Corrige un valor ya registrado: la fila anterior queda «Reemplazada» con su motivo y otra ocupa la misma vigencia.
 * Solo si ninguna versión finalizada lo usó; si lo usó, se corrige con un ajuste de preliquidación.
 */
export async function corregirCondicionLaboral(
  repositorio: RepositorioDeCondicionesLaborales,
  actor: Actor,
  solicitud: { condicionId: string; valor: string; motivo: string },
): Promise<CondicionLaboral> {
  exigirPermiso(actor);
  const motivo = solicitud.motivo.trim();
  if (!motivo) throw new Error("Escriba el motivo de la corrección.");
  if (motivo.length > MAXIMO_DE_CARACTERES_DEL_MOTIVO) throw new Error(`El motivo no puede superar ${MAXIMO_DE_CARACTERES_DEL_MOTIVO} caracteres.`);
  const anterior = UUID.test(solicitud.condicionId) ? await repositorio.buscar(solicitud.condicionId) : undefined;
  if (!anterior) throw new Error("No existe ese valor.");
  const valor = interpretarValor(anterior.dato, solicitud.valor);
  if (valor === anterior.valor) throw new Error("El valor nuevo es igual al registrado: no hay nada que corregir.");

  return repositorio.ejecutarSobreRelacion(anterior.relacionId, async (almacen) => {
    const vigente = await almacen.buscar(anterior.id);
    if (!vigente || vigente.reemplazadaEn !== null) throw new Error("Ese valor ya fue reemplazado. Recargue la página para ver el valor vigente.");
    exigirVigenciaDentroDeLaRelacion(await relacionConfirmada(almacen, vigente.relacionId), vigente.vigenteDesde);
    if (vigente.dato === "sede_de_adscripcion") await exigirSedeActiva(almacen, String(valor));
    const versiones = await repositorio.versionesFinalizadasQueUsan(vigente.id);
    if (versiones.length) throw new Error(textoDeUsoEnVersiones(versiones));
    if (!(await almacen.reemplazar(vigente.id, motivo, new Date()))) throw new Error("Ese valor ya fue reemplazado. Recargue la página para ver el valor vigente.");
    const nueva = await almacen.insertar({ relacionId: vigente.relacionId, dato: vigente.dato, valor, vigenteDesde: vigente.vigenteDesde, responsableId: actor.id });
    if (!nueva) throw new Error("No se pudo registrar el valor corregido.");
    return nueva;
  });
}

function coincideConPersona(relacion: RelacionParaCondiciones, texto: string): boolean {
  const buscado = texto.trim().toLocaleLowerCase("es");
  return !buscado || relacion.nombre.toLocaleLowerCase("es").includes(buscado) || relacion.dni.includes(buscado);
}

/** Una fila por relación laboral confirmada, con los valores vigentes en `hoy` y lo que le falta. */
export async function listarCondicionesLaborales(
  repositorio: RepositorioDeCondicionesLaborales,
  actor: Actor,
  consulta: { hoy: string; filtros?: FiltrosDeCondiciones },
): Promise<ListadoDeCondiciones> {
  exigirPermiso(actor);
  validarFechaDeRelacion(consulta.hoy, "hoy");
  const filtros = consulta.filtros ?? {};
  const [relaciones, condiciones, sedesActivas] = await Promise.all([repositorio.listarRelaciones(), repositorio.listarTodas(), repositorio.listarSedesActivas()]);
  const porRelacion = new Map<string, CondicionLaboral[]>();
  for (const condicion of condiciones) porRelacion.set(condicion.relacionId, [...(porRelacion.get(condicion.relacionId) ?? []), condicion]);

  const filas = relaciones.map((relacion): FilaDeCondiciones => {
    const vigentes = valoresVigentesEn(porRelacion.get(relacion.id) ?? [], consulta.hoy);
    return { ...relacion, vigentes, faltantes: datosFaltantes(vigentes) };
  });
  const sedesEnUso = filas.flatMap(({ vigentes }) => typeof vigentes.sede_de_adscripcion === "string" ? [vigentes.sede_de_adscripcion] : []);
  return {
    total: filas.length,
    sedes: [...new Set([...sedesActivas, ...sedesEnUso])].sort((a, b) => a.localeCompare(b, "es")),
    grupos: [...new Set(filas.map(({ grupo }) => grupo))].sort((a, b) => a.localeCompare(b, "es")),
    filas: filas
      .filter((fila) => (!filtros.grupo || fila.grupo === filtros.grupo)
        && (!filtros.sede || fila.vigentes.sede_de_adscripcion === filtros.sede)
        && coincideConPersona(fila, filtros.persona ?? "")
        && (!filtros.soloFaltantes || fila.faltantes.length > 0))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || b.ingreso.localeCompare(a.ingreso)),
  };
}

/** Objeto y historial de cada dato de una relación; undefined si no existe o su ingreso no está confirmado. */
export async function consultarDetalleDeRelacion(
  repositorio: RepositorioDeCondicionesLaborales,
  actor: Actor,
  relacionId: string,
  hoy: string,
): Promise<DetalleDeRelacion | undefined> {
  exigirPermiso(actor);
  validarFechaDeRelacion(hoy, "hoy");
  const relacion = UUID.test(relacionId) ? await repositorio.buscarRelacion(relacionId) : undefined;
  if (!relacion) return undefined;
  const condiciones = await repositorio.listar(relacionId);
  const datos = DATOS_LABORALES.map((dato): HistorialDeDato => {
    const delDato = condiciones.filter((condicion) => condicion.dato === dato);
    return { dato, historial: armarHistorial(delDato, hoy), vigente: valoresVigentesEn(delDato, hoy)[dato] };
  });
  const usadasPorVersiones: Record<string, VersionFinalizada[]> = {};
  for (const { id } of condiciones.filter((condicion) => condicion.reemplazadaEn === null)) {
    const versiones = await repositorio.versionesFinalizadasQueUsan(id);
    if (versiones.length) usadasPorVersiones[id] = versiones;
  }
  return { relacion, datos, usadasPorVersiones };
}

/** Los siete datos vigentes de la relación en `fecha`; undefined donde falta (nunca cero). */
export async function consultarCondicionesVigentes(
  repositorio: RepositorioDeCondicionesLaborales,
  actor: Actor,
  relacionId: string,
  fecha: string,
): Promise<ValoresVigentes> {
  exigirPermiso(actor);
  validarFechaDeRelacion(fecha, "la consulta");
  await relacionConfirmada(repositorio, relacionId);
  return valoresVigentesEn(await repositorio.listar(relacionId), fecha);
}

export async function listarSedesDeAdscripcion(repositorio: RepositorioDeCondicionesLaborales, actor: Actor): Promise<string[]> {
  exigirPermiso(actor);
  return repositorio.listarSedesActivas();
}
