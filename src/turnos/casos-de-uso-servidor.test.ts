import { describe, expect, it } from "vitest";

import { crearCasosDeUsoDeTurnos } from "./casos-de-uso-servidor";
import type {
  AsistenciaEsperada,
  RepositorioDeTurnos,
  TurnoPublicado,
} from "./publicar-turno-semanal";
import type { RepositorioParaProcesarHorarioSemanal } from "./procesar-horario-semanal";

function crearRepositorioEnMemoria(): {
  asistenciasEsperadas: AsistenciaEsperada[];
  historial: TurnoPublicado[];
  repositorio: RepositorioDeTurnos & RepositorioParaProcesarHorarioSemanal;
} {
  const turnos = new Map<string, TurnoPublicado>();
  const historial: TurnoPublicado[] = [];
  const asistenciasEsperadas: AsistenciaEsperada[] = [];

  return {
    asistenciasEsperadas,
    historial,
    repositorio: {
      buscarPublicado: async (dni, fecha) => turnos.get(`${dni}:${fecha}`),
      publicar: async (turno) => {
        turnos.set(`${turno.dni}:${turno.fecha}`, turno);
        historial.push(turno);
        asistenciasEsperadas.push({
          dni: turno.dni,
          fecha: turno.fecha,
          estado: "pendiente",
        });
      },
      publicarEnLote: async (turnosParaPublicar) => {
        for (const turno of turnosParaPublicar) {
          turnos.set(`${turno.dni}:${turno.fecha}`, turno);
          historial.push(turno);
          asistenciasEsperadas.push({ dni: turno.dni, fecha: turno.fecha, estado: "pendiente" });
        }
      },
      perteneceAPeriodoAbierto: async (fecha) => fecha >= "2026-08-26" && fecha <= "2026-09-25",
      obtenerGrupoDelColaborador: async () => "Tiendas",
      listarVigenciasConfirmadas: async () => [{ ingreso: "2026-01-01", cese: null }],
      sedeActivaPerteneceAlGrupo: async (sede, grupo) => sede === "Lima" && grupo === "Tiendas",
      buscarModeloDeHorario: async () => undefined,
      asistenciaEstaProcesada: async () => false,
      reemplazarSemanaPublicada: async () => undefined,
      listarSemanaPublicada: async (_dni, semana) => ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"]
        .filter((fecha) => fecha >= semana).map((fecha) => ({ fecha, descanso: false })),
      asistenciasLaboralesEstanProcesadas: async () => true,
      obtenerEquipoOperativo: async () => "Tiendas",
      registrarProcesamiento: async () => undefined,
    },
  };
}

describe("casos de uso de turnos en el servidor", () => {
  it("permite a Operaciones publicar un turno y crea la asistencia esperada", async () => {
    const { asistenciasEsperadas, historial, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeTurnos(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });

    await casosDeUso.publicar({
      dni: "00001024",
      fecha: "2026-09-01",
      sede: "Lima",
      entradaProgramada: "09:00",
      salidaProgramada: "18:00",
      descanso: false,
    });

    expect(historial).toEqual([
      expect.objectContaining({
        dni: "00001024",
        fecha: "2026-09-01",
        sede: "Lima",
        entradaProgramada: "09:00",
        salidaProgramada: "18:00",
        descanso: false,
      }),
    ]);
    expect(asistenciasEsperadas).toEqual([
      {
        dni: "00001024",
        fecha: "2026-09-01",
        estado: "pendiente",
      },
    ]);
  });

  it("impide publicar más de un turno para un colaborador en la misma fecha", async () => {
    const { asistenciasEsperadas, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeTurnos(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });
    const turno = {
      dni: "00001024",
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
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });

    await expect(
      casosDeUso.publicar({
        dni: "00001024",
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
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administrador" }),
    });

    await casosDeUso.publicar({
      dni: "00001024",
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
        dni: "00001024",
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

  describe("procesar un horario semanal", () => {
    const gerente = (...grupos: Array<[string, boolean]>) => ({
      id: "gerente-1", rol: "gerente_de_area" as const, grupos: grupos.map(([nombre, gestionaAsistencia]) => ({ nombre, gestionaAsistencia })),
    });

    function procesarComo(actor: { id: string; rol: "administrador" | "gerente_de_area" | "recursos_humanos" | "finanzas"; grupos?: Array<{ nombre: string; gestionaAsistencia: boolean }> }) {
      const { repositorio } = crearRepositorioEnMemoria();
      const registrados: unknown[] = [];
      repositorio.registrarProcesamiento = async (procesamiento) => { registrados.push(procesamiento); };
      const casosDeUso = crearCasosDeUsoDeTurnos(repositorio, { obtenerActorActual: async () => actor });
      return { registrados, procesar: () => casosDeUso.procesar("00001024", "2026-08-31") };
    }

    it.each([
      ["el gerente del grupo de la persona", gerente(["Tiendas", true])],
      ["un gerente con varios grupos, uno de ellos el de la persona", gerente(["Taller", true], ["Tiendas", true])],
      ["el Administrador", { id: "admin-1", rol: "administrador" as const }],
    ])("permite a %s", async (_nombre, actor) => {
      const { procesar, registrados } = procesarComo(actor);

      await expect(procesar()).resolves.toBeUndefined();
      expect(registrados).toEqual([expect.objectContaining({ dni: "00001024", semana: "2026-08-31", equipo: "Tiendas", responsableId: actor.id })]);
    });

    it.each([
      ["un gerente de otro grupo", gerente(["Taller", true])],
      ["un gerente sin grupos", gerente()],
      ["un gerente de un grupo que no gestiona asistencia", gerente(["Tiendas", false])],
      ["Finanzas, que no confirma asistencias en nombre de un gerente", { id: "finanzas-1", rol: "finanzas" as const }],
      ["Recursos Humanos", { id: "rrhh-1", rol: "recursos_humanos" as const }],
    ])("rechaza a %s sin registrar el procesamiento", async (_nombre, actor) => {
      const { procesar, registrados } = procesarComo(actor);

      await expect(procesar()).rejects.toThrow(/No tiene permiso para procesar horarios semanales/);
      expect(registrados).toEqual([]);
    });
  });
});
