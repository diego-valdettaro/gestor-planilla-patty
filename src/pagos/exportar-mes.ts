import { NOMBRE_DE_ROL, type Actor } from "@/autenticacion/permisos";
import { corteDeIncidencias } from "@/periodos/hechos-para-pagos";

import { construirArchivoDePreliquidacion, sedeDeAdscripcionAlFinalizar, type ArchivoDePreliquidacion, type PreliquidacionParaExportar } from "./exportar-preliquidacion";
import { consultarVersion, exigirFinanzas, type DependenciasDeFinalizacion } from "./finalizar-mes";
import { sueldoCalculadoDe } from "./fuentes-en-el-neto";
import { prepararBorrador } from "./preparar-borrador";

// Exportar la preliquidación de un mes (#131, interacción 4.8): el borrador de hoy o una versión finalizada tal como se guardó (D11, D15).

export const MENSAJE_SIN_DATOS_PARA_EXPORTAR = "No hay datos para exportar: revise las relaciones laborales confirmadas por Recursos Humanos";

export type ResultadoDeExportacion =
  | { estado: "lista"; archivo: ArchivoDePreliquidacion }
  | { estado: "sin_personas"; mensaje: string }
  | { estado: "sin_version" };

export async function exportarPreliquidacion(dependencias: DependenciasDeFinalizacion, actor: Actor | undefined, solicitud: { mes: string; version?: number }): Promise<ResultadoDeExportacion> {
  exigirFinanzas(actor);
  const { mes } = solicitud;
  const generadaPor = actor.nombreUsuario ?? NOMBRE_DE_ROL[actor.rol];
  const generadaEn = dependencias.ahora();
  if (solicitud.version === undefined) {
    const borrador = await prepararBorrador(dependencias.fuentes, mes);
    if (borrador.personas.length === 0) return { estado: "sin_personas", mensaje: MENSAJE_SIN_DATOS_PARA_EXPORTAR };
    return listo({ mes, corte: borrador.corte, estado: { tipo: "borrador" }, generadaEn, generadaPor, revisiones: borrador.revisiones, fuentes: borrador.fuentes,
      personas: borrador.personas.map((persona) => ({ dni: persona.relacion.dni, nombre: persona.relacion.nombre, sedeDeAdscripcion: persona.sedeDeAdscripcion,
        sueldoCalculadoCentimos: persona.sueldoCalculadoCentimos, netoCentimos: persona.netoCentimos, bloqueos: persona.bloqueos, lineas: persona.lineas, bases: persona.basesPorDevengue })) });
  }
  const version = await consultarVersion(dependencias, actor, mes, solicitud.version);
  if (!version) return { estado: "sin_version" };
  const [relaciones, condiciones] = await Promise.all([dependencias.fuentes.relaciones.listarConPersona(), dependencias.fuentes.condiciones.listarTodas()]);
  return listo({ mes, corte: corteDeIncidencias(mes), estado: { tipo: "version", numero: version.numero, finalizadaPor: version.finalizadaPor, finalizadaEn: version.finalizadaEn }, generadaEn, generadaPor,
    revisiones: version.revisiones, fuentes: version.fuentes,
    personas: version.personas.map((persona) => ({ dni: persona.dni, nombre: persona.nombre, sueldoCalculadoCentimos: sueldoCalculadoDe(persona.lineas), netoCentimos: persona.subtotalCentimos, bloqueos: [],
      sedeDeAdscripcion: sedeDeAdscripcionAlFinalizar({ condiciones, relacionId: persona.relacionId, mes, finalizadaEn: version.finalizadaEn,
        ingreso: relaciones.find(({ id }) => id === persona.relacionId)?.ingreso ?? `${mes}-01` }),
      lineas: persona.lineas, bases: persona.bases })) });
}

const listo = (preliquidacion: PreliquidacionParaExportar): ResultadoDeExportacion => ({ estado: "lista", archivo: construirArchivoDePreliquidacion(preliquidacion) });
