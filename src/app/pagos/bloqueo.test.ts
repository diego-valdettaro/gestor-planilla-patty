import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BloqueoDePagos } from "./bloqueo";

// Bloqueos de la conciliación por cese (#128). Textos y siguiente paso: docs/diseno-interaccion-pagos.md 5.1/5.2; mensajes: ejemplos-sinteticos.md C-E1 y C-E5.
const FUENTE = 'href="/pagos/fuentes-externas/conciliacion_de_liquidacion_por_cese?mes=2026-10"';
const CESE = "El cese de Ana no tiene su liquidación conciliada.";
const DUPLICACION = "Duplicación: vacaciones truncas ya incluidas en el pago mensual.";

const render = (mensaje: string, relacionId?: string) => renderToStaticMarkup(React.createElement(BloqueoDePagos, { mensaje, mes: "2026-10", relacionId }));

describe("bloqueos de la conciliación por cese", () => {
  beforeEach(() => vi.stubGlobal("React", React));

  it("PA-04 el cese sin conciliar enlaza a la fuente de conciliación, en el mes y en la persona", () => {
    const delMes = render(CESE);
    expect(delMes).toContain(CESE);
    expect(delMes).toContain("Afecta al mes completo");
    expect(delMes).toContain(FUENTE);
    expect(delMes).toContain("Cargar la conciliación en la fuente correspondiente.");
    expect(delMes).not.toContain("/periodos");

    const dePersona = render(CESE, "r1");
    expect(dePersona).toContain("Afecta a esta persona");
    expect(dePersona).toContain(FUENTE);
    expect(dePersona).toContain("Cargar la conciliación en la fuente correspondiente.");
    expect(dePersona).not.toContain("/periodos");
  });

  it("PA-05 el aviso de duplicación avisa a la persona y enlaza a la fuente de conciliación para corregirla", () => {
    const html = render(DUPLICACION, "r1");
    expect(html).toContain(DUPLICACION);
    expect(html).toContain("Afecta a esta persona");
    expect(html).toContain(FUENTE);
    expect(html).toContain("Corregir la fuente.");
    expect(html).not.toContain("/periodos");
  });
});
