import { describe, expect, it } from "vitest";

import { calcularHoraExtra, type HoraExtraCalculada } from "./calcular-hora-extra";
import { crearCasosDeUsoDeAsistencias } from "./casos-de-uso-servidor";
import type {
  AsistenciaConfirmada,
  EstadoManual,
  RepositorioDeAsistencias,
  TurnoParaConfirmar,
} from "./confirmar-y-ajustar-asistencia";

type AsistenciaEnMemoria = AsistenciaConfirmada & { horaExtra?: HoraExtraCalculada };

function crearRepositorioEnMemoria(): {
  asistencias: AsistenciaEnMemoria[];
  ajustes: Array<{ motivo: string; responsableId: string }>;
  estadosManuales: EstadoManual[];
  marcasCrudas: string[];
  repositorio: RepositorioDeAsistencias;
} {
  const asistencias: AsistenciaEnMemoria[] = [];
  const ajustes: Array<{ motivo: string; responsableId: string }> = [];
  const estadosManuales: EstadoManual[] = [];
  const marcasCrudas = ["2026-09-01T09:04:00-05:00", "2026-09-01T18:02:00-05:00"];
  const turnos = new Map<string, TurnoParaConfirmar>([
    ["00001024:2026-09-01", {
      dni: "00001024", fecha: "2026-09-01", sede: "Lima", entradaProgramada: "09:00",
      salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null,
    }],
  ]);
  return {
    asistencias,
    ajustes,
    estadosManuales,
    marcasCrudas,
    repositorio: {
      obtenerGrupoDelColaborador: async (dni) => dni === "00001024" ? "Tiendas" : undefined,
      buscarTurnoPublicado: async (dni, fecha) => turnos.get(`${dni}:${fecha}`),
      // El cálculo real (con el límite semanal) vive en el repositorio PostgreSQL; aquí se imita para probar decisiones.
      confirmar: async (asistencia) => {
        const { entradaProgramada, salidaProgramada } = asistencia.instantaneaDeTurno;
        const horaExtra = entradaProgramada && salidaProgramada
          ? calcularHoraExtra({ entradaProgramada, salidaProgramada, entradaReal: asistencia.entradaReal, salidaReal: asistencia.salidaReal })
          : undefined;
        asistencias.push({ ...asistencia, horaExtra });
      },
      buscarInstantaneaDeTurno: async (dni, fecha) => {
        const turno = turnos.get(`${dni}:${fecha}`);
        return turno?.sede ? { ...turno, sede: turno.sede } : undefined;
      },
      ajustar: async (solicitud, responsableId) => {
        ajustes.push({ motivo: solicitud.motivo, responsableId });
      },
      decidirHoraExtra: async (dni, fecha, estado) => {
        const asistencia = asistencias.find((item) => item.dni === dni && item.fecha === fecha);
        if (asistencia?.horaExtra) asistencia.horaExtra.estado = estado;
      },
      registrarEstadoManual: async (estadoManual) => { estadosManuales.push(estadoManual); },
      buscarPoliticaVigente: async () => ({
        sede: "Lima", toleranciaEnMinutos: 10, tardanzasAcumuladas: 3, horasPenalizadas: 1,
        version: 1, vigenteDesde: "2026-08-26", configuradaPorId: "administracion-1", configuradaEn: new Date(),
      }),
      contarTardanzas: async () => 0,
    },
  };
}

const GERENTE_DE_TIENDAS = { id: "gerente-1", rol: "gerente_de_area" as const, grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] };
const FINANZAS = { id: "finanzas-1", rol: "finanzas" as const };

