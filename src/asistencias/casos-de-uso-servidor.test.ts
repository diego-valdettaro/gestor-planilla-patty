import { describe, expect, it } from "vitest";

import { crearCasosDeUsoDeAsistencias } from "./casos-de-uso-servidor";
import type {
  AsistenciaConfirmada,
  EstadoManual,
  RepositorioDeAsistencias,
  TurnoParaConfirmar,
} from "./confirmar-y-ajustar-asistencia";

function crearRepositorioEnMemoria(): {
  asistencias: AsistenciaConfirmada[];
  ajustes: Array<{ motivo: string; responsableId: string }>;
  estadosManuales: EstadoManual[];
  marcasCrudas: string[];
  repositorio: RepositorioDeAsistencias;
} {
  const asistencias: AsistenciaConfirmada[] = [];
  const ajustes: Array<{ motivo: string; responsableId: string }> = [];
  const estadosManuales: EstadoManual[] = [];
  const marcasCrudas = ["2026-09-01T09:04:00-05:00", "2026-09-01T18:02:00-05:00"];
  const turnos = new Map<string, TurnoParaConfirmar>([
    ["HU-1024:2026-09-01", {
      idHuellero: "HU-1024", fecha: "2026-09-01", sede: "Lima", entradaProgramada: "09:00",
      salidaProgramada: "18:00", minutosDeAlmuerzo: 60, descanso: false,
    }],
  ]);
  return {
    asistencias,
    ajustes,
    estadosManuales,
    marcasCrudas,
    repositorio: {
      buscarTurnoPublicado: async (idHuellero, fecha) => turnos.get(`${idHuellero}:${fecha}`),
      confirmar: async (asistencia) => { asistencias.push(asistencia); },
      ajustar: async (solicitud, responsableId) => { ajustes.push({ motivo: solicitud.motivo, responsableId }); },
      registrarEstadoManual: async (estadoManual) => { estadosManuales.push(estadoManual); },
    },
  };
}

describe("casos de uso de asistencias en el servidor", () => {
  it("confirma una asistencia con la instantánea del turno y no depende de cambios posteriores", async () => {
    const { asistencias, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, {
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administracion" }),
    });

    await casosDeUso.confirmar({
      idHuellero: "HU-1024", fecha: "2026-09-01", entradaReal: "2026-09-01T09:04:00-05:00",
      salidaReal: "2026-09-01T18:02:00-05:00",
    });

    expect(asistencias).toEqual([expect.objectContaining({
      idHuellero: "HU-1024", fecha: "2026-09-01", confirmadoPorId: "administracion-1",
      minutosTrabajados: 538,
      instantaneaDeTurno: {
        sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00",
        minutosDeAlmuerzo: 60, descanso: false,
      },
    })]);
  });

  it("ajusta una asistencia con motivo y responsable sin alterar sus marcas crudas", async () => {
    const { ajustes, marcasCrudas, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, {
      obtenerActorActual: async () => ({ id: "finanzas-1", rol: "finanzas" }),
    });

    await casosDeUso.ajustar({
      idHuellero: "HU-1024", fecha: "2026-09-01", entradaReal: "2026-09-01T09:00:00-05:00",
      salidaReal: "2026-09-01T18:15:00-05:00", motivo: "Olvidó registrar la entrada.",
    });

    expect(ajustes).toEqual([{ motivo: "Olvidó registrar la entrada.", responsableId: "finanzas-1" }]);
    expect(marcasCrudas).toEqual(["2026-09-01T09:04:00-05:00", "2026-09-01T18:02:00-05:00"]);
  });

  it("registra un estado manual auditable que prevalece sobre las marcas crudas", async () => {
    const { estadosManuales, marcasCrudas, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, {
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administracion" }),
    });

    await casosDeUso.registrarEstadoManual({
      idHuellero: "HU-1024", fecha: "2026-09-01", tipo: "vacaciones", comentario: "Vacaciones aprobadas.",
    });

    expect(estadosManuales).toEqual([{
      idHuellero: "HU-1024", fecha: "2026-09-01", tipo: "vacaciones", comentario: "Vacaciones aprobadas.",
      responsableId: "administracion-1", registradoEn: expect.any(Date),
    }]);
    expect(marcasCrudas).toEqual(["2026-09-01T09:04:00-05:00", "2026-09-01T18:02:00-05:00"]);
  });

  it("rechaza un estado manual sin comentario", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, {
      obtenerActorActual: async () => ({ id: "finanzas-1", rol: "finanzas" }),
    });

    await expect(casosDeUso.registrarEstadoManual({
      idHuellero: "HU-1024", fecha: "2026-09-01", tipo: "falta", comentario: "  ",
    })).rejects.toThrow("El estado manual requiere un comentario.");
  });

  it("no permite que Operaciones registre un estado manual", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
    });

    await expect(casosDeUso.registrarEstadoManual({
      idHuellero: "HU-1024", fecha: "2026-09-01", tipo: "descanso", comentario: "Descanso programado.",
    })).rejects.toThrow("No tiene permiso para revisar asistencias.");
  });
});
