import React, { createElement, isValidElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mensual = vi.hoisted(() => ({ guardar: vi.fn(), borrar: vi.fn(), refresh: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mensual.push, refresh: mensual.refresh }),
}));

vi.mock("@/app/icono-candado", () => ({ IconoCandado: () => null }));

vi.mock("./actions", () => ({
  guardarBorradorDesdeGrilla: vi.fn(),
  guardarCeldaDelBorrador: mensual.guardar,
  borrarCeldaDelBorrador: mensual.borrar,
  publicarPlanSemanalDesdeGrilla: vi.fn(),
  republicarPlanSemanalDesdeGrilla: vi.fn(),
}));

import { PlanificadorMensual } from "./planificador-mensual";
import type { MotivoPlanificadoDeNoAsistencia } from "@/turnos/jornada-planificada";

import { PlanificadorSemanal as PlanificadorSemanalBase, celdasDeSemanaCompleta, valorDe } from "./planificador-semanal";

// Salvo que una prueba indique otra cosa, todos los colaboradores tienen una relación laboral confirmada y vigente.
const RELACION_VIGENTE = [{ ingreso: "2026-01-01", cese: null }];
function PlanificadorSemanal(props: ComponentProps<typeof PlanificadorSemanalBase>) {
  const vigencias = props.vigencias ?? Object.fromEntries(props.colaboradores.map(({ dni }) => [dni, RELACION_VIGENTE]));
  return createElement(PlanificadorSemanalBase, { ...props, vigencias });
}

const jornadaPersonalizada = {
  dni: "00001024",
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
      colaboradores: [{ dni: "00001024", nombre: "Ana Pérez", sede: "Sede fija anterior" }],
      dias: ["2026-09-07", "2026-09-08"],
      celdasIniciales: [jornadaPersonalizada, {
        dni: "00001024", fecha: "2026-09-08", sede: null, modeloHorarioId: null,
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
    expect(html).toMatch(/id="titulo-dialogo-celda">Horario semanal de/);
    expect(html).not.toContain("Turno de");
    expect(html).toContain('aria-labelledby="titulo-dialogo-personalizado"');
    expect(html).toContain('aria-labelledby="titulo-dialogo-completar-semana"');
    // La opción del menú «Acciones» de la fila, más el título y el botón de confirmar del modal.
    expect(html.match(/Completar semana/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Acciones de Ana Pérez"');
    expect(html).toContain('aria-haspopup="menu"');
    // Un solo botón de acciones por persona: «Completar semana» ya no es un botón suelto de la fila.
    expect(html).not.toContain('class="boton-secundario" type="button">Completar semana</button>');
  });

  it("no ofrece completar semana para un colaborador con la semana liquidada", () => {
    const html = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      equipos: ["tiendas"],
      planId: "plan-1",
      semana: "2026-09-07",
      equipo: "tiendas",
      colaboradores: [{ dni: "00001024", nombre: "Ana Pérez", sede: "Tienda Norte" }],
      dias: ["2026-09-07", "2026-09-08"],
      celdasIniciales: [],
      publicados: [],
      procesados: ["00001024"],
      modelos: [modeloApertura],
      sedes: ["Tienda Norte", "Tienda Sur"],
    }));

    // La semana liquidada no admite cambios: las dos opciones del menú siguen visibles, desactivadas y con su motivo.
    expect(html.match(/La semana está liquidada y ya no admite cambios\./g)).toHaveLength(2);
    expect(html).toContain('<button aria-disabled="true" class="menu-item" role="menuitem" tabindex="-1" type="button">Completar semana<small>');
    expect(html).toContain('<button aria-disabled="true" class="menu-item" role="menuitem" tabindex="-1" type="button">Republicar cambios<small>');
  });

  it("reconoce un horario sin modelo como personalizado al reabrir la celda", () => {
    expect(valorDe(jornadaPersonalizada)).toBe("personalizado");
  });

  it("completa la semana con el modelo por defecto en los días laborales y el motivo elegido en el resto", () => {
    const dias = ["2026-09-07", "2026-09-08", "2026-09-09"];
    const celdas = celdasDeSemanaCompleta("00001024", dias, {
      "2026-09-07": "laboral",
      "2026-09-08": "vacaciones",
      "2026-09-09": "laboral",
    }, modeloApertura);

    expect(celdas).toEqual([
      { dni: "00001024", fecha: "2026-09-07", sede: "Tienda Sur", modeloHorarioId: "modelo-1", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null },
      { dni: "00001024", fecha: "2026-09-08", sede: null, modeloHorarioId: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "vacaciones" },
      { dni: "00001024", fecha: "2026-09-09", sede: "Tienda Sur", modeloHorarioId: "modelo-1", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null },
    ]);
  });

  it("exige un modelo por defecto cuando algún día queda laboral", () => {
    expect(() => celdasDeSemanaCompleta("00001024", ["2026-09-07"], { "2026-09-07": "laboral" }, undefined))
      .toThrow("Seleccione un modelo de horario por defecto.");
  });

  it("no exige modelo por defecto cuando todos los días tienen un motivo de no asistencia", () => {
    const celdas = celdasDeSemanaCompleta("00001024", ["2026-09-07"], { "2026-09-07": "descanso" }, undefined);
    expect(celdas).toEqual([
      { dni: "00001024", fecha: "2026-09-07", sede: null, modeloHorarioId: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "descanso" },
    ]);
  });
});