describe("casos de uso de asistencias en el servidor", () => {
  it("confirma una asistencia con la instantánea del turno y no depende de cambios posteriores", async () => {
    const { asistencias, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, {
      obtenerActorActual: async () => GERENTE_DE_TIENDAS,
    });

    await casosDeUso.confirmar({
      dni: "00001024", fecha: "2026-09-01", sede: "Lima", entradaReal: "2026-09-01T09:04:00-05:00",
      salidaReal: "2026-09-01T18:02:00-05:00",
    });

    expect(asistencias).toEqual([expect.objectContaining({
      dni: "00001024", fecha: "2026-09-01", confirmadoPorId: "gerente-1",
      minutosTrabajados: 538,
      instantaneaDeTurno: {
        sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00",
        descanso: false,
      },
    })]);
  });

  it("ajusta una asistencia con motivo y responsable sin alterar sus marcas crudas", async () => {
    const { ajustes, marcasCrudas, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, {
      obtenerActorActual: async () => GERENTE_DE_TIENDAS,
    });

    await casosDeUso.ajustar({
      dni: "00001024", fecha: "2026-09-01", entradaReal: "2026-09-01T09:00:00-05:00",
      salidaReal: "2026-09-01T18:15:00-05:00", motivo: "Olvidó registrar la entrada.",
    });

    expect(ajustes).toEqual([{ motivo: "Olvidó registrar la entrada.", responsableId: "gerente-1" }]);
    expect(marcasCrudas).toEqual(["2026-09-01T09:04:00-05:00", "2026-09-01T18:02:00-05:00"]);
  });

  it("registra la tardanza calculada al confirmar una asistencia", async () => {
    const { asistencias, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, {
      obtenerActorActual: async () => GERENTE_DE_TIENDAS,
    });

    await casosDeUso.confirmar({
      dni: "00001024", fecha: "2026-09-01", sede: "Lima", entradaReal: "2026-09-01T09:11:00-05:00",
      salidaReal: "2026-09-01T18:02:00-05:00",
    });

    expect(asistencias[0].tardanza).toEqual({ minutosDeTardanza: 11, minutosPenalizados: 0, politicaVersion: 1 });
  });

  it("permite que Finanzas apruebe una hora extra pendiente", async () => {
    const { asistencias, repositorio } = crearRepositorioEnMemoria();
    const casosDeGerente = crearCasosDeUsoDeAsistencias(repositorio, { obtenerActorActual: async () => GERENTE_DE_TIENDAS });
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, { obtenerActorActual: async () => FINANZAS });
    await casosDeGerente.confirmar({
      dni: "00001024", fecha: "2026-09-01", sede: "Lima", entradaReal: "2026-09-01T09:00:00-05:00",
      salidaReal: "2026-09-01T18:30:00-05:00",
    });

    await casosDeUso.aprobarHoraExtra({ dni: "00001024", fecha: "2026-09-01" });

    expect(asistencias[0].horaExtra?.estado).toBe("aprobada");
  });

  it("permite que Finanzas rechace una hora extra pendiente", async () => {
    const { asistencias, repositorio } = crearRepositorioEnMemoria();
    const casosDeGerente = crearCasosDeUsoDeAsistencias(repositorio, { obtenerActorActual: async () => GERENTE_DE_TIENDAS });
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, { obtenerActorActual: async () => FINANZAS });
    await casosDeGerente.confirmar({
      dni: "00001024", fecha: "2026-09-01", sede: "Lima", entradaReal: "2026-09-01T09:00:00-05:00",
      salidaReal: "2026-09-01T18:30:00-05:00",
    });

    await casosDeUso.rechazarHoraExtra({ dni: "00001024", fecha: "2026-09-01" });

    expect(asistencias[0].horaExtra?.estado).toBe("rechazada");
  });

  it("no permite que un gerente de área decida una hora extra", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, {
      obtenerActorActual: async () => GERENTE_DE_TIENDAS,
    });

    await expect(casosDeUso.aprobarHoraExtra({ dni: "00001024", fecha: "2026-09-01" }))
      .rejects.toThrow("No tiene permiso para decidir horas extra.");
  });

  it("registra un estado manual auditable que prevalece sobre las marcas crudas", async () => {
    const { estadosManuales, marcasCrudas, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, {
      obtenerActorActual: async () => GERENTE_DE_TIENDAS,
    });

    await casosDeUso.registrarEstadoManual({
      dni: "00001024", fecha: "2026-09-01", tipo: "vacaciones", comentario: "Vacaciones aprobadas.",
    });

    expect(estadosManuales).toEqual([{
      dni: "00001024", fecha: "2026-09-01", tipo: "vacaciones", comentario: "Vacaciones aprobadas.",
      responsableId: "gerente-1", registradoEn: expect.any(Date),
    }]);
    expect(marcasCrudas).toEqual(["2026-09-01T09:04:00-05:00", "2026-09-01T18:02:00-05:00"]);
  });

  it("registra un estado manual sobre una jornada laboral publicada", async () => {
    const { estadosManuales, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, {
      obtenerActorActual: async () => GERENTE_DE_TIENDAS,
    });

    await casosDeUso.registrarEstadoManual({
      dni: "00001024", fecha: "2026-09-01", tipo: "falta", comentario: "No asistió por enfermedad.",
    });

    expect(estadosManuales).toEqual([expect.objectContaining({ tipo: "falta", comentario: "No asistió por enfermedad." })]);
  });

  it("rechaza una sede de asistencia distinta de la sede publicada", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, {
      obtenerActorActual: async () => GERENTE_DE_TIENDAS,
    });

    await expect(casosDeUso.confirmar({
      dni: "00001024", fecha: "2026-09-01", sede: "Callao", entradaReal: "2026-09-01T09:00:00-05:00",
      salidaReal: "2026-09-01T18:00:00-05:00",
    })).rejects.toThrow("La sede registrada no coincide con la sede planificada (Lima). Corrija y republique el horario semanal.");
  });

  it("bloquea trabajo sobre un motivo planificado y pide corregir el horario", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, {
      obtenerActorActual: async () => GERENTE_DE_TIENDAS,
    });
    const turno = await repositorio.buscarTurnoPublicado("00001024", "2026-09-01");
    if (!turno) throw new Error("Falta el turno de prueba.");
    Object.assign(turno, {
      sede: null,
      entradaProgramada: null,
      salidaProgramada: null,
      descanso: true,
      motivoNoAsistencia: "feriado",
    });

    await expect(casosDeUso.confirmar({
      dni: "00001024", fecha: "2026-09-01", sede: "Lima", entradaReal: "2026-09-01T09:00:00-05:00",
      salidaReal: "2026-09-01T18:00:00-05:00",
    })).rejects.toThrow("El horario semanal tiene Feriado planificado. Corrija y republique el horario antes de registrar la asistencia.");
  });

  it("rechaza un estado manual sin comentario", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, {
      obtenerActorActual: async () => GERENTE_DE_TIENDAS,
    });

    await expect(casosDeUso.registrarEstadoManual({
      dni: "00001024", fecha: "2026-09-01", tipo: "falta", comentario: "  ",
    })).rejects.toThrow("El estado manual requiere un comentario.");
  });

  it("no permite que Finanzas registre un estado manual", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, {
      obtenerActorActual: async () => ({ id: "finanzas-1", rol: "finanzas" }),
    });

    await expect(casosDeUso.registrarEstadoManual({
      dni: "00001024", fecha: "2026-09-01", tipo: "falta", comentario: "Ausencia real.",
    })).rejects.toThrow("No tiene permiso para revisar asistencias.");
  });

  it("no permite que Finanzas confirme, ajuste ni registre estados manuales", async () => {
    const { asistencias, estadosManuales, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, { obtenerActorActual: async () => FINANZAS });

    await expect(casosDeUso.confirmar({ dni: "00001024", fecha: "2026-09-01", sede: "Lima", entradaReal: "2026-09-01T09:00:00-05:00", salidaReal: "2026-09-01T18:00:00-05:00" }))
      .rejects.toThrow("No tiene permiso para revisar asistencias.");
    await expect(casosDeUso.ajustar({ dni: "00001024", fecha: "2026-09-01", entradaReal: "2026-09-01T09:00:00-05:00", salidaReal: "2026-09-01T18:00:00-05:00", motivo: "Corrección" }))
      .rejects.toThrow("No tiene permiso para revisar asistencias.");
    await expect(casosDeUso.registrarEstadoManual({ dni: "00001024", fecha: "2026-09-01", tipo: "falta", comentario: "Ausencia real." }))
      .rejects.toThrow("No tiene permiso para revisar asistencias.");
    expect(asistencias).toEqual([]);
    expect(estadosManuales).toEqual([]);
  });

  it("rechaza al gerente de otro grupo y al de un grupo que no gestiona asistencia", async () => {
    const { asistencias, repositorio } = crearRepositorioEnMemoria();
    const solicitud = { dni: "00001024", fecha: "2026-09-01", sede: "Lima", entradaReal: "2026-09-01T09:00:00-05:00", salidaReal: "2026-09-01T18:00:00-05:00" };
    const deOtroGrupo = crearCasosDeUsoDeAsistencias(repositorio, { obtenerActorActual: async () => ({ id: "gerente-2", rol: "gerente_de_area", grupos: [{ nombre: "Taller", gestionaAsistencia: true }] }) });
    const sinAsistencia = crearCasosDeUsoDeAsistencias(repositorio, { obtenerActorActual: async () => ({ id: "gerente-3", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: false }] }) });

    await expect(deOtroGrupo.confirmar(solicitud)).rejects.toThrow("No tiene permiso para revisar asistencias de este grupo.");
    await expect(sinAsistencia.confirmar(solicitud)).rejects.toThrow("No tiene permiso para revisar asistencias.");
    expect(asistencias).toEqual([]);
  });

  it("permite al Administrador operar cualquier grupo", async () => {
    const { asistencias, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorio, { obtenerActorActual: async () => ({ id: "admin-1", rol: "administrador" }) });

    await casosDeUso.confirmar({ dni: "00001024", fecha: "2026-09-01", sede: "Lima", entradaReal: "2026-09-01T09:00:00-05:00", salidaReal: "2026-09-01T18:00:00-05:00" });

    expect(asistencias).toHaveLength(1);
  });
});
