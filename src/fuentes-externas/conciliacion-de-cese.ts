import type { Actor } from "@/autenticacion/permisos";

import { exigirMesAbierto, exigirPermiso, exigirTipo, validarDatosDeImporte, type ImporteExterno, type RepositorioDeFuentesExternas } from "./gestionar-fuentes-externas";
import { PROCEDENCIA_CARGA_MANUAL } from "./valores";

const TIPO = "conciliacion_de_liquidacion_por_cese";

/**
 * Registra un concepto de la liquidación por cese o un abono ya pagado fuera del módulo: persona, concepto, fecha del hecho,
 * mes de devengue e importe, tal como lo calculó Finanzas. Pagos no calcula nada y el importe no entra al neto.
 * Corregir es anular con motivo y volver a registrar.
 */
export async function registrarConciliacionDeCese(
  repositorio: RepositorioDeFuentesExternas,
  actor: Actor,
  datos: { dni: string; concepto: string; fechaDelHecho: string; mesDeDevengue: string; mesDeAplicacion: string; monto: string },
): Promise<ImporteExterno> {
  exigirPermiso(actor);
  const tipo = exigirTipo(TIPO);
  if (!tipo.conceptos.includes(datos.concepto)) throw new Error(`El concepto ${datos.concepto} no se carga en ${tipo.nombre}. Elija un concepto de la liquidación.`);
  const { monto } = await validarDatosDeImporte(repositorio, datos);
  return repositorio.ejecutarSobreFuente(tipo.codigo, datos.mesDeAplicacion, async (almacen) => {
    await exigirMesAbierto(almacen, datos.mesDeAplicacion);
    const importe = await almacen.insertarImporte({
      tipoDeFuente: tipo.codigo, dni: datos.dni, concepto: datos.concepto, fechaDelHecho: datos.fechaDelHecho,
      mesDeDevengue: datos.mesDeDevengue, mesDeAplicacion: datos.mesDeAplicacion, monto,
      procedencia: PROCEDENCIA_CARGA_MANUAL, responsableId: actor.id,
    });
    if (!importe) throw new Error("Ya existe ese importe de la conciliación: misma persona, concepto, fecha del hecho, mes de devengue, mes de aplicación y monto.");
    await almacen.quitarConfirmacion(tipo.codigo, datos.mesDeAplicacion);
    return importe;
  });
}
