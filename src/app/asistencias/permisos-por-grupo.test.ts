import { beforeEach, describe, expect, it, vi } from "vitest";

// Borde del servidor (acciones de Asistencias) con los casos de uso reales y repositorios en memoria:
// comprueba qué rol y qué grupo pueden importar marcas y procesar la semana de una persona.
const simulacro = vi.hoisted(() => ({
  actor: vi.fn(),
  guardar: vi.fn(),
  registrarProcesamiento: vi.fn(),
  conservarArchivoFuente: vi.fn(),
  descartarArchivoFuente: vi.fn(),
}));

const SEMANA = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"];
const GRUPO_DE = new Map([["00001024", "Tiendas"], ["00002048", "Taller"]]);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/asistencias/servicio", () => ({ repositorioDeAsistencias: {} }));
vi.mock("@/importaciones/almacenamiento-local", () => ({
  conservarArchivoFuente: simulacro.conservarArchivoFuente,
  descartarArchivoFuente: simulacro.descartarArchivoFuente,
}));
vi.mock("@/importaciones/parsear-archivo-huellero", () => ({
  parsearArchivoHuellero: vi.fn(async () => ({
    filas: [
      { fila: 2, dni: "00001024", sede: "Lima", fecha: "2026-09-01", entrada: "09:00", salida: "18:00" },
      { fila: 3, dni: "00002048", sede: "Lima", fecha: "2026-09-01", entrada: "09:00", salida: "18:00" },
    ],
    errores: [],
  })),
}));
vi.mock("@/importaciones/servicio", () => ({
  repositorioDeImportaciones: {
    buscarColaborador: async (dni: string) => GRUPO_DE.has(dni) ? { dni, grupo: GRUPO_DE.get(dni) } : undefined,
    buscarSede: async () => "Lima",
    buscarTurnoPublicado: async (dni: string, fecha: string) => ({ dni, fecha, sede: "Lima", descanso: false, motivoNoAsistencia: null }),
    perteneceAPeriodoAbierto: async () => true,
    buscarAsistenciasExistentes: async () => [],
    guardar: simulacro.guardar,
  },
}));
vi.mock("@/turnos/servicio", () => ({
  repositorioDeTurnos: {
    listarSemanaPublicada: async () => SEMANA.map((fecha) => ({ fecha, descanso: false })),
    asistenciasLaboralesEstanProcesadas: async () => true,
    obtenerEquipoOperativo: async (dni: string) => GRUPO_DE.get(dni),
    registrarProcesamiento: simulacro.registrarProcesamiento,
  },
}));

import { importarAsistencia, procesarHorarioSemanal } from "./actions";

const gerente = (...grupos: Array<[string, boolean]>) => ({
  id: "g1", rol: "gerente_de_area", grupos: grupos.map(([nombre, gestionaAsistencia]) => ({ nombre, gestionaAsistencia })),
});

function formularioDeImportacion(): FormData {
  const datos = new FormData();
  datos.set("archivo", new File(["contenido"], "asistencias.xlsx"));
  return datos;
}

function formularioDeProcesamiento(dni: string): FormData {
  const datos = new FormData();
  datos.set("dni", dni);
  datos.set("semana", "2026-08-31");
  return datos;
}

describe("importar marcas desde Asistencias, por rol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    simulacro.conservarArchivoFuente.mockResolvedValue({ nombre: "asistencias.xlsx", ubicacion: "x", hashSha256: "h" });
    simulacro.descartarArchivoFuente.mockResolvedValue(undefined);
  });

  it.each([
    ["Finanzas", { id: "f1", rol: "finanzas" }],
    ["el Administrador", { id: "a1", rol: "administrador" }],
    ["un gerente con los grupos de todas las filas", gerente(["Tiendas", true], ["Taller", true])],
  ])("%s importa y se guardan las marcas", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);

    await expect(importarAsistencia({}, formularioDeImportacion())).resolves.toMatchObject({ resultado: { jornadas: 2 } });
    expect(simulacro.guardar).toHaveBeenCalledTimes(1);
  });

  it("un gerente no importa filas de personas de otro grupo: no se conserva el archivo ni se guarda nada", async () => {
    simulacro.actor.mockResolvedValue(gerente(["Tiendas", true]));

    const estado = await importarAsistencia({}, formularioDeImportacion());

    expect(estado.errores).toEqual([expect.objectContaining({ fila: 3, dni: "00002048", motivo: "El colaborador no pertenece a un grupo que usted gestiona." })]);
    expect(simulacro.conservarArchivoFuente).not.toHaveBeenCalled();
    expect(simulacro.guardar).not.toHaveBeenCalled();
  });

  it.each([
    ["Recursos Humanos", { id: "r1", rol: "recursos_humanos" }],
    ["un gerente sin grupos", gerente()],
    ["un gerente de un grupo que no gestiona asistencia", gerente(["Tiendas", false])],
  ])("%s no importa", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);

    await expect(importarAsistencia({}, formularioDeImportacion())).resolves.toEqual({ error: "No tiene permiso para importar asistencias." });
    expect(simulacro.conservarArchivoFuente).not.toHaveBeenCalled();
    expect(simulacro.guardar).not.toHaveBeenCalled();
  });
});

describe("procesar la semana de una persona desde Asistencias, por rol", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["el gerente del grupo", gerente(["Tiendas", true])],
    ["el Administrador", { id: "a1", rol: "administrador" }],
  ])("%s procesa la semana", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);

    await procesarHorarioSemanal(formularioDeProcesamiento("00001024"));

    expect(simulacro.registrarProcesamiento).toHaveBeenCalledWith(expect.objectContaining({ dni: "00001024", equipo: "Tiendas" }));
  });

  it.each([
    ["un gerente de otro grupo", gerente(["Taller", true])],
    ["Finanzas, que no confirma en nombre de un gerente", { id: "f1", rol: "finanzas" }],
    ["Recursos Humanos", { id: "r1", rol: "recursos_humanos" }],
    ["un gerente sin grupos", gerente()],
  ])("rechaza a %s", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);

    await expect(procesarHorarioSemanal(formularioDeProcesamiento("00001024"))).rejects.toThrow("No tiene permiso para procesar horarios semanales.");
    expect(simulacro.registrarProcesamiento).not.toHaveBeenCalled();
  });
});
