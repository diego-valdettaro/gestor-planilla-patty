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

function celdaLaboral(idHuellero: string, fecha: string, sede: string) {
  return { idHuellero, fecha, sede, modeloHorarioId: null, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null };
}

describe("selección de publicación", () => {
  const dias = ["2026-09-07", "2026-09-08"];
  const colaboradores = [
    { idHuellero: "HU-1", nombre: "Ana Pérez", sede: "Tienda Norte" },
    { idHuellero: "HU-2", nombre: "Beto Ruiz", sede: "Tienda Norte" },
  ];

  it("muestra un checkbox marcado por defecto solo en la fila completa, sin publicar y sin liquidar", () => {
    const html = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      equipos: ["tiendas"], planId: "plan-1", semana: "2026-09-07", equipo: "tiendas",
      colaboradores, dias,
      celdasIniciales: [
        celdaLaboral("HU-1", "2026-09-07", "Tienda Norte"), celdaLaboral("HU-1", "2026-09-08", "Tienda Norte"),
        celdaLaboral("HU-2", "2026-09-07", "Tienda Norte"), // a HU-2 le falta el segundo día
      ],
      publicados: [], procesados: [], modelos: [modeloApertura], sedes: ["Tienda Norte"],
    }));

    expect(html.match(/type="checkbox"/g)).toHaveLength(1);
    expect(html).toMatch(/type="checkbox" checked/);
  });

  it("no muestra el checkbox en una fila ya publicada ni en una liquidada, aunque estén completas", () => {
    const html = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      equipos: ["tiendas"], planId: "plan-1", semana: "2026-09-07", equipo: "tiendas",
      colaboradores, dias,
      celdasIniciales: [celdaLaboral("HU-2", "2026-09-07", "Tienda Norte"), celdaLaboral("HU-2", "2026-09-08", "Tienda Norte")],
      publicados: [celdaLaboral("HU-1", "2026-09-07", "Tienda Norte"), celdaLaboral("HU-1", "2026-09-08", "Tienda Norte")],
      procesados: ["HU-2"], modelos: [modeloApertura], sedes: ["Tienda Norte"],
    }));

    expect(html).not.toContain('type="checkbox"');
  });

  it("deshabilita publicar sin ninguna fila elegible y lo habilita apenas hay una", () => {
    const base = {
      equipos: ["tiendas"], planId: "plan-1", semana: "2026-09-07", equipo: "tiendas",
      colaboradores: [colaboradores[0]], dias,
      publicados: [], procesados: [], modelos: [modeloApertura], sedes: ["Tienda Norte"],
    };

    const sinElegibles = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      ...base, celdasIniciales: [celdaLaboral("HU-1", "2026-09-07", "Tienda Norte")], // incompleta
    }));
    expect(sinElegibles).toContain('<button class="boton-principal" disabled="" type="button">Publicar planificación</button>');

    const conUnaElegible = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      ...base, celdasIniciales: [celdaLaboral("HU-1", "2026-09-07", "Tienda Norte"), celdaLaboral("HU-1", "2026-09-08", "Tienda Norte")],
    }));
    expect(conUnaElegible).not.toContain('<button class="boton-principal" disabled="" type="button">Publicar planificación</button>');
  });
});
