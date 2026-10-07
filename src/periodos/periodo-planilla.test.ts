import { describe, expect, it, vi } from "vitest";
import {
  aprobacionesVisiblesPara,
  aprobarAsistenciaDelGrupo,
  AprobacionBloqueadaError,
  calcularSugerenciaDePeriodo,
  cerrarPeriodo,
  crearPeriodo,
  decidirHorasExtra,
  HuecoEntrePeriodosError,
  PeriodosSolapadosError,
  reabrirPeriodo,
  type AprobacionDeGrupo,
  type PeriodoPlanilla,
  type RepositorioDePeriodos,
} from "./periodo-planilla";

const actor = (rol: "administrador" | "finanzas" | "gerente_de_area" | "recursos_humanos") => ({ id: "cuenta-1", nombreUsuario: "usuario", rol });
function repositorio(periodos: PeriodoPlanilla[] = []): RepositorioDePeriodos {
  return {
    listar: vi.fn().mockResolvedValue(periodos),
    buscar: vi.fn(),
    listarResumen: vi.fn(),
    crear: vi.fn(),
    decidirHorasExtra: vi.fn(),
    cerrar: vi.fn(),
    reabrir: vi.fn(),
    listarRevisiones: vi.fn(),
    listarAprobaciones: vi.fn(),
    aprobarAsistencia: vi.fn(),
  } as unknown as RepositorioDePeriodos;
}
function periodo(inicio: string, fin: string, estado: "abierto" | "cerrado" = "cerrado"): PeriodoPlanilla {
  return { id: `${inicio}-${fin}`, inicio, fin, estado };
}

describe("cierre y reapertura de períodos de planilla", () => {
  it("permite cerrar a Finanzas", async () => {
    const repo = repositorio();
    await cerrarPeriodo(repo, actor("finanzas"), "periodo-1");
    expect(repo.cerrar).toHaveBeenCalledWith("periodo-1", "cuenta-1", expect.any(Date));
  });

  it("permite cerrar al Administrador del sistema (superusuario temporal)", async () => {
    const repo = repositorio();
    await cerrarPeriodo(repo, actor("administrador"), "periodo-1");
    expect(repo.cerrar).toHaveBeenCalled();
  });

  it("rechaza el cierre de un gerente de área y de Recursos Humanos", async () => {
    await expect(cerrarPeriodo(repositorio(), actor("recursos_humanos"), "periodo-1")).rejects.toThrow("Solo Finanzas");
    await expect(cerrarPeriodo(repositorio(), actor("gerente_de_area"), "periodo-1")).rejects.toThrow("Solo Finanzas");
  });

  it("exige motivo para reabrir y lo entrega al repositorio", async () => {
    const repo = repositorio();
    await expect(reabrirPeriodo(repo, actor("finanzas"), "periodo-1", "  Corrección de auditoría  ")).resolves.toBeUndefined();
    expect(repo.reabrir).toHaveBeenCalledWith("periodo-1", "cuenta-1", "Corrección de auditoría", expect.any(Date));
    await expect(reabrirPeriodo(repo, actor("finanzas"), "periodo-1", " ")).rejects.toThrow("requiere un motivo");
  });

  it("rechaza la reapertura de un gerente de área", async () => {
    await expect(reabrirPeriodo(repositorio(), actor("gerente_de_area"), "periodo-1", "Motivo")).rejects.toThrow("Solo Finanzas");
  });
});

describe("decisión en lote de horas extra", () => {
  it("entrega una selección única al repositorio con la decisión de Finanzas", async () => {
    const repo = repositorio();
    const ahora = new Date("2042-01-11T10:00:00Z");

    await decidirHorasExtra(repo, actor("finanzas"), {
      periodoId: "periodo-1",
      horasExtraIds: ["extra-1", "extra-2", "extra-1"],
      decision: "aprobada",
    }, ahora);

    expect(repo.decidirHorasExtra).toHaveBeenCalledWith(
      "periodo-1",
      ["extra-1", "extra-2"],
      { estado: "aprobada" },
      "cuenta-1",
      ahora,
    );
  });

  it("entrega el descarte con su evidencia y motivo depurados", async () => {
    const repo = repositorio();
    const ahora = new Date("2042-01-11T10:00:00Z");

    await decidirHorasExtra(repo, actor("finanzas"), {
      periodoId: "periodo-1", horasExtraIds: ["extra-1"], decision: "descartada", causa: "marca_erronea", motivo: "  Marca duplicada del huellero  ",
    }, ahora);

    expect(repo.decidirHorasExtra).toHaveBeenCalledWith(
      "periodo-1", ["extra-1"], { estado: "descartada", causa: "marca_erronea", motivo: "Marca duplicada del huellero" }, "cuenta-1", ahora,
    );
  });

  it("rechaza descartar sin motivo, sin evidencia o por falta de autorización previa, y no toca el repositorio", async () => {
    const repo = repositorio();
    const base = { periodoId: "periodo-1", horasExtraIds: ["extra-1"], decision: "descartada" as const };

    await expect(decidirHorasExtra(repo, actor("finanzas"), { ...base, causa: "marca_erronea" })).rejects.toThrow("requiere un motivo");
    await expect(decidirHorasExtra(repo, actor("finanzas"), { ...base, motivo: "Marca duplicada" })).rejects.toThrow("requiere indicar la evidencia");
    await expect(decidirHorasExtra(repo, actor("finanzas"), { ...base, causa: "no_autorizada", motivo: "Sin autorización" })).rejects.toThrow("no justifica");

    expect(repo.decidirHorasExtra).not.toHaveBeenCalled();
  });

  it("rechaza una selección vacía y cualquier rol distinto de Finanzas", async () => {
    const solicitud = { periodoId: "periodo-1", horasExtraIds: ["extra-1"], decision: "descartada" as const, causa: "marca_erronea", motivo: "Marca duplicada" };

    await expect(decidirHorasExtra(repositorio(), actor("gerente_de_area"), solicitud)).rejects.toThrow("Solo Finanzas");
    await expect(decidirHorasExtra(repositorio(), actor("finanzas"), { ...solicitud, horasExtraIds: [] })).rejects.toThrow("seleccionar");
  });
});

