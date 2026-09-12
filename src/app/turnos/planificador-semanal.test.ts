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

import { PlanificadorSemanal, celdasDeSemanaCompleta, valorDe } from "./planificador-semanal";

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

const modeloApertura = { id: "modelo-1", sede: "Tienda Sur", nombre: "Apertura", entrada: "09:00", salida: "18:00", activo: true };

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
      modelos: [modeloApertura],
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
    expect(html).toContain('aria-labelledby="titulo-dialogo-completar-semana"');
    // El botón de la fila, más el título y el botón de confirmar del modal.
    expect(html.match(/Completar semana/g)).toHaveLength(3);
  });

  it("no ofrece completar semana para un colaborador con la semana liquidada", () => {
    const html = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      equipos: ["tiendas"],
      planId: "plan-1",
      semana: "2026-09-07",
      equipo: "tiendas",
      colaboradores: [{ idHuellero: "HU-1024", nombre: "Ana Pérez", sede: "Tienda Norte" }],
      dias: ["2026-09-07", "2026-09-08"],
      celdasIniciales: [],
      publicados: [],
      procesados: ["HU-1024"],
      modelos: [modeloApertura],
      sedes: ["Tienda Norte", "Tienda Sur"],
    }));

    // Sin el botón de la fila; el modal sigue en el DOM (oculto) con su título y botón de confirmar.
    expect(html.match(/Completar semana/g)).toHaveLength(2);
  });

  it("reconoce un horario sin modelo como personalizado al reabrir la celda", () => {
    expect(valorDe(jornadaPersonalizada)).toBe("personalizado");
  });

  it("completa la semana con el modelo por defecto en los días laborales y el motivo elegido en el resto", () => {
    const dias = ["2026-09-07", "2026-09-08", "2026-09-09"];
    const celdas = celdasDeSemanaCompleta("HU-1024", dias, {
      "2026-09-07": "laboral",
      "2026-09-08": "vacaciones",
      "2026-09-09": "laboral",
    }, modeloApertura);

    expect(celdas).toEqual([
      { idHuellero: "HU-1024", fecha: "2026-09-07", sede: "Tienda Sur", modeloHorarioId: "modelo-1", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null },
      { idHuellero: "HU-1024", fecha: "2026-09-08", sede: null, modeloHorarioId: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "vacaciones" },
      { idHuellero: "HU-1024", fecha: "2026-09-09", sede: "Tienda Sur", modeloHorarioId: "modelo-1", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null },
    ]);
  });

  it("exige un modelo por defecto cuando algún día queda laboral", () => {
    expect(() => celdasDeSemanaCompleta("HU-1024", ["2026-09-07"], { "2026-09-07": "laboral" }, undefined))
      .toThrow("Seleccione un modelo de horario por defecto.");
  });

  it("no exige modelo por defecto cuando todos los días tienen un motivo de no asistencia", () => {
    const celdas = celdasDeSemanaCompleta("HU-1024", ["2026-09-07"], { "2026-09-07": "descanso" }, undefined);
    expect(celdas).toEqual([
      { idHuellero: "HU-1024", fecha: "2026-09-07", sede: null, modeloHorarioId: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "descanso" },
    ]);
  });
});
