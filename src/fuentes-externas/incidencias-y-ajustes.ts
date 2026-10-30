import { puedeAdministrarPersonalDelGrupo, type Actor } from "@/autenticacion/permisos";
import { efectosDeAjuste } from "@/conceptos-de-preliquidacion/catalogo";
import { esConceptoDeConciliacion } from "@/pagos/conciliacion-de-cese";
import { validarFechaDeRelacion } from "@/relaciones-laborales/gestionar-relaciones-laborales";

import { exigirMesAbierto, exigirPermiso, validarDatosDeImporte, type ImporteExterno, type RepositorioDeFuentesExternas } from "./gestionar-fuentes-externas";
import { PROCEDENCIA_CARGA_MANUAL } from "./valores";

type DatosComunes = { dni: string; fechaDelHecho: string; mesDeDevengue: string; mesDeAplicacion: string; monto: string };

type DatosDeIncidenciaDeGerente = { dni: string; fechaDelHecho: string; monto: string; motivo: string };

export async function registrarIncidencia(repositorio: RepositorioDeFuentesExternas, actor: Actor, datos: DatosComunes | DatosDeIncidenciaDeGerente): Promise<ImporteExterno> {
  const esGerente = actor.rol === "gerente_de_area";
  if (!esGerente) exigirPermiso(actor);
  let comunes: DatosComunes;
  let motivoIncidencia: string | undefined;
  if (esGerente) {
    if (!actor.grupos?.length) throw new Error("No tiene permiso para registrar incidencias de esta persona.");
    if (!("motivo" in datos) || !datos.motivo.trim()) throw new Error("El motivo de la incidencia es obligatorio.");
    motivoIncidencia = datos.motivo.trim();
    validarFechaDeRelacion(datos.fechaDelHecho, "la fecha del hecho");
    const fecha = datos.fechaDelHecho;
    const aplicacion = Number(fecha.slice(-2)) > 25 ? new Date(Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)), 1)).toISOString().slice(0, 7) : fecha.slice(0, 7);
    comunes = { dni: datos.dni, fechaDelHecho: fecha, monto: datos.monto, mesDeDevengue: fecha.slice(0, 7), mesDeAplicacion: aplicacion };
  } else {
    if (!("mesDeAplicacion" in datos)) throw new Error("El mes de aplicación es obligatorio.");
    comunes = datos;
  }
  return repositorio.ejecutarSobreFuente("incidencias_de_tienda", comunes.mesDeAplicacion, async (almacen) => {
    if (esGerente) {
      if (!almacen.buscarGrupoDePersona) throw new Error("No se puede verificar el grupo de la persona.");
      const grupo = await almacen.buscarGrupoDePersona(comunes.dni);
      if (!grupo || !puedeAdministrarPersonalDelGrupo(actor, grupo)) throw new Error("No tiene permiso para registrar incidencias de esta persona.");
      if (!almacen.gerenteAsignadoAlGrupo || !(await almacen.gerenteAsignadoAlGrupo(actor.id, grupo))) {
        throw new Error("No tiene permiso para registrar incidencias de esta persona.");
      }
    }
    await exigirMesAbierto(almacen, comunes.mesDeAplicacion);
    const { monto } = await validarDatosDeImporte(repositorio, comunes);
    const importe = await almacen.insertarImporte({ ...comunes, monto, tipoDeFuente: "incidencias_de_tienda", concepto: "descuento_autorizado_por_incidencia", estadoDeIncidencia: "sin_sustento", procedencia: PROCEDENCIA_CARGA_MANUAL, responsableId: actor.id, ...(motivoIncidencia ? { motivoIncidencia } : {}) });
    if (!importe) throw new Error("Ya existe una incidencia igual para esa persona, fecha, meses e importe.");
    await almacen.quitarConfirmacion("incidencias_de_tienda", comunes.mesDeAplicacion);
    return importe;
  });
}