describe("sugerencia de fechas para un nuevo período", () => {
  it("sin períodos previos sugiere el día 26 del mes actual y el 25 del mes siguiente", () => {
    const hoy = new Date(2026, 2, 10); // 10 de marzo de 2026
    expect(calcularSugerenciaDePeriodo([], hoy)).toEqual({ inicio: "2026-03-26", fin: "2026-04-25" });
  });

  it("con períodos previos sugiere continuar desde el día siguiente al último fin", () => {
    const previos = [periodo("2026-01-26", "2026-02-25"), periodo("2026-02-26", "2026-03-25")];
    const hoy = new Date(2026, 3, 1);
    expect(calcularSugerenciaDePeriodo(previos, hoy)).toEqual({ inicio: "2026-03-26", fin: "2026-04-25" });
  });

  it("resuelve correctamente el cruce de fin de año", () => {
    const previos = [periodo("2025-11-26", "2025-12-25")];
    expect(calcularSugerenciaDePeriodo(previos, new Date(2025, 11, 30))).toEqual({ inicio: "2025-12-26", fin: "2026-01-25" });
  });

  it("sin períodos previos y con el día 26 ya pasado, sugiere el 26 del mes siguiente", () => {
    const hoy = new Date(2026, 2, 27); // 27 de marzo de 2026, el 26 de marzo ya pasó
    expect(calcularSugerenciaDePeriodo([], hoy)).toEqual({ inicio: "2026-04-26", fin: "2026-05-25" });
  });
});