function celdaLaboral(dni: string, fecha: string, sede: string) {
  return { dni, fecha, sede, modeloHorarioId: null, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null };
}

// Acota el HTML a la primera celda-día de la tabla, para no confundir su contenido con el de
// los diálogos (el de edición de celda sí lista nombres de modelo entre sus opciones).
function pastillaDe(html: string): string {
  const inicio = html.indexOf("<td");
  return html.slice(inicio, html.indexOf("</td>", inicio) + "</td>".length);
}

describe("pastillas diarias compactas y accesibles", () => {
  const colaborador = { dni: "00001024", nombre: "Ana Pérez", sede: "Tienda Sur" };
  const celdaConModelo = { dni: "00001024", fecha: "2026-09-07", sede: "Tienda Sur", modeloHorarioId: "modelo-1", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null };
  const propsBase = {
    equipos: ["tiendas"], planId: "plan-1", semana: "2026-09-07", equipo: "tiendas",
    colaboradores: [colaborador], dias: ["2026-09-07"],
    publicados: [], procesados: [], modelos: [modeloApertura], sedes: ["Tienda Sur"],
  };
  type CeldaDePrueba = { dni: string; fecha: string; sede: string | null; modeloHorarioId: string | null; entradaProgramada: string | null; salidaProgramada: string | null; descanso: boolean; motivoNoAsistencia: MotivoPlanificadoDeNoAsistencia | null };
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
    const celdaDeMotivo = { dni: "00001024", fecha: "2026-09-07", sede: null, modeloHorarioId: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "vacaciones" as const };
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

    const htmlLiquidado = renderConUnaCelda(celdaConModelo, ["00001024"]);
    expect(htmlLiquidado).toContain("disabled=\"\"");
    expect(htmlLiquidado).not.toContain('class="marca-edit"');
  });
});

