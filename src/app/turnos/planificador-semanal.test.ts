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

import type { MotivoPlanificadoDeNoAsistencia } from "@/turnos/jornada-planificada";

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

// Acota el HTML a la primera celda-día de la tabla, para no confundir su contenido con el de
// los diálogos (el de edición de celda sí lista nombres de modelo entre sus opciones).
function pastillaDe(html: string): string {
  const inicio = html.indexOf("<td");
  return html.slice(inicio, html.indexOf("</td>", inicio) + "</td>".length);
}

describe("pastillas diarias compactas y accesibles", () => {
  const colaborador = { idHuellero: "HU-1024", nombre: "Ana Pérez", sede: "Tienda Sur" };
  const celdaConModelo = { idHuellero: "HU-1024", fecha: "2026-09-07", sede: "Tienda Sur", modeloHorarioId: "modelo-1", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null };
  const propsBase = {
    equipos: ["tiendas"], planId: "plan-1", semana: "2026-09-07", equipo: "tiendas",
    colaboradores: [colaborador], dias: ["2026-09-07"],
    publicados: [], procesados: [], modelos: [modeloApertura], sedes: ["Tienda Sur"],
  };
  type CeldaDePrueba = { idHuellero: string; fecha: string; sede: string | null; modeloHorarioId: string | null; entradaProgramada: string | null; salidaProgramada: string | null; descanso: boolean; motivoNoAsistencia: MotivoPlanificadoDeNoAsistencia | null };
  function renderConUnaCelda(celda: CeldaDePrueba, procesados: string[] = []) {
    return renderToStaticMarkup(createElement(PlanificadorSemanal, { ...propsBase, celdasIniciales: [celda], procesados }));
  }

  it("la pastilla laboral muestra sede, entrada y salida, y no el nombre del modelo", () => {
    const celdaHtml = pastillaDe(renderConUnaCelda(celdaConModelo));
    expect(celdaHtml).toContain("Tienda Sur");
    expect(celdaHtml).toContain("09:00");
    expect(celdaHtml).toContain("18:00");
    expect(celdaHtml).not.toContain("Apertura");
  });

  it("la pastilla no laboral muestra solo el motivo, sin sede ni horas", () => {
    const celdaDeMotivo = { idHuellero: "HU-1024", fecha: "2026-09-07", sede: null, modeloHorarioId: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "vacaciones" as const };
    const celdaHtml = pastillaDe(renderConUnaCelda(celdaDeMotivo));
    expect(celdaHtml).toContain("Vacaciones");
    expect(celdaHtml).not.toContain("Tienda Sur");
    expect(celdaHtml).not.toContain("09:00");
  });

  it("no repite el nombre del estado dentro de cada pastilla: la leyenda y la fila alcanzan para interpretarlo", () => {
    const dosDias = ["2026-09-07", "2026-09-08"];
    const cuatroDias = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"];

    const htmlDosDias = renderToStaticMarkup(createElement(PlanificadorSemanal, { ...propsBase, dias: dosDias, celdasIniciales: dosDias.map((fecha) => ({ ...celdaConModelo, fecha })) }));
    const htmlCuatroDias = renderToStaticMarkup(createElement(PlanificadorSemanal, { ...propsBase, dias: cuatroDias, celdasIniciales: cuatroDias.map((fecha) => ({ ...celdaConModelo, fecha })) }));

    // La pastilla ya no lleva la clase de la etiqueta de estado (esa clase sigue existiendo en el
    // CSS compartido porque la matriz de Asistencias todavía la usa, pero Horarios no la renderiza).
    expect(htmlDosDias).not.toContain("etiqueta-estado-celda");
    // Si el nombre del estado no se repitiera por pastilla, agregar más días no debería sumar
    // más apariciones VISIBLES del texto del estado (solo vienen de la leyenda, la barra y la
    // fila); el aria-label de cada pastilla sí lo menciona y por eso se excluye del conteo.
    const ocurrenciasVisibles = (html: string) => (html.replace(/aria-label="[^"]*"/g, "").match(/Borrador editable/g) ?? []).length;
    expect(ocurrenciasVisibles(htmlCuatroDias)).toBe(ocurrenciasVisibles(htmlDosDias));
  });

  it("conserva el nombre accesible de estado, fecha, resultado e interacción de cada pastilla", () => {
    const html = renderConUnaCelda(celdaConModelo);
    expect(html).toContain('aria-label="Horario de Ana Pérez para 2026-09-07: Tienda Sur, 09:00 a 18:00. Borrador editable"');
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it("mantiene señales que no dependen solo del color: la marca de edición y el bloqueo de una semana liquidada", () => {
    expect(renderConUnaCelda(celdaConModelo)).toContain('class="marca-edit"');

    const htmlLiquidado = renderConUnaCelda(celdaConModelo, ["HU-1024"]);
    expect(htmlLiquidado).toContain("disabled=\"\"");
    expect(htmlLiquidado).not.toContain('class="marca-edit"');
  });
});

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
