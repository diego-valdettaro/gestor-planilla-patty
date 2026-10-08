import type { Actor } from "@/autenticacion/permisos";
import { efectosDeAjuste } from "@/conceptos-de-preliquidacion/catalogo";
import { validarFechaDeRelacion } from "@/relaciones-laborales/gestionar-relaciones-laborales";

import { exigirMesAbierto, exigirPermiso, validarDatosDeImporte, type ImporteExterno, type RepositorioDeFuentesExternas } from "./gestionar-fuentes-externas";
import { PROCEDENCIA_CARGA_MANUAL } from "./valores";

type DatosComunes = { dni: string; fechaDelHecho: string; mesDeDevengue: string; mesDeAplicacion: string; monto: string };

export async function registrarIncidencia(repositorio: RepositorioDeFuentesExternas, actor: Actor, datos: DatosComunes): Promise<ImporteExterno> {
  exigirPermiso(actor);
  const { monto } = await validarDatosDeImporte(repositorio, datos);
  return repositorio.ejecutarSobreFuente("incidencias_de_tienda", datos.mesDeAplicacion, async (almacen) => {
    await exigirMesAbierto(almacen, datos.mesDeAplicacion);
    const importe = await almacen.insertarImporte({ ...datos, monto, tipoDeFuente: "incidencias_de_tienda", concepto: "descuento_autorizado_por_incidencia", estadoDeIncidencia: "sin_sustento", procedencia: PROCEDENCIA_CARGA_MANUAL, responsableId: actor.id });
    if (!importe) throw new Error("Ya existe una incidencia igual para esa persona, fecha, meses e importe.");
    await almacen.quitarConfirmacion("incidencias_de_tienda", datos.mesDeAplicacion);
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