describe("selección de publicación", () => {
  const dias = ["2026-09-07", "2026-09-08"];
  const colaboradores = [
    { dni: "00000011", nombre: "Ana Pérez", sede: "Tienda Norte" },
    { dni: "00000012", nombre: "Beto Ruiz", sede: "Tienda Norte" },
  ];

  it("muestra un checkbox marcado por defecto solo en la fila completa, sin publicar y sin liquidar", () => {
    const html = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      equipos: ["tiendas"], planId: "plan-1", semana: "2026-09-07", equipo: "tiendas",
      colaboradores, dias,
      celdasIniciales: [
        celdaLaboral("00000011", "2026-09-07", "Tienda Norte"), celdaLaboral("00000011", "2026-09-08", "Tienda Norte"),
        celdaLaboral("00000012", "2026-09-07", "Tienda Norte"), // a 00000012 le falta el segundo día
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
      celdasIniciales: [celdaLaboral("00000012", "2026-09-07", "Tienda Norte"), celdaLaboral("00000012", "2026-09-08", "Tienda Norte")],
      publicados: [celdaLaboral("00000011", "2026-09-07", "Tienda Norte"), celdaLaboral("00000011", "2026-09-08", "Tienda Norte")],
      procesados: ["00000012"], modelos: [modeloApertura], sedes: ["Tienda Norte"],
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
      ...base, celdasIniciales: [celdaLaboral("00000011", "2026-09-07", "Tienda Norte")], // incompleta
    }));
    expect(sinElegibles).toContain('<button aria-describedby="motivo-acciones-plan" class="boton-principal" disabled="" type="button">Publicar planificación</button>');
    expect(sinElegibles).toContain('id="motivo-acciones-plan"');
    expect(sinElegibles).toContain("Publicar planificación está deshabilitado porque no hay colaboradores marcados para publicar.");

    const conUnaElegible = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      ...base, celdasIniciales: [celdaLaboral("00000011", "2026-09-07", "Tienda Norte"), celdaLaboral("00000011", "2026-09-08", "Tienda Norte")],
    }));
    expect(conUnaElegible).not.toContain('<button aria-describedby="motivo-acciones-plan" class="boton-principal" disabled="" type="button">Publicar planificación</button>');
    expect(conUnaElegible).not.toContain("Publicar planificación está deshabilitado");
  });

  // G7: las fechas sin período no se muestran al gerente (decisión de Diego 2026-11-21) y tampoco bloquean publicar.
  it("G7 · no muestra ningún aviso por fechas sin período y deja publicar", () => {
    const html = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      equipos: ["tiendas"], planId: "plan-1", semana: "2026-09-07", equipo: "tiendas",
      colaboradores: [colaboradores[0]], dias,
      celdasIniciales: [celdaLaboral("00000011", "2026-09-07", "Tienda Norte"), celdaLaboral("00000011", "2026-09-08", "Tienda Norte")],
      publicados: [], procesados: [], modelos: [modeloApertura], sedes: ["Tienda Norte"],
    }));

    expect(html).not.toContain("período de asistencia");
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('class="boton-principal" disabled=""');
  });

  it("explica que Guardar borrador está deshabilitado cuando no hay cambios", () => {
    const html = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      equipos: ["tiendas"], planId: "plan-1", semana: "2026-09-07", equipo: "tiendas",
      colaboradores: [colaboradores[0]], dias, celdasIniciales: [], publicados: [], procesados: [], modelos: [modeloApertura], sedes: ["Tienda Norte"],
    }));

    expect(html).toContain("Guardar borrador está deshabilitado porque no hay cambios sin guardar.");
  });

  it("muestra acciones secundarias en Completar semana y Republicar cambios", () => {
    const html = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      equipos: ["tiendas"], planId: "plan-1", semana: "2026-09-07", equipo: "tiendas",
      colaboradores: [colaboradores[0]], dias, celdasIniciales: [], publicados: [], procesados: [], modelos: [modeloApertura], sedes: ["Tienda Norte"],
    }));

    // Con la semana sin publicar, «Completar semana» está activa y «Republicar cambios» desactivada con su motivo.
    expect(html).toContain('<button class="menu-item" role="menuitem" tabindex="-1" type="button">Completar semana</button>');
    expect(html).toContain('<button aria-disabled="true" class="menu-item" role="menuitem" tabindex="-1" type="button">Republicar cambios<small>La semana todavía no se publicó. Use «Publicar planificación».</small></button>');
  });

  it("en solo lectura conserva la consulta y omite todo control de edición y publicación", () => {
    const html = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      equipos: ["tiendas"], planId: "plan-1", semana: "2026-09-07", equipo: "tiendas",
      colaboradores, dias,
      celdasIniciales: [celdaLaboral("00000011", "2026-09-07", "Tienda Norte"), celdaLaboral("00000011", "2026-09-08", "Tienda Norte")],
      publicados: [], procesados: [], modelos: [modeloApertura], sedes: ["Tienda Norte"], soloLectura: true,
    }));

    expect(html).toContain("<span>Grupo operativo</span>");
    expect(html).toContain('aria-label="Grupo operativo"');
    expect(html).toContain("Selector semanal");
    expect(html).toContain("Tienda Norte");
    for (const control of ["Guardar borrador", "Publicar planificación", "Completar semana", "Republicar cambios", "Borrador guardado", "Sin guardar"]) expect(html).not.toContain(control);
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain('aria-haspopup="dialog" aria-label="Horario');
    expect(html).not.toContain("marca-edit");
    expect(html).toContain("Sin asignar");
    expect(html).not.toContain("＋ Asignar");
  });
});

