import type { Actor } from "@/autenticacion/permisos";

import { exigirMesAbierto, exigirPermiso, validarDatosDeImporte, type ImporteExterno, type RepositorioDeFuentesExternas } from "./gestionar-fuentes-externas";
import { PROCEDENCIA_CARGA_MANUAL, mesDeLaFecha } from "./valores";

export const CONCEPTO_DE_ABONO_VACACIONAL = "abono_anticipado_de_remuneracion_vacacional";

/**
 * Registra el abono anticipado de remuneración vacacional: persona, fecha en que se entregó e importe. Los días del descanso
 * salen de las vacaciones aprobadas en Asistencia y el reparto por mes lo calcula Pagos; Finanzas no digita ninguno de los dos.
 * El mes de devengue de la fila es el de la fecha del abono, porque al registrarlo aún no se sabe a qué descanso pertenece.
 */
export async function registrarAbonoVacacional(
  repositorio: RepositorioDeFuentesExternas,
  actor: Actor,
  datos: { dni: string; fechaDelAbono: string; mesDeAplicacion: string; monto: string },
): Promise<ImporteExterno> {
  exigirPermiso(actor);
  const comunes = { dni: datos.dni, fechaDelHecho: datos.fechaDelAbono, mesDeDevengue: datos.fechaDelAbono ? mesDeLaFecha(datos.fechaDelAbono) : "", mesDeAplicacion: datos.mesDeAplicacion, monto: datos.monto };
  const { monto } = await validarDatosDeImporte(repositorio, comunes);
  return repositorio.ejecutarSobreFuente("abonos_vacacionales", datos.mesDeAplicacion, async (almacen) => {
    await exigirMesAbierto(almacen, datos.mesDeAplicacion);
    const importe = await almacen.insertarImporte({ ...comunes, monto, tipoDeFuente: "abonos_vacacionales", concepto: CONCEPTO_DE_ABONO_VACACIONAL, procedencia: PROCEDENCIA_CARGA_MANUAL, responsableId: actor.id });
    if (!importe) throw new Error("Ya existe un abono vacacional igual para esa persona, fecha, mes de aplicación e importe.");
    await almacen.quitarConfirmacion("abonos_vacacionales", datos.mesDeAplicacion);
    return importe;
  });
}