describe("creación de períodos de planilla", () => {
  it("rechaza la creación a Operaciones", async () => {
    await expect(crearPeriodo(repositorio(), actor("gerente_de_area"), { inicio: "2026-01-26", fin: "2026-02-25" })).rejects.toThrow("No tiene permiso");
  });

  it("exige que el fin no sea anterior al inicio", async () => {
    await expect(crearPeriodo(repositorio(), actor("administrador"), { inicio: "2026-02-25", fin: "2026-01-26" })).rejects.toThrow("posterior");
  });

  it("crea sin advertencia cuando no hay períodos previos", async () => {
    const repo = repositorio([]);
    await crearPeriodo(repo, actor("administrador"), { inicio: "2026-01-26", fin: "2026-02-25" });
    expect(repo.crear).toHaveBeenCalledWith("2026-01-26", "2026-02-25");
  });

  it("crea sin advertencia cuando el período es contiguo a uno existente", async () => {
    const repo = repositorio([periodo("2025-12-26", "2026-01-25")]);
    await crearPeriodo(repo, actor("finanzas"), { inicio: "2026-01-26", fin: "2026-02-25" });
    expect(repo.crear).toHaveBeenCalledWith("2026-01-26", "2026-02-25");
  });

  it("advierte un hueco antes del nuevo período y bloquea sin confirmación", async () => {
    const repo = repositorio([periodo("2025-11-26", "2025-12-25")]);
    await expect(crearPeriodo(repo, actor("administrador"), { inicio: "2026-01-26", fin: "2026-02-25" })).rejects.toThrow(HuecoEntrePeriodosError);
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("advierte un hueco después del nuevo período y bloquea sin confirmación", async () => {
    const repo = repositorio([periodo("2026-03-26", "2026-04-25")]);
    await expect(crearPeriodo(repo, actor("administrador"), { inicio: "2026-01-26", fin: "2026-02-25" })).rejects.toThrow(HuecoEntrePeriodosError);
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("permite continuar con el hueco cuando se confirma explícitamente", async () => {
    const repo = repositorio([periodo("2025-11-26", "2025-12-25")]);
    await crearPeriodo(repo, actor("administrador"), { inicio: "2026-01-26", fin: "2026-02-25", confirmarHueco: true });
    expect(repo.crear).toHaveBeenCalledWith("2026-01-26", "2026-02-25");
  });

  it("propaga el rechazo por solapamiento del repositorio", async () => {
    const repo = repositorio([periodo("2026-01-26", "2026-02-25")]);
    repo.crear = vi.fn().mockRejectedValue(new PeriodosSolapadosError());
    await expect(crearPeriodo(repo, actor("finanzas"), { inicio: "2026-02-01", fin: "2026-02-28" })).rejects.toThrow(PeriodosSolapadosError);
  });

  it("rechaza por solapamiento antes que por hueco, aunque exista un período lejano en el futuro", async () => {
    const repo = repositorio([periodo("2026-01-26", "2026-02-25"), periodo("2030-01-01", "2030-01-31")]);
    await expect(crearPeriodo(repo, actor("finanzas"), { inicio: "2026-01-26", fin: "2026-02-25" })).rejects.toThrow(PeriodosSolapadosError);
    expect(repo.crear).not.toHaveBeenCalled();
  });
});

describe("aprobación de la asistencia de un grupo", () => {
  const gerenteDeTiendas = { id: "gerente-1", rol: "gerente_de_area" as const, grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] };
  const solicitud = { periodoId: "periodo-1", grupo: "Tiendas" };

  it("permite al gerente del grupo aprobar y registra quién y cuándo", async () => {
    const repo = repositorio();
    const ahora = new Date("2026-09-20T10:00:00Z");

    await aprobarAsistenciaDelGrupo(repo, gerenteDeTiendas, solicitud, ahora);

    expect(repo.aprobarAsistencia).toHaveBeenCalledWith("periodo-1", "Tiendas", "gerente-1", ahora);
  });

  it("permite al Administrador del sistema, superusuario temporal, aprobar cualquier grupo", async () => {
    const repo = repositorio();
    await aprobarAsistenciaDelGrupo(repo, actor("administrador"), solicitud);
    expect(repo.aprobarAsistencia).toHaveBeenCalled();
  });

  it("Finanzas no aprueba en nombre del gerente", async () => {
    const repo = repositorio();
    await expect(aprobarAsistenciaDelGrupo(repo, actor("finanzas"), solicitud)).rejects.toThrow("Finanzas no aprueba la asistencia en nombre del gerente");
    expect(repo.aprobarAsistencia).not.toHaveBeenCalled();
  });

  it.each([
    ["Recursos Humanos", actor("recursos_humanos")],
    ["un gerente de otro grupo", { id: "g2", rol: "gerente_de_area" as const, grupos: [{ nombre: "Taller", gestionaAsistencia: true }] }],
    ["un gerente cuyo grupo no gestiona asistencia", { id: "g3", rol: "gerente_de_area" as const, grupos: [{ nombre: "Tiendas", gestionaAsistencia: false }] }],
  ])("rechaza a %s sin tocar el repositorio", async (_nombre, quien) => {
    const repo = repositorio();
    await expect(aprobarAsistenciaDelGrupo(repo, quien, solicitud)).rejects.toThrow("No tiene permiso para aprobar la asistencia de este grupo");
    expect(repo.aprobarAsistencia).not.toHaveBeenCalled();
  });

  it("el error de bloqueo cuenta personas distintas y conserva la lista para la interfaz", () => {
    const bloqueos = [
      { dni: "1", nombre: "Ana", causa: "sin_horario" as const, fechas: ["2026-09-26"] },
      { dni: "1", nombre: "Ana", causa: "asistencia_pendiente" as const, fechas: ["2026-09-27"] },
      { dni: "2", nombre: "Beto", causa: "sin_horario" as const, fechas: ["2026-09-26"] },
    ];
    const error = new AprobacionBloqueadaError(bloqueos);
    expect(error.message).toContain("2 personas tienen");
    expect(error.bloqueos).toBe(bloqueos);
    expect(new AprobacionBloqueadaError(bloqueos.slice(0, 1)).message).toContain("1 persona tiene");
  });

  it("cada gerente ve solo sus grupos; Finanzas y el Administrador ven todos", () => {
    const aprobacion = (grupo: string): AprobacionDeGrupo => ({ grupo, gerente: null, estado: "pendiente", aprobadaPor: null, aprobadaEn: null, invalidadaEn: null, motivoDeInvalidacion: null, bloqueos: [] });
    const todas = [aprobacion("Taller"), aprobacion("Tiendas")];
    expect(aprobacionesVisiblesPara(gerenteDeTiendas, todas).map(({ grupo }) => grupo)).toEqual(["Tiendas"]);
    expect(aprobacionesVisiblesPara(actor("finanzas"), todas)).toHaveLength(2);
    expect(aprobacionesVisiblesPara(actor("administrador"), todas)).toHaveLength(2);
    expect(aprobacionesVisiblesPara(actor("recursos_humanos"), todas)).toEqual([]);
  });
});