describe("relación laboral confirmada en el planificador", () => {
  const dias = ["2026-09-07", "2026-09-08", "2026-09-09"];
  const colaboradores = [{ dni: "00000011", nombre: "Ana Pérez", sede: "Tienda Norte" }, { dni: "00000012", nombre: "Beto Ruiz", sede: "Tienda Norte" }];
  const laboral = (dni: string, fecha: string) => ({ dni, fecha, sede: "Tienda Norte", modeloHorarioId: null, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null });
  const base = { equipos: ["tiendas"], planId: "plan-1", semana: "2026-09-07", equipo: "tiendas", colaboradores, dias, publicados: [], procesados: [], modelos: [modeloApertura], sedes: ["Tienda Norte"] };

  it("muestra «Sin relación laboral» y bloquea la celda antes del ingreso sin exigir que el gerente la complete", () => {
    const html = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      ...base,
      vigencias: { "00000011": [{ ingreso: "2026-09-09", cese: null }], "00000012": [{ ingreso: "2026-01-01", cese: null }] },
      celdasIniciales: [laboral("00000011", "2026-09-09"), ...dias.map((fecha) => laboral("00000012", fecha))],
    }));

    expect(html.match(/<b>Sin relación laboral<\/b>/g)).toHaveLength(2);
    expect(html).toContain("Fuera de la relación laboral confirmada por Recursos Humanos; no se puede editar.");
    // Ana tiene la fila completa (2 días automáticos + 1 laboral) y se puede publicar: aparece su casilla.
    expect(html).toContain("Publicar</label>");
    expect(html.match(/checkbox-publicar-fila/g)).toHaveLength(2);
    expect(html).toContain("6 de 6 días asignados");
  });

  it("una semana sin ningún día dentro de la relación no se puede publicar y la interfaz explica la causa y el siguiente paso", () => {
    const html = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      ...base,
      colaboradores: [colaboradores[0]],
      vigencias: { "00000011": [] },
      celdasIniciales: [],
    }));

    // El motivo no es texto de la fila: es un icono enfocable cuyo tooltip dice la causa y el siguiente paso.
    expect(html).toContain('aria-label="No se puede publicar a Ana Pérez: ver causa y siguiente paso"');
    expect(html).toContain('<strong class="tip-titulo">No se puede publicar</strong><span class="tip-fila"><b>Causa:</b> no tiene una relación laboral confirmada en esta semana.</span><span class="tip-fila"><b>Siguiente paso:</b> Recursos Humanos debe registrar y confirmar su ingreso.</span>');
    expect(html).not.toContain("aviso-sin-relacion");
    expect(html).not.toContain("checkbox-publicar-fila");
    expect(html).toContain('class="boton-principal" disabled=""');
    expect(html).toContain("Recursos Humanos debe confirmar la relación laboral de quienes no la tienen en esta semana.");
  });

  it("ignora un «Sin relación laboral» guardado en un día que ya está dentro de la relación", () => {
    const html = renderToStaticMarkup(createElement(PlanificadorSemanal, {
      ...base,
      colaboradores: [colaboradores[0]],
      vigencias: { "00000011": [{ ingreso: "2026-01-01", cese: null }] },
      celdasIniciales: [{ dni: "00000011", fecha: "2026-09-07", sede: null, modeloHorarioId: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "sin_relacion_laboral" as const }],
    }));

    expect(html).not.toContain("<b>Sin relación laboral</b>");
    expect(html).toContain("＋ Asignar");
  });

  it("no ofrece «Sin relación laboral» como opción que el gerente pueda elegir", () => {
    const html = renderToStaticMarkup(createElement(PlanificadorSemanal, { ...base, vigencias: { "00000011": [{ ingreso: "2026-01-01", cese: null }], "00000012": [{ ingreso: "2026-01-01", cese: null }] }, celdasIniciales: [] }));

    expect(html).not.toContain('value="motivo:sin_relacion_laboral"');
    expect(html).not.toContain('<option value="sin_relacion_laboral">Sin relación laboral</option><option');
  });
});

