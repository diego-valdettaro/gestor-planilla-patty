import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PlanificadorMensual } from "./planificador-mensual";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("./actions", () => ({
  borrarCeldaDelBorrador: vi.fn(),
  guardarCeldaDelBorrador: vi.fn(),
  guardarPatronSemanalDelMes: vi.fn(),
}));

const nombreDelControl = "Repetir horario semanal";
const props: React.ComponentProps<typeof PlanificadorMensual> = {
  mes: "2026-04",
  equipo: "Tiendas",
  equipos: ["Tiendas"],
  colaboradores: [{ dni: "00000001", nombre: "Ana" }],
  dni: "00000001",
  dias: ["2026-04-01"],
  borradores: [],
  publicados: [],
  vigencias: [{ ingreso: "2020-01-01", cese: null }],
  fechasCerradas: [],
};

describe("patrón de horarios en la vista mensual", () => {
  it("G6 ofrece repetir el patrón solo para la persona seleccionada en modo editable", () => {
    const render = (cambios: Partial<typeof props> = {}) =>
      renderToStaticMarkup(React.createElement(PlanificadorMensual, { ...props, ...cambios }));

    expect(render(), "la vista mensual editable ofrece repetir el horario semanal").toContain(nombreDelControl);
    expect(render({ soloLectura: true })).not.toContain(nombreDelControl);
    expect(render({ dni: undefined })).not.toContain(nombreDelControl);
    expect(render()).toContain('aria-label="Editar horario del 2026-04-01:');
  });
});