export async function decidirIncidencia(repositorio: RepositorioDeFuentesExternas, actor: Actor, datos: { id: string; decision: "no_descontar" | "autorizar"; sustento?: string; autorizadoPor?: string; fechaDeAutorizacion?: string }): Promise<void> {
  exigirPermiso(actor);
  if (datos.decision !== "autorizar" && datos.decision !== "no_descontar") throw new Error("Elija una decisión válida para la incidencia.");
  const importe = await repositorio.buscarImporte(datos.id);
  if (!importe || importe.tipoDeFuente !== "incidencias_de_tienda" || importe.anuladoEn) throw new Error("No existe esa incidencia vigente.");
  const sustento = datos.sustento?.trim() || undefined;
  const autorizadoPor = datos.autorizadoPor?.trim() || undefined;
  const fechaDeAutorizacion = datos.fechaDeAutorizacion?.trim() || undefined;
  if (datos.decision === "autorizar") {
    if (!sustento || !autorizadoPor || !fechaDeAutorizacion) throw new Error("El descuento requiere texto de sustento, quién autoriza y fecha de autorización.");
    validarFechaDeRelacion(fechaDeAutorizacion, "la fecha de autorización");
  }
  await repositorio.ejecutarSobreFuente("incidencias_de_tienda", importe.mesDeAplicacion, async (almacen) => {
    await exigirMesAbierto(almacen, importe.mesDeAplicacion);
    const actual = await almacen.buscarImporte(importe.id);
    if (!actual || actual.anuladoEn || actual.estadoDeIncidencia === "descuento_autorizado") throw new Error("La incidencia ya fue resuelta; recargue la página.");
    if (!(await almacen.cambiarIncidencia(importe.id, datos.decision === "autorizar" ? "descuento_autorizado" : "en_investigacion", sustento, autorizadoPor, fechaDeAutorizacion))) throw new Error("No se pudo actualizar la incidencia.");
    await almacen.quitarConfirmacion("incidencias_de_tienda", importe.mesDeAplicacion);
  });
}

export async function registrarAjuste(repositorio: RepositorioDeFuentesExternas, actor: Actor, datos: DatosComunes & { conceptoAjustado: string; sentidoAjuste: "suma" | "resta"; motivo: string }): Promise<ImporteExterno> {
  exigirPermiso(actor);
  const { monto } = await validarDatosDeImporte(repositorio, datos);
  if (datos.sentidoAjuste !== "suma" && datos.sentidoAjuste !== "resta") throw new Error("Elija si aumenta o reduce el concepto corregido.");
  // Los conceptos de la conciliación no entran al neto ni a las bases (C3): un ajuste sobre ellos no haría nada.
  if (esConceptoDeConciliacion(datos.conceptoAjustado)) throw new Error("Los conceptos de la conciliación de liquidación por cese no admiten ajustes de preliquidación: no entran al neto ni a las bases. Corríjalos en la fuente de conciliación.");
  efectosDeAjuste(datos.conceptoAjustado, datos.sentidoAjuste);
  const motivo = datos.motivo.trim();
  if (!motivo || motivo.length > 250) throw new Error("Escriba un motivo de hasta 250 caracteres.");
  return repositorio.ejecutarSobreFuente("ajustes_de_preliquidacion", datos.mesDeAplicacion, async (almacen) => {
    await exigirMesAbierto(almacen, datos.mesDeAplicacion);
    const importe = await almacen.insertarImporte({ ...datos, monto, tipoDeFuente: "ajustes_de_preliquidacion", concepto: "ajuste_de_preliquidacion", conceptoAjustado: datos.conceptoAjustado, sentidoAjuste: datos.sentidoAjuste, motivoDeAjuste: motivo, procedencia: PROCEDENCIA_CARGA_MANUAL, responsableId: actor.id });
    if (!importe) throw new Error("Ya existe un ajuste con esa persona, fecha, meses e importe.");
    await almacen.quitarConfirmacion("ajustes_de_preliquidacion", datos.mesDeAplicacion);
    return importe;
  });
}
