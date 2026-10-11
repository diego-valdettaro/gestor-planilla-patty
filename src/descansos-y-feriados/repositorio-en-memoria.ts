import { randomUUID } from "node:crypto";

import { fechaDeHoyEnLima } from "@/condiciones-laborales/vigencia";

import type { DescansoSustitutorio, RepositorioDeDescansosYFeriados } from "./gestionar-descansos-y-feriados";
import type { AsistenciaDelDia, DescansoSemanalAsignado, Feriado } from "./reglas";

// Apoyo de pruebas: repositorio en memoria con dos personas de demo.
export const ANA = "99900001";
export const BETO = "99900002";

export function crearRepositorioEnMemoria() {
  const personas = new Set([ANA, BETO]);
  const descansos: DescansoSemanalAsignado[] = [];
  const feriados: Feriado[] = [];
  const sustitutorios: DescansoSustitutorio[] = [];
  const asistencias: Array<AsistenciaDelDia & { dni: string; fecha: string }> = [];

  const repositorio: RepositorioDeDescansosYFeriados = {
    existeColaborador: async (dni) => personas.has(dni),
    listarDescansosSemanales: async (dni) => descansos.filter((descanso) => descanso.dni === dni),
    insertarDescansoSemanal: async ({ responsableId: _responsable, ...asignacion }) => {
      if (descansos.some((descanso) => descanso.dni === asignacion.dni && descanso.vigenteDesde === asignacion.vigenteDesde)) return undefined;
      descansos.push(asignacion);
      return asignacion;
    },
    buscarFeriado: async (fecha) => feriados.find((feriado) => feriado.fecha === fecha),
    listarFeriados: async (desde, hasta) => feriados.filter((feriado) => feriado.fecha >= desde && feriado.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    insertarFeriado: async ({ responsableId: _responsable, ...feriado }) => {
      if (feriados.some((existente) => existente.fecha === feriado.fecha)) return undefined;
      feriados.push(feriado);
      return feriado;
    },
    renombrarFeriado: async (fecha, nombre) => {
      const feriado = feriados.find((existente) => existente.fecha === fecha);
      if (feriado) feriado.nombre = nombre;
      return Boolean(feriado);
    },
    quitarFeriado: async (fecha) => {
      const indice = feriados.findIndex((feriado) => feriado.fecha === fecha);
      if (indice >= 0) feriados.splice(indice, 1);
      return indice >= 0;
    },
    existeSustitutorioDeFeriado: async (fecha) => sustitutorios.some((sustitutorio) => sustitutorio.origenFecha === fecha && sustitutorio.origenTipo !== "descanso_semanal"),
    buscarSustitutorio: async (id) => sustitutorios.find((sustitutorio) => sustitutorio.id === id),
    listarSustitutorios: async (dni, desde, hasta) => sustitutorios.filter((sustitutorio) => sustitutorio.dni === dni && sustitutorio.origenFecha >= desde && sustitutorio.origenFecha <= hasta),
    listarSustitutoriosParaPagos: async (desde, hasta) => sustitutorios
      .map((sustitutorio) => ({ dni: sustitutorio.dni, origenFecha: sustitutorio.origenFecha, estado: sustitutorio.estado,
        verificadoEnLima: sustitutorio.verificadoEn ? fechaDeHoyEnLima(sustitutorio.verificadoEn) : null }))
      .filter((fila) => (fila.origenFecha >= desde && fila.origenFecha <= hasta)
        || (fila.estado === "no_otorgado" && fila.origenFecha < desde && fila.verificadoEnLima !== null && fila.verificadoEnLima >= desde && fila.verificadoEnLima <= hasta)),
    insertarSustitutorio: async ({ responsableId: _responsable, ...datos }) => {
      const choca = (existente: DescansoSustitutorio) => existente.dni === datos.dni && (existente.origenFecha === datos.origenFecha || (existente.fechaPrevista === datos.fechaPrevista && existente.estado !== "no_otorgado"));
      if (sustitutorios.some(choca)) return undefined;
      const sustitutorio: DescansoSustitutorio = { id: randomUUID(), ...datos, estado: "previsto", verificadoPorId: null, verificadoEn: null };
      sustitutorios.push(sustitutorio);
      return sustitutorio;
    },
    verificarSustitutorio: async (id, estado, responsableId, verificadoEn) => {
      const sustitutorio = sustitutorios.find((existente) => existente.id === id);
      if (!sustitutorio || sustitutorio.estado !== "previsto") return false;
      Object.assign(sustitutorio, { estado, verificadoPorId: responsableId, verificadoEn });
      return true;
    },
    asistenciasDelRango: async (dni, desde, hasta) => asistencias.filter((asistencia) => asistencia.dni === dni && asistencia.fecha >= desde && asistencia.fecha <= hasta),
  };
  return { repositorio, descansos, feriados, sustitutorios, asistencias };
}
