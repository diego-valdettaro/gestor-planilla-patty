import { describe, expect, it } from "vitest";

import { crearCasosDeUsoDeTurnos } from "./casos-de-uso-servidor";
import type {
  AsistenciaEsperada,
  RepositorioDeTurnos,
  TurnoPublicado,
} from "./publicar-turno-semanal";

function crearRepositorioEnMemoria(): {
  asistenciasEsperadas: AsistenciaEsperada[];
  historial: TurnoPublicado[];
  repositorio: RepositorioDeTurnos;
} {
  const turnos = new Map<string, TurnoPublicado>();
  const historial: TurnoPublicado[] = [];
  const asistenciasEsperadas: AsistenciaEsperada[] = [];

  return {
    asistenciasEsperadas,
    historial,
    repositorio: {
      buscarPublicado: async (idHuellero, fecha) => turnos.get(`${idHuellero}:${fecha}`),
      publicar: async (turno) => {
        turnos.set(`${turno.idHuellero}:${turno.fecha}`, turno);
        historial.push(turno);
        asistenciasEsperadas.push({
          idHuellero: turno.idHuellero,
          fecha: turno.fecha,
          estado: "pendiente",
        });
      },
      publicarEnLote: async (turnosParaPublicar) => {
        for (const turno of turnosParaPublicar) {
          turnos.set(`${turno.idHuellero}:${turno.fecha}`, turno);
          historial.push(turno);
          asistenciasEsperadas.push({ idHuellero: turno.idHuellero, fecha: turno.fecha, estado: "pendiente" });
        }
      },
      perteneceAPeriodoAbierto: async (fecha) => fecha >= "2026-08-26" && fecha <= "2026-09-25",
    },
  };
}

describe("casos de uso de turnos en el servidor", () => {
  it("permite a Operaciones publicar un turno y crea la asistencia esperada", async () => {
    const { asistenciasEsperadas, historial, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeTurnos(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
    });

    await casosDeUso.publicar({
      idHuellero: "HU-1024",
      fecha: "2026-09-01",
      sede: "Lima",
      entradaProgramada: "09:00",
      salidaProgramada: "18:00",
      descanso: false,
    });

    expect(historial).toEqual([
      expect.objectContaining({
        idHuellero: "HU-1024",
        fecha: "2026-09-01",
        sede: "Lima",
        entradaProgramada: "09:00",
        salidaProgramada: "18:00",
        descanso: false,
      }),
    ]);
    expect(asistenciasEsperadas).toEqual([
      {
        idHuellero: "HU-1024",
        fecha: "2026-09-01",
        estado: "pendiente",
      },
    ]);
  });

  it("impide publicar más de un turno para un colaborador en la misma fecha", async () => {
    const { asistenciasEsperadas, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeTurnos(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
    });
    const turno = {
      idHuellero: "HU-1024",
      fecha: "2026-09-01",
      sede: "Lima",
      entradaProgramada: "09:00",
      salidaProgramada: "18:00",
      descanso: false,
    };

    await casosDeUso.publicar(turno);

    await expect(casosDeUso.publicar(turno)).rejects.toThrow(
      "Ya existe un turno publicado para este colaborador y fecha.",
    );
    expect(asistenciasEsperadas).toHaveLength(1);
  });

  it("rechaza un turno cuya fecha no pertenece al período de planilla abierto", async () => {
    const { asistenciasEsperadas, historial, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeTurnos(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
    });

    await expect(
      casosDeUso.publicar({
        idHuellero: "HU-1024",
        fecha: "2026-09-26",
        sede: "Lima",
        entradaProgramada: "09:00",
        salidaProgramada: "18:00",
        descanso: false,
      }),
    ).rejects.toThrow("La fecha no pertenece a un período de planilla abierto.");

    expect(historial).toHaveLength(0);
    expect(asistenciasEsperadas).toHaveLength(0);
  });

  it("permite a Administración publicar un turno", async () => {
    const { asistenciasEsperadas, historial, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeTurnos(repositorio, {
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administracion" }),
    });

    await casosDeUso.publicar({
      idHuellero: "HU-1024",
      fecha: "2026-09-01",
      sede: "Lima",
      entradaProgramada: "09:00",
      salidaProgramada: "18:00",
      descanso: false,
    });

    expect(historial).toHaveLength(1);
    expect(asistenciasEsperadas).toHaveLength(1);
  });

  it("rechaza a Finanzas antes de publicar un turno", async () => {
    const { asistenciasEsperadas, historial, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeTurnos(repositorio, {
      obtenerActorActual: async () => ({ id: "finanzas-1", rol: "finanzas" }),
    });

    await expect(
      casosDeUso.publicar({
        idHuellero: "HU-1024",
        fecha: "2026-09-01",
        sede: "Lima",
        entradaProgramada: "09:00",
        salidaProgramada: "18:00",
        descanso: false,
      }),
    ).rejects.toThrow("No tiene permiso para publicar turnos.");

    expect(historial).toHaveLength(0);
    expect(asistenciasEsperadas).toHaveLength(0);
  });
});
