import { describe, expect, it } from "vitest";

import { TIPOS_DE_FUENTE, buscarTipoDeFuente } from "./tipos-de-fuente";

describe("tipos de fuente externa", () => {
  it("CAL-03 existe el tipo de fuente de flujo propio «Conciliación de liquidación por cese» con sus cinco conceptos", () => {
    const tipo = buscarTipoDeFuente("conciliacion_de_liquidacion_por_cese");
    expect(tipo).toMatchObject({ codigo: "conciliacion_de_liquidacion_por_cese", nombre: "Conciliación de liquidación por cese", flujoPropio: true });
    expect(tipo?.conceptos).toEqual(["vacaciones_truncas", "cts_trunca", "gratificacion_trunca", "remuneracion_pendiente_del_mes", "abono_de_liquidacion"]);
    expect(TIPOS_DE_FUENTE.map(({ codigo }) => codigo)).toContain("conciliacion_de_liquidacion_por_cese");
  });
});