describe("calendario mensual de horarios", () => {
  it("muestra el estado del día según borrador, publicación, cierre y vigencia", async () => {
    const { PlanificadorMensual } = await import("./planificador-mensual");
    const jornada = (fecha: string, entradaProgramada = "09:00") => ({ dni: "00001024", fecha, sede: "Norte", modeloHorarioId: null, entradaProgramada, salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null });
    const html = renderToStaticMarkup(createElement(PlanificadorMensual, {
      mes: "2026-09", equipo: "Tiendas", equipos: ["Tiendas"], colaboradores: [{ dni: "00001024", nombre: "Ana" }], dni: "00001024",
      dias: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08"],
      borradores: [jornada("2026-09-02"), jornada("2026-09-04", "10:00"), jornada("2026-09-05", "10:00"), jornada("2026-09-06")],
      publicados: [jornada("2026-09-03"), jornada("2026-09-04"), jornada("2026-09-05"), jornada("2026-09-07")],
      vigencias: [{ ingreso: "2026-09-02", cese: null }], fechasCerradas: ["2026-09-05", "2026-09-06", "2026-09-08"], semanasProcesadas: ["2026-09-07"],
    }));
    const casos = [
      ["2026-09-01", "Sin relación laboral"], ["2026-09-02", "Borrador editable"],
      ["2026-09-03", "Publicado"], ["2026-09-04", "Cambios sin publicar"], ["2026-09-07", "Liquidado"],
    ];
    for (const [fecha, estado] of casos) expect(html).toContain(`Horario del ${fecha}: ${estado}. Abrir semana`);
    expect(html).toContain("Horario del 2026-09-05: Publicado. Período cerrado; requiere reapertura. Abrir semana");
    expect(html).toContain("Horario del 2026-09-06: Sin publicar. Período cerrado; requiere reapertura. Abrir semana");
    expect(html).toContain("Horario del 2026-09-08: Liquidado. Período cerrado; requiere reapertura. Abrir semana");
    const cerrado = html.match(/<a aria-label="Horario del 2026-09-05:[\s\S]*?<\/a>/)?.[0] ?? "";
    expect(cerrado).toContain("09:00");
    expect(cerrado).not.toContain("10:00");
  });
});

const mesEditable = {
  mes: "2026-09", equipo: "Tiendas", equipos: ["Tiendas"], dni: "00001024",
  colaboradores: [{ dni: "00001024", nombre: "Ana Pérez" }],
  dias: ["2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-14"],
  borradores: [], publicados: [jornadaPersonalizada],
  vigencias: [{ ingreso: "2026-09-07", cese: null }],
  fechasCerradas: ["2026-09-09"], semanasProcesadas: ["2026-09-14"],
  sedes: ["Tienda Norte", "Tienda Sur"], modelos: [modeloApertura],
};

type PropsDeControl = {
  children?: ReactNode;
  "aria-label"?: string;
  onClick?: (evento?: { currentTarget: Pick<HTMLButtonElement, "focus"> }) => void;
  action?: (datos: FormData) => Promise<void>;
};

function buscarControl(arbol: ReactNode, predicado: (props: PropsDeControl) => boolean): PropsDeControl | undefined {
  if (Array.isArray(arbol)) {
    for (const hijo of arbol) {
      const encontrado = buscarControl(hijo, predicado);
      if (encontrado) return encontrado;
    }
  }
  if (isValidElement<PropsDeControl>(arbol)) {
    return predicado(arbol.props) ? arbol.props : buscarControl(arbol.props.children, predicado);
  }
}

function calendarioInteractivo(fecha?: string, horario = "personalizado", props: ComponentProps<typeof PlanificadorMensual> = mesEditable) {
  const seleccionar = vi.fn();
  const fechaMock = vi.spyOn(React, "useState").mockImplementationOnce(() => [fecha ? { fecha, horario } : null, seleccionar]);
  const referencia = { current: null as HTMLButtonElement | null };
  const ref = vi.spyOn(React, "useRef").mockReturnValueOnce(referencia);
  const effect = vi.spyOn(React, "useEffect").mockImplementationOnce(efecto => { efecto(); });
  const arbol = PlanificadorMensual(props);
  fechaMock.mockRestore();
  ref.mockRestore();
  effect.mockRestore();
  return { arbol, seleccionar, referencia };
}

describe("edición de un día en el calendario mensual", () => {
  it("editor mensual editable muestra la persona, el día, la jornada y las opciones semanales", () => {
    const cerrado = calendarioInteractivo();
    const boton = buscarControl(cerrado.arbol, props => props["aria-label"]?.includes("Editar horario del 2026-09-07") ?? false);
    expect(boton, "acción de edición mensual").toBeDefined();
    boton?.onClick?.({ currentTarget: { focus: vi.fn() } });
    expect(cerrado.seleccionar).toHaveBeenCalledWith({ fecha: "2026-09-07", horario: "personalizado" });

    const abierto = calendarioInteractivo("2026-09-07");
    const html = renderToStaticMarkup(abierto.arbol);
    expect(html).toContain("Editar horario de Ana Pérez");
    expect(html).toContain("2026-09-07");
    expect(html).toContain('value="08:00"');
    expect(html).toContain("Apertura");
    expect(html).toContain("Vacaciones");
  });

  it("restricciones del editor mensual dejan habilitada la edición solo para días editables", () => {
    const html = renderToStaticMarkup(createElement(PlanificadorMensual, mesEditable));
    expect(html, "acción de edición mensual").toContain("Editar horario del 2026-09-07");
    for (const dia of ["06", "09", "14"]) expect(html).not.toContain(`Editar horario del 2026-09-${dia}`);
    const lectura = renderToStaticMarkup(createElement(PlanificadorMensual, { ...mesEditable, soloLectura: true }));
    expect(lectura).not.toContain("Editar horario del");
    expect(lectura).toContain("Abrir semana");
  });

  it("cancelar edición mensual cierra el editor sin guardar", () => {
    mensual.guardar.mockClear();
    const { arbol, seleccionar } = calendarioInteractivo("2026-09-07", "descanso");
    const cancelar = buscarControl(arbol, props => props.children === "Cancelar");
    expect(cancelar, "formulario de edición mensual").toBeDefined();
    cancelar?.onClick?.();
    expect(seleccionar).toHaveBeenCalledWith(null);
    expect(mensual.guardar).not.toHaveBeenCalled();
  });

  it("permite quitar la asignación vigente solo en un borrador sin publicación", async () => {
    mensual.borrar.mockReset().mockResolvedValue(undefined);
    const borrador = { ...mesEditable, borradores: [jornadaPersonalizada], publicados: [] };
    expect(renderToStaticMarkup(calendarioInteractivo("2026-09-07", "personalizado").arbol)).not.toContain("Quitar asignación");
    const { arbol } = calendarioInteractivo("2026-09-07", "quitar", borrador);
    expect(renderToStaticMarkup(arbol)).toContain("Quitar asignación");
    const form = buscarControl(arbol, props => typeof props.action === "function");
    const datos = new FormData();
    datos.set("horario", "quitar");

    await form?.action?.(datos);

    expect(mensual.borrar).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(mensual.borrar.mock.lastCall?.[0] ?? [])).toMatchObject({
      equipo: "Tiendas", fecha: "2026-09-07", dni: "00001024",
    });
  });

  it("refrescar edición mensual guarda la selección puntual y conserva el contexto", async () => {
    mensual.push.mockClear();
    mensual.refresh.mockClear();
    mensual.guardar.mockReset().mockResolvedValue(undefined);
    const { arbol, seleccionar } = calendarioInteractivo("2026-09-07", "descanso");
    const form = buscarControl(arbol, props => typeof props.action === "function");
    expect(form, "formulario de edición mensual").toBeDefined();
    const datos = new FormData();
    datos.set("horario", "descanso");

    await form?.action?.(datos);

    expect(Object.fromEntries(mensual.guardar.mock.lastCall?.[0] ?? [])).toEqual({
      equipo: "Tiendas", fecha: "2026-09-07", dni: "00001024", horario: "descanso",
    });
    expect(mensual.guardar).toHaveBeenCalledTimes(1);
    expect(seleccionar).toHaveBeenCalledWith(null);
    expect(mensual.refresh).toHaveBeenCalledTimes(1);
    expect(mensual.push).not.toHaveBeenCalled();
    const actualizado = renderToStaticMarkup(createElement(PlanificadorMensual, {
      ...mesEditable, borradores: [{ ...jornadaPersonalizada, sede: null, entradaProgramada: null, salidaProgramada: null, descanso: true }],
    }));
    expect(actualizado).toContain("Editar horario del 2026-09-07: Cambios sin publicar");
    expect(actualizado).toContain("/turnos?semana=2026-09-07");
  });
});
