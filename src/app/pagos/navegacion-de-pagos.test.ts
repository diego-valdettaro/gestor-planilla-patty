import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NavegacionDePagos } from "./navegacion-de-pagos";

describe("navegación secundaria de Pagos", () => {
  beforeEach(() => vi.stubGlobal("React", React));

  it("ofrece Condiciones laborales, Reglas legales y Fuentes externas, e identifica la sección actual con aria-current y estilo (sin la marca «(sección actual)»)", () => {
    const html = renderToStaticMarkup(React.createElement(NavegacionDePagos, { actual: "reglas-legales" }));

    expect(html).toContain('href="/pagos/condiciones-laborales"');
    expect(html).toContain('href="/pagos/reglas-legales"');
    expect(html).toContain('href="/pagos/fuentes-externas"');
    expect(html).toMatch(/aria-current="page"[^>]*>Reglas legales<\/a>/);
    expect(html).not.toContain("(sección actual)");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).not.toMatch(/Condiciones laborales<small/);
  });
});
