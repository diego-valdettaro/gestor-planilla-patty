import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/app/icono-candado", () => ({ IconoCandado: () => null }));

vi.mock("./actions", () => ({
  guardarBorradorDesdeGrilla: vi.fn(),
  publicarPlanSemanalDesdeGrilla: vi.fn(),
  reemplazarPlanificacionSemanalDesdeGrilla: vi.fn(),
  republicarPlanSemanalDesdeGrilla: vi.fn(),
}));

import { PlanificadorSemanal, valorDe } from "./planificador-semanal";

const jornadaPersonalizada = {
  idHuellero: "HU-1024",
  fecha: "2026-09-07",
  sede: "Tienda Norte",
  modeloHorarioId: null,
  entradaProgramada: "08:00",
  salidaProgramada: "17:00",
  descanso: false,
  motivoNoAsistencia: null,
};

describe("planificador semanal", () => {
  it("presenta la planificación del grupo, las sedes diarias y solo los motivos planificables", () => {
    const html = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      equipos: ["tiendas"],
      planId: "plan-1",
      semana: "2026-09-07",
      equipo: "tiendas",
      colaboradores: [{ idHuellero: "HU-1024", nombre: "Ana Pérez", sede: "Sede fija anterior" }],
      dias: ["2026-09-07", "2026-09-08"],
      celdasIniciales: [jornadaPersonalizada, {
        idHuellero: "HU-1024", fecha: "2026-09-08", sede: null, modeloHorarioId: null,
        entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "vacaciones" as const,
      }],
      publicados: [],
      procesados: [],
      modelos: [{ id: "modelo-1", sede: "Tienda Sur", nombre: "Apertura", entrada: "09:00", salida: "18:00", activo: true }],
      sedes: ["Tienda Norte", "Tienda Sur"],
    }));

    expect(html).toContain("Grupo tiendas");
    expect(html).toContain("Tienda Norte");
    expect(html).toContain("08:00");
    expect(html).toContain("Vacaciones");
    expect(html).toContain("Descanso");
    expect(html).toContain("Feriado");
    expect(html).toContain("Permiso");
    expect(html).toContain("Suspensión");
    expect(html).not.toContain("Falta");
    expect(html).not.toContain("Sede fija anterior");
    expect(html).toContain('aria-labelledby="titulo-dialogo-celda"');
    expect(html).toContain('aria-labelledby="titulo-dialogo-personalizado"');
  });

  it("reconoce un horario sin modelo como personalizado al reabrir la celda", () => {
    expect(valorDe(jornadaPersonalizada)).toBe("personalizado");
  });
});
