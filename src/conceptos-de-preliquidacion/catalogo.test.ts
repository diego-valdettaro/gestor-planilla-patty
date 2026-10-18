import { describe, expect, it } from "vitest";

import { netoDe } from "@/pagos/fuentes-en-el-neto";

import { CONCEPTOS, TIPOS_DE_CONCEPTO, buscarConcepto, efectoDelTipoEnNeto, tieneTipoPropio, type TipoDeConcepto } from "./catalogo";

const codigos = CONCEPTOS.map((concepto) => concepto.codigo);
// Los cinco conceptos de la conciliación de la liquidación por cese (#128, C1).
const CONCEPTOS_DE_CONCILIACION = ["vacaciones_truncas", "cts_trunca", "gratificacion_trunca", "remuneracion_pendiente_del_mes", "abono_de_liquidacion"];

describe("catálogo de conceptos de preliquidación (ADR 0009)", () => {
  it("contiene los conceptos iniciales de la especificación #96", () => {
    expect(codigos).toEqual(expect.arrayContaining([
      "sueldo_basico", "remuneracion_vacacional", "asignacion_familiar", "horas_extra_25", "horas_extra_35",
      "trabajo_en_descanso_o_feriado", "comision_de_ventas", "movilidad_supeditada_a_asistencia",
      "reduccion_por_falta", "reduccion_por_descanso_semanal", "reduccion_por_tardanza", "reduccion_por_ausencia_sin_goce",
      "aporte_onp", "aporte_obligatorio_afp", "prima_de_seguro_afp", "comision_afp", "retencion_de_quinta",
      "descuento_autorizado_por_incidencia", "adelanto", "cuota_de_prestamo", "ajuste_de_preliquidacion",
      "gratificacion_legal", "bonificacion_extraordinaria", "essalud_patronal",
    ]));
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("cada concepto tiene uno de los seis tipos, un código PLAME de cuatro dígitos (null solo en la conciliación de liquidación) y un origen; solo el ajuste toma ambos del concepto que corrige", () => {
    expect(TIPOS_DE_CONCEPTO).toHaveLength(6);
    expect(TIPOS_DE_CONCEPTO).toContain("conciliacion_de_liquidacion");
    for (const concepto of CONCEPTOS.filter(tieneTipoPropio)) {
      expect(TIPOS_DE_CONCEPTO, concepto.codigo).toContain(concepto.tipo);
      if (concepto.tipo === "conciliacion_de_liquidacion") expect(concepto.codigoPlame, concepto.codigo).toBeNull();
      else expect(concepto.codigoPlame, concepto.codigo).toMatch(/^\d{4}$/);
    }
    expect(CONCEPTOS.filter((concepto) => !tieneTipoPropio(concepto)).map(({ codigo }) => codigo)).toEqual(["ajuste_de_preliquidacion"]);
    for (const concepto of CONCEPTOS) {
      expect(["calculado", "fuente_externa", "ajuste"], concepto.codigo).toContain(concepto.origen);
      expect(concepto.nombre.trim(), concepto.codigo).not.toBe("");
    }
  });

  it("el efecto en el neto sale del tipo: ingresos suman, reducciones y deducciones restan, el aporte patronal y la conciliación de liquidación no tocan el neto", () => {
    const esperado: Record<TipoDeConcepto, string> = {
      ingreso_remunerativo: "suma", ingreso_no_remunerativo: "suma", reduccion: "resta", deduccion_del_trabajador: "resta", aporte_patronal: "ninguno",
      conciliacion_de_liquidacion: "ninguno",
    };
    for (const tipo of TIPOS_DE_CONCEPTO) expect(efectoDelTipoEnNeto(tipo)).toBe(esperado[tipo]);
    for (const concepto of CONCEPTOS.filter(tieneTipoPropio)) {
      expect(concepto.efectoEnNeto, concepto.codigo).toBe(esperado[concepto.tipo]);
    }
    expect(buscarConcepto("essalud_patronal")?.efectoEnNeto).toBe("ninguno");
  });

  it("las tres bases son independientes: la movilidad supeditada a asistencia solo integra la de quinta categoría", () => {
    expect(buscarConcepto("movilidad_supeditada_a_asistencia")?.bases).toEqual({ pensionaria: "no_afecta", essalud: "no_afecta", quinta: "suma" });
    expect(buscarConcepto("sueldo_basico")?.bases).toEqual({ pensionaria: "suma", essalud: "suma", quinta: "suma" });
    expect(buscarConcepto("gratificacion_legal")?.bases).toEqual({ pensionaria: "no_afecta", essalud: "no_afecta", quinta: "suma" });
    expect(buscarConcepto("bonificacion_extraordinaria")?.bases).toEqual({ pensionaria: "no_afecta", essalud: "no_afecta", quinta: "suma" });
  });

  it("las reducciones restan de las bases donde el ingreso reducido suma; deducciones y aportes patronales no tocan las bases", () => {
    for (const concepto of CONCEPTOS.filter((candidato) => candidato.tipo === "reduccion")) {
      expect(concepto.bases, concepto.codigo).toEqual({ pensionaria: "resta", essalud: "resta", quinta: "resta" });
    }
    for (const concepto of CONCEPTOS.filter((candidato) => candidato.tipo === "deduccion_del_trabajador" || candidato.tipo === "aporte_patronal")) {
      expect(concepto.bases, concepto.codigo).toEqual({ pensionaria: "no_afecta", essalud: "no_afecta", quinta: "no_afecta" });
    }
  });

  it("el ajuste de preliquidación hereda el efecto y las bases del concepto que corrige", () => {
    const ajuste = buscarConcepto("ajuste_de_preliquidacion");
    expect(ajuste).toMatchObject({ origen: "ajuste", tipo: "del_concepto_ajustado", codigoPlame: null, efectoEnNeto: "del_concepto_ajustado", bases: { pensionaria: "del_concepto_ajustado", essalud: "del_concepto_ajustado", quinta: "del_concepto_ajustado" } });
  });

  it("los códigos PLAME verificados contra la Tabla 22 de SUNAT", () => {
    const plame = (codigo: string) => buscarConcepto(codigo)?.codigoPlame;
    expect(plame("sueldo_basico")).toBe("0121");
    expect(plame("horas_extra_25")).toBe("0105");
    expect(plame("horas_extra_35")).toBe("0106");
    expect(plame("comision_de_ventas")).toBe("0103");
    expect(plame("movilidad_supeditada_a_asistencia")).toBe("0909");
    expect(plame("reduccion_por_tardanza")).toBe("0704");
    expect(plame("retencion_de_quinta")).toBe("0605");
    expect(plame("essalud_patronal")).toBe("0804");
  });

  it("buscarConcepto devuelve undefined para un código ajeno al catálogo", () => {
    expect(buscarConcepto("bono_libre")).toBeUndefined();
  });

  it("solo hay conceptos de fuente externa donde Finanzas carga importes; lo calculado nace de asistencia y reglas", () => {
    expect(buscarConcepto("comision_de_ventas")?.origen).toBe("fuente_externa");
    expect(buscarConcepto("horas_extra_25")?.origen).toBe("calculado");
    expect(buscarConcepto("reduccion_por_tardanza")?.origen).toBe("calculado");
  });

  it("CAL-01 el catálogo trae los cinco conceptos de la conciliación como fuente externa y sin código PLAME", () => {
    for (const codigo of CONCEPTOS_DE_CONCILIACION) {
      const concepto = buscarConcepto(codigo);
      expect(concepto, codigo).toBeDefined();
      expect(concepto?.origen, codigo).toBe("fuente_externa");
      expect(concepto?.codigoPlame, codigo).toBeNull();
      expect(concepto?.nombre.trim(), codigo).not.toBe("");
    }
  });

  it("CAL-02 los cinco conceptos de la conciliación no afectan el neto ni las bases", () => {
    for (const codigo of CONCEPTOS_DE_CONCILIACION) {
      const concepto = buscarConcepto(codigo);
      expect(concepto?.efectoEnNeto, codigo).toBe("ninguno");
      expect(concepto?.bases, codigo).toEqual({ pensionaria: "no_afecta", essalud: "no_afecta", quinta: "no_afecta" });
      expect(netoDe([{ concepto: codigo, importeCentimos: 130000 }], 80000), codigo).toBe(80000);
    }
  });
});
