import { describe, expect, it } from "vitest";

import type { ImporteExterno } from "@/fuentes-externas/gestionar-fuentes-externas";
import { corteDeIncidencias } from "@/periodos/hechos-para-pagos";
import { calcularBorrador, type EntradaDeBorrador } from "./calcular-borrador";

// EJ-ONP / EJ-VIGENCIA: valores sintéticos independientes, no tasas legales actuales.
const relacion = { id: "r1", dni: "12345678", nombre: "Ana", grupo: "Taller", ingreso: "2026-01-01", cese: null, ingresoConfirmado: true, ceseConfirmado: false };
function entrada(): EntradaDeBorrador {
  return {
    mesDePago: "2026-10", corte: { inicio: "2026-09-26", fin: "2026-10-25" }, relaciones: [relacion],
    condiciones: [
      { relacionId: "r1", dato: "sueldo", valor: 300000, vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "jornada_ordinaria_diaria", valor: 480, vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "regimen_laboral", valor: "general", vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "elegibilidad_familiar", valor: true, vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "afiliacion_pensionaria", valor: "onp", vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "sede_de_adscripcion", valor: "Taller", vigenteDesde: "2026-01-01" },
    ],
    reglas: [
      { codigo: "rmv", valor: 100000, vigenteDesde: "2026-01-01" },
      { codigo: "asignacion_familiar_porcentaje_de_rmv", valor: 1000, vigenteDesde: "2026-01-01" },
      { codigo: "onp_tasa", valor: 1300, vigenteDesde: "2026-01-01" },
      { codigo: "essalud_tasa", valor: 900, vigenteDesde: "2026-01-01" },
      { codigo: "essalud_base_minima", valor: 100000, vigenteDesde: "2026-01-01" },
    ],
    problemasDelCorte: [], revisiones: [], hechosPorDni: {}, sustitutorios: [], hechosDeOrigenPorDni: {},
    fuentesPendientes: [], importes: [], diasDeVacaciones: {}, abonosVacacionales: [], vacacionesProvisionales: false,
  };
}
function cambiar(e: EntradaDeBorrador, dato: EntradaDeBorrador["condiciones"][number]["dato"], valor: EntradaDeBorrador["condiciones"][number]["valor"], vigenteDesde = "2026-01-01") {
  e.condiciones = e.condiciones.filter(c => c.dato !== dato);
  e.condiciones.push({ relacionId: "r1", dato, valor, vigenteDesde });
}
function importe(concepto: string, monto: number, tipoDeFuente: ImporteExterno["tipoDeFuente"] = "movilidad_supeditada_a_asistencia"): ImporteExterno {
  return { id: `externo-${concepto}`, dni: relacion.dni, nombre: relacion.nombre, concepto, monto, tipoDeFuente,
    fechaDelHecho: "2026-10-02", mesDeDevengue: "2026-10", mesDeAplicacion: "2026-10", procedencia: "carga_manual",
    registradoPorId: "fin-1", registradoPor: "Finanzas", registradoEn: new Date("2026-10-03T00:00:00Z"),
    anuladoEn: null, motivoDeAnulacion: null, importacionId: null, estadoDeIncidencia: null, sustento: null,
    autorizadoPor: null, fechaDeAutorizacion: null, conceptoAjustado: null, sentidoAjuste: null, motivoDeAjuste: null };
}

function familia(e: EntradaDeBorrador) {
  return calcularBorrador(e).personas[0].lineas.filter(l => l.concepto === "asignacion_familiar");
}

function entradaAfp(): EntradaDeBorrador {
  const e = entrada();
  cambiar(e, "sueldo", 2000000);
  cambiar(e, "elegibilidad_familiar", false);
  cambiar(e, "afiliacion_pensionaria", "afp_integra");
  cambiar(e, "comision_afp", "flujo");
  e.reglas.push(
    { codigo: "afp_aporte_obligatorio", valor: 1000, vigenteDesde: "2026-01-01" },
    { codigo: "afp_prima_seguro", valor: 100, vigenteDesde: "2026-01-01" },
    { codigo: "afp_remuneracion_maxima_asegurable", valor: 1000000, vigenteDesde: "2026-01-01" },
    { codigo: "afp_integra_comision_flujo", valor: 150, vigenteDesde: "2026-01-01" },
    { codigo: "afp_integra_comision_mixta", valor: 0, vigenteDesde: "2026-01-01" },
  );
  return e;
}

describe("aportes y bases por devengue", () => {
  it.each(["permiso", "hora_extra"] as const)("T09-incidencia %s pendiente no desaparece al sumar las bases", (caso) => {
    const e = entrada();
    e.hechosPorDni = { [relacion.dni]: [{ dni: relacion.dni, fecha: "2026-10-06", grupo: "Taller", sede: "Lima",
      horarioAplicado: { entradaProgramada: "09:00", salidaProgramada: "18:00" }, resultado: caso === "permiso" ? "permiso" : "trabajada", minutosTrabajados: caso === "permiso" ? 0 : 540,
      tardanza: null, diaEspecial: null, horaExtra: caso === "permiso" ? null : { estado: "pendiente", minutosAl25: 60, minutosAl35: 0, trabajoNocturno: false, causaDeDescarte: null },
      evidencia: { asistenciaId: "pendiente-1", turnoPublicadoId: "turno-1" } }] };
    const p = calcularBorrador(e).personas[0];
    expect(p.basesPorDevengue).toMatchObject([{ pensionariaCentimos: null, essaludAplicableCentimos: null, quintaCentimos: null }]);
    expect(p.lineas.filter(l => l.concepto === "aporte_onp" || l.concepto === "essalud_patronal")).toEqual([]);
    expect(p.sueldoCalculadoCentimos).toBe(300000);
  });

  it("T09-fuentes una fuente pendiente vuelve desconocidas solo las bases de sus conceptos", () => {
    const e = entrada();
    e.fuentesPendientes = ["Movilidad supeditada a asistencia"];
    expect(calcularBorrador(e).personas[0].basesPorDevengue).toMatchObject([{ pensionariaCentimos: 310000, essaludRemunerativaCentimos: 310000, quintaCentimos: null }]);
    e.fuentesPendientes = ["Retención de quinta categoría"];
    expect(calcularBorrador(e).personas[0].basesPorDevengue).toMatchObject([{ pensionariaCentimos: 310000, quintaCentimos: 310000 }]);
    e.fuentesPendientes = ["Comisiones de ventas"];
    expect(calcularBorrador(e).personas[0].basesPorDevengue).toMatchObject([{ pensionariaCentimos: null, essaludAplicableCentimos: null, quintaCentimos: null }]);
  });

  it("T09-vigencia-minimo ya vigente antes del ingreso posterior al día uno (posterior)", () => {
    const e = entrada();
    e.relaciones = [{ ...relacion, ingreso: "2026-10-15" }];
    cambiar(e, "sueldo", 60000);
    cambiar(e, "elegibilidad_familiar", false);
    e.reglas = e.reglas.filter(r => r.codigo !== "essalud_base_minima");
    e.reglas.push({ codigo: "essalud_base_minima", valor: 100000, vigenteDesde: "2026-10-10" });
    const p = calcularBorrador(e).personas[0];
    expect(p.basesPorDevengue[0].essaludAplicableCentimos).toBe(100000);
    expect(p.lineas).toEqual(expect.arrayContaining([expect.objectContaining({ concepto: "essalud_patronal", importeCentimos: 9000 })]));
    expect(p.bloqueos).toEqual([]);
  });

  it("T09-seleccion cambio intramensual no exige AFP elegida al día25 ni corregir vigencia válida", () => {
    const e = entrada();
    e.condiciones.push({ relacionId: "r1", dato: "afiliacion_pensionaria", valor: "afp_integra", vigenteDesde: "2026-10-15" });
    const b = calcularBorrador(e);
    expect(b.bloqueosDelMes).toEqual([]);
    expect(b.personas[0].bloqueos).toEqual([expect.stringMatching(/cambio dentro del mes.*afiliación.*Finanzas/)]);
    const comision = entradaAfp();
    comision.reglas = comision.reglas.filter(r => r.codigo !== "afp_integra_comision_flujo");
    comision.condiciones.push({ relacionId: "r1", dato: "comision_afp", valor: "mixta", vigenteDesde: "2026-10-15" });
    expect(calcularBorrador(comision).personas[0].bloqueos).toEqual([expect.stringMatching(/cambio dentro del mes.*comisión.*Finanzas/)]);
  });

  it("T09-aportes regla necesaria ausente deja el concepto pendiente, cero versionado sí vale", () => {
    const casos = [
      ["onp_tasa", "aporte_onp", "Tasa de ONP", false],
      ["essalud_tasa", "essalud_patronal", "Tasa de EsSalud", false],
      ["essalud_base_minima", "essalud_patronal", "Base mínima de EsSalud", false],
      ["afp_aporte_obligatorio", "aporte_obligatorio_afp", "Aporte obligatorio", true],
      ["afp_prima_seguro", "prima_de_seguro_afp", "Prima de seguro", true],
      ["afp_remuneracion_maxima_asegurable", "prima_de_seguro_afp", "Remuneración máxima", true],
      ["afp_integra_comision_flujo", "comision_afp", "Comisión AFP Integra", true],
    ] as const;
    for (const [codigo, concepto, nombre, afp] of casos) {
      const e = afp ? entradaAfp() : entrada();
      e.reglas = e.reglas.filter(r => r.codigo !== codigo);
      const p = calcularBorrador(e).personas[0];
      expect(p.lineas.filter(l => l.concepto === concepto)).toEqual([]);
      expect(p.bloqueos.some(b => b.includes(nombre) && b.includes("2026-10"))).toBe(true);
      expect(p.basesPorDevengue[0].pensionariaCentimos).toBe(afp ? 2000000 : 310000);
    }
    const e = entrada();
    e.reglas = e.reglas.filter(r => r.codigo !== "onp_tasa");
    e.reglas.push({ codigo: "onp_tasa", valor: 0, vigenteDesde: "2026-01-01" });
    expect(calcularBorrador(e).personas[0].lineas).toEqual(expect.arrayContaining([expect.objectContaining({ concepto: "aporte_onp", importeCentimos: 0, tasaEnCentesimasDePunto: 0 })]));
    expect(calcularBorrador(e).personas[0].bloqueos).toEqual([]);
  });

  it("T09-sueldo sin remuneración conocida no calcula aportes sobre el familiar aislado", () => {
    const e = entrada();
    e.condiciones = e.condiciones.filter(c => c.dato !== "sueldo");
    const p = calcularBorrador(e).personas[0];
    expect(p.basesPorDevengue).toMatchObject([{ pensionariaCentimos: null, essaludRemunerativaCentimos: null, essaludAplicableCentimos: null, quintaCentimos: null }]);
    expect(p.lineas.filter(l => l.concepto === "aporte_onp" || l.concepto === "essalud_patronal")).toEqual([]);
    expect(p.bloqueos.join(" ")).toMatch(/sueldo/i);
  });

  it("T09-familiar componentes necesarios desconocidos no aparentan bases completas", () => {
    for (const dato of ["elegibilidad_familiar", "regimen_laboral"] as const) {
      const e = entrada();
      e.condiciones = e.condiciones.filter(c => c.dato !== dato);
      const p = calcularBorrador(e).personas[0];
      expect(p.basesPorDevengue).toMatchObject([{ pensionariaCentimos: null, essaludRemunerativaCentimos: null, essaludAplicableCentimos: null, quintaCentimos: null }]);
      expect(p.lineas.filter(l => l.concepto === "aporte_onp" || l.concepto === "essalud_patronal")).toEqual([]);
      expect(p.sueldoCalculadoCentimos).toBe(300000);
    }
    for (const codigo of ["rmv", "asignacion_familiar_porcentaje_de_rmv"] as const) {
      const e = entrada();
      e.reglas = e.reglas.filter(r => r.codigo !== codigo);
      const p = calcularBorrador(e).personas[0];
      expect(p.basesPorDevengue).toMatchObject([{ pensionariaCentimos: null, quintaCentimos: null }]);
      expect(p.bloqueos.join(" ")).toMatch(/asignación familiar.*2026-10/i);
      cambiar(e, "elegibilidad_familiar", false);
      expect(calcularBorrador(e).personas[0].basesPorDevengue).toMatchObject([{ pensionariaCentimos: 300000 }]);
    }
  });

  it("T08e arrastre parcial conserva sueldo/devengue y deja liquidación monetaria sin regla pendiente", () => {
    const e = entrada();
    e.mesDePago = "2026-11";
    e.corte = corteDeIncidencias(e.mesDePago);
    e.relaciones = [{ ...relacion, ingreso: "2026-10-27" }];
    e.reglas.push({ codigo: "asignacion_familiar_porcentaje_de_rmv", valor: 1200, vigenteDesde: "2026-11-01" });
    const p = calcularBorrador(e).personas[0];
    expect(p.basesPorDevengue.find(b => b.mesDeDevengue === "2026-10")).toMatchObject({ pensionariaCentimos: null, essaludAplicableCentimos: null });
    expect(p.lineas.filter(l => l.mesDeDevengue === "2026-10")).toMatchObject([{ concepto: "sueldo_basico", dias: 4, mesDePago: "2026-11", origen: "Condición laboral", corte: e.corte }]);
    expect(p.bloqueos.join(" ")).toMatch(/2026-10.*arrastre.*Finanzas/);
    expect(familia(e)).toMatchObject([{ importeCentimos: 12000, mesDeDevengue: "2026-11" }]);
  });

  it("T08d-minimo cambio intramensual no presenta base EsSalud aplicable aparente", () => {
    const e = entrada();
    e.reglas.push({ codigo: "essalud_base_minima", valor: 120000, vigenteDesde: "2026-10-15" });
    const p = calcularBorrador(e).personas[0];
    expect(p.basesPorDevengue[0]).toMatchObject({ essaludAplicableCentimos: null, essaludRemunerativaCentimos: 310000, pensionariaCentimos: 310000 });
    expect(p.lineas.filter(l => l.concepto === "essalud_patronal")).toEqual([]);
    expect(p.bloqueos.join(" ")).toMatch(/cambio dentro del mes.*Base mínima.*Finanzas/);
  });

  it("T08d-tope guardia genérica ya cubre tope y prima AFP (posterior)", () => {
    for (const codigo of ["afp_remuneracion_maxima_asegurable", "afp_prima_seguro"] as const) {
      const e = entradaAfp();
      e.reglas.push({ codigo, valor: 999, vigenteDesde: "2026-10-15" });
      const p = calcularBorrador(e).personas[0];
      expect(p.lineas.filter(l => l.concepto === "prima_de_seguro_afp")).toEqual([]);
      expect(p.lineas).toEqual(expect.arrayContaining([expect.objectContaining({ concepto: "aporte_obligatorio_afp", importeCentimos: 200000 })]));
    }
  });

  it("T08d-comision cambio de esquema deja solo comisión pendiente", () => {
    const e = entradaAfp();
    e.condiciones.push({ relacionId: "r1", dato: "comision_afp", valor: "mixta", vigenteDesde: "2026-10-15" });
    const p = calcularBorrador(e).personas[0];
    expect(p.lineas.filter(l => l.concepto === "comision_afp")).toEqual([]);
    expect(p.bloqueos.join(" ")).toMatch(/cambio dentro del mes.*comisión.*Finanzas/i);
    expect(p.lineas).toEqual(expect.arrayContaining([expect.objectContaining({ concepto: "aporte_obligatorio_afp", importeCentimos: 200000 })]));
  });

  it("T08d-familiar cambio intramensual de régimen, beneficio o reglas deja bases pendientes sin impedir sueldo", () => {
    for (const dato of ["regimen_laboral", "elegibilidad_familiar"] as const) {
      const e = entrada();
      e.condiciones.push({ relacionId: "r1", dato, valor: dato === "regimen_laboral" ? "remype_pequena_empresa" : false, vigenteDesde: "2026-10-15" });
      e.condiciones.push({ relacionId: "r1", dato: "sueldo", valor: 600000, vigenteDesde: "2026-10-16" });
      const p = calcularBorrador(e).personas[0];
      expect(p.lineas.filter(l => l.concepto === "asignacion_familiar")).toEqual([]);
      expect(p.basesPorDevengue).toMatchObject([{ pensionariaCentimos: null, essaludRemunerativaCentimos: null, quintaCentimos: null }]);
      expect(p.bloqueos.join(" ")).toMatch(/cambio dentro del mes.*Finanzas/);
      expect(p.lineas.filter(l => l.concepto === "sueldo_basico")).toMatchObject([{ dias: 15 }, { dias: 15 }]);
    }
    for (const codigo of ["rmv", "asignacion_familiar_porcentaje_de_rmv"] as const) {
      const e = entrada();
      e.reglas.push({ codigo, valor: codigo === "rmv" ? 120000 : 1200, vigenteDesde: "2026-10-15" });
      expect(calcularBorrador(e).personas[0]).toMatchObject({ basesPorDevengue: [{ pensionariaCentimos: null, quintaCentimos: null }] });
      expect(familia(e)).toEqual([]);
    }
  });

  it("T08c tasa intramensual pendiente por concepto, sin promedio ni tasa última", () => {
    const e = entrada();
    e.reglas.push({ codigo: "onp_tasa", valor: 1500, vigenteDesde: "2026-10-15" });
    const p = calcularBorrador(e).personas[0];
    expect(p.lineas.filter(l => l.concepto === "aporte_onp")).toEqual([]);
    expect(p.bloqueos.join(" ")).toMatch(/cambio dentro del mes.*2026-10.*ONP.*Finanzas/);
    expect(p.basesPorDevengue[0].pensionariaCentimos).toBe(310000);
    expect(p.lineas).toEqual(expect.arrayContaining([expect.objectContaining({ concepto: "essalud_patronal", importeCentimos: 27900 })]));
    const ajena = entrada();
    ajena.reglas.push({ codigo: "afp_integra_comision_flujo", valor: 150, vigenteDesde: "2026-10-15" });
    expect(calcularBorrador(ajena).personas[0].bloqueos).toEqual([]);
    expect(calcularBorrador(ajena).personas[0].lineas).toEqual(expect.arrayContaining([expect.objectContaining({ concepto: "aporte_onp", importeCentimos: 40300 })]));
  });

  it("T08a historia mensual estable y cambio el primer día siguiente (regresión posterior T01)", () => {
    const e = entrada();
    e.reglas.push({ codigo: "asignacion_familiar_porcentaje_de_rmv", valor: 1200, vigenteDesde: "2026-11-01" });
    expect(familia(e)).toMatchObject([{ importeCentimos: 10000 }]);
    expect(calcularBorrador(e).personas[0].bloqueos).toEqual([]);
    e.mesDePago = "2026-11";
    expect(familia(e)).toMatchObject([{ importeCentimos: 12000 }]);
    expect(calcularBorrador(e).personas[0].bloqueos).toEqual([]);
  });

  it("T08b afiliación intramensual pendiente sin aportes fabricados y con EsSalud independiente", () => {
    const e = entrada();
    e.condiciones.push({ relacionId: "r1", dato: "afiliacion_pensionaria", valor: "afp_integra", vigenteDesde: "2026-10-15" });
    const p = calcularBorrador(e).personas[0];
    expect(p.lineas.filter(l => l.concepto === "aporte_onp" || l.concepto.includes("afp"))).toEqual([]);
    expect(p.bloqueos.join(" ")).toMatch(/cambio dentro del mes.*2026-10.*afiliación.*Finanzas/i);
    expect(p.lineas).toEqual(expect.arrayContaining([expect.objectContaining({ concepto: "essalud_patronal", importeCentimos: 27900 })]));
    expect(p.sueldoCalculadoCentimos).toBe(300000);
    const ajena = entrada();
    ajena.condiciones.push({ relacionId: "otra-relacion", dato: "afiliacion_pensionaria", valor: "afp_integra", vigenteDesde: "2026-10-15" });
    expect(calcularBorrador(ajena).personas[0].lineas).toEqual(expect.arrayContaining([expect.objectContaining({ concepto: "aporte_onp", importeCentimos: 40300 })]));
  });

  it("T07 EsSalud patronal: mínimo separado de remuneración y sin neto definitivo", () => {
    const e = entrada();
    cambiar(e, "sueldo", 60000);
    cambiar(e, "elegibilidad_familiar", false);
    const p = calcularBorrador(e).personas[0];
    expect(p).toMatchObject({ netoCentimos: null, sueldoCalculadoCentimos: 60000, basesPorDevengue: [{ pensionariaCentimos: 60000, essaludRemunerativaCentimos: 60000, essaludAplicableCentimos: 100000, quintaCentimos: 60000 }] });
    expect(p.lineas).toEqual(expect.arrayContaining([expect.objectContaining({ concepto: "essalud_patronal", importeCentimos: 9000, baseCentimos: 100000, minimoCentimos: 100000, tipo: "aporte_patronal", efectoEnNeto: "ninguno" })]));
    expect(calcularBorrador(entrada()).personas[0].lineas).toEqual(expect.arrayContaining([expect.objectContaining({ concepto: "essalud_patronal", importeCentimos: 27900 })]));
    expect(calcularBorrador(entradaAfp()).personas[0].lineas).toEqual(expect.arrayContaining([expect.objectContaining({ concepto: "essalud_patronal", importeCentimos: 180000 })]));
  });

  it.each([["T05a", 500000, 5000], ["T05b", 1000000, 10000]] as const)("%s prima bajo e igual al tope (variante posterior)", (_id, sueldo, prima) => {
    const e = entradaAfp();
    cambiar(e, "sueldo", sueldo);
    expect(calcularBorrador(e).personas[0].lineas).toEqual(expect.arrayContaining([
      expect.objectContaining({ concepto: "prima_de_seguro_afp", importeCentimos: prima, baseCentimos: sueldo }),
    ]));
  });

  it("T06 comisión salarial por AFP/esquema sin tope; mixta cero explícito y falta no es cero", () => {
    const e = entradaAfp();
    expect(calcularBorrador(e).personas[0].lineas).toEqual(expect.arrayContaining([
      expect.objectContaining({ concepto: "comision_afp", importeCentimos: 30000, baseCentimos: 2000000, tasaEnCentesimasDePunto: 150 }),
    ]));
    cambiar(e, "comision_afp", "mixta");
    expect(calcularBorrador(e).personas[0].lineas).toEqual(expect.arrayContaining([expect.objectContaining({ concepto: "comision_afp", importeCentimos: 0 })]));
    e.reglas = e.reglas.filter(r => r.codigo !== "afp_integra_comision_mixta");
    e.reglas.push({ codigo: "afp_prima_comision_mixta", valor: 999, vigenteDesde: "2026-01-01" });
    expect(calcularBorrador(e).personas[0].lineas.filter(l => l.concepto === "comision_afp")).toEqual([]);
    expect(calcularBorrador(e).bloqueosDelMes.join(" ")).toMatch(/Comisión AFP Integra mixta/);
  });

  it("T05c prima AFP limitada por tope: base 20000, tope 10000, tasa sintética 1 %", () => {
    expect(calcularBorrador(entradaAfp()).personas[0].lineas).toEqual(expect.arrayContaining([
      expect.objectContaining({ concepto: "prima_de_seguro_afp", importeCentimos: 10000, baseCentimos: 1000000, topeCentimos: 1000000, tasaEnCentesimasDePunto: 100 }),
    ]));
  });

  it("T04 aporte obligatorio AFP sin tope de seguro y sin ONP simultánea", () => {
    const p = calcularBorrador(entradaAfp()).personas[0];
    expect(p.lineas).toEqual(expect.arrayContaining([expect.objectContaining({ concepto: "aporte_obligatorio_afp", importeCentimos: 200000, baseCentimos: 2000000, tasaEnCentesimasDePunto: 1000 })]));
    expect(p.lineas.filter(l => l.concepto === "aporte_onp")).toEqual([]);
  });

  it("T03 ONP exclusiva: tasa versionada sobre su base, sin comisión AFP ajena", () => {
    const e = entrada();
    const p = calcularBorrador(e).personas[0];
    expect(p.lineas).toEqual(expect.arrayContaining([expect.objectContaining({ concepto: "aporte_onp", importeCentimos: 40300, baseCentimos: 310000, tasaEnCentesimasDePunto: 1300 })]));
    expect(p.lineas.filter(l => l.concepto.includes("afp"))).toEqual([]);
    expect(p.bloqueos).toEqual([]);
    cambiar(e, "elegibilidad_familiar", false);
    cambiar(e, "sueldo", 60000);
    expect(calcularBorrador(e).personas[0].lineas).toEqual(expect.arrayContaining([expect.objectContaining({ concepto: "aporte_onp", importeCentimos: 7800, baseCentimos: 60000 })]));
  });

  it("T02 bases por catálogo: movilidad solo quinta, reducciones restan y deducciones no afectan", () => {
    const e = entrada();
    e.importes = [importe("movilidad_supeditada_a_asistencia", 20000),
      importe("retencion_de_quinta", 2000, "retencion_de_quinta"),
      importe("abono_anticipado_de_remuneracion_vacacional", 50000, "abonos_vacacionales"),
      { ...importe("movilidad_supeditada_a_asistencia", 99999), dni: "87654321" },
      { ...importe("movilidad_supeditada_a_asistencia", 99999), mesDeAplicacion: "2026-11" },
      { ...importe("movilidad_supeditada_a_asistencia", 99999), anuladoEn: new Date() }];
    expect(calcularBorrador(e).personas[0]).toMatchObject({ basesPorDevengue: [{ mesDeDevengue: "2026-10", pensionariaCentimos: 310000, essaludRemunerativaCentimos: 310000, quintaCentimos: 330000 }] });
    cambiar(e, "elegibilidad_familiar", false);
    e.hechosPorDni = { [relacion.dni]: [{ dni: relacion.dni, fecha: "2026-10-06", grupo: "Taller", sede: "Lima", horarioAplicado: { entradaProgramada: "09:00", salidaProgramada: "18:00" }, resultado: "falta", minutosTrabajados: 0,
      tardanza: null, horaExtra: null, diaEspecial: null, evidencia: { asistenciaId: "falta-1", turnoPublicadoId: "turno-1" } }] };
    expect(calcularBorrador(e).personas[0]).toMatchObject({ basesPorDevengue: [{ pensionariaCentimos: 289667, essaludRemunerativaCentimos: 289667, quintaCentimos: 309667 }] });
  });

  it("T10 un importe de un devengue anterior no recibe el mínimo completo de EsSalud: sus bases quedan Pendiente", () => {
    const e = entrada();
    e.importes = [{ ...importe("movilidad_supeditada_a_asistencia", 3000), mesDeDevengue: "2026-09", fechaDelHecho: "2026-09-20" }];
    const p = calcularBorrador(e).personas[0];
    expect(p.basesPorDevengue.find(b => b.mesDeDevengue === "2026-09")).toMatchObject({ pensionariaCentimos: null, essaludRemunerativaCentimos: null, essaludAplicableCentimos: null, quintaCentimos: null });
    expect(p.lineas.filter(l => l.mesDeDevengue === "2026-09" && (l.concepto === "essalud_patronal" || l.concepto === "aporte_onp"))).toEqual([]);
    expect(p.basesPorDevengue.find(b => b.mesDeDevengue === "2026-10")).toMatchObject({ pensionariaCentimos: 310000, essaludAplicableCentimos: 310000 });
  });

  it("T11 la sede de adscripción se consulta el día 25 del mes de pago, como antes de este cambio", () => {
    const e = entrada();
    e.condiciones.push({ relacionId: "r1", dato: "sede_de_adscripcion", valor: "Lima", vigenteDesde: "2026-10-10" });
    expect(calcularBorrador(e).personas[0].sedeDeAdscripcion).toBe("Lima");
  });

  it("T01 asignación otorgada completa en General y REMYPE, con historia mensual y falta distinta de false", () => {
    for (const regimen of ["general", "remype_pequena_empresa"]) {
      const e = entrada();
      cambiar(e, "regimen_laboral", regimen);
      e.reglas.push({ codigo: "asignacion_familiar_porcentaje_de_rmv", valor: 1200, vigenteDesde: "2026-11-01" });
      expect(familia(e)).toMatchObject([{ importeCentimos: 10000, mesDeDevengue: "2026-10", mesDePago: "2026-10", corte: e.corte }]);
      e.mesDePago = "2026-11";
      expect(familia(e)).toMatchObject([{ importeCentimos: 12000, mesDeDevengue: "2026-11" }]);
      cambiar(e, "elegibilidad_familiar", false);
      expect(familia(e)).toEqual([]);
      e.condiciones = e.condiciones.filter(c => c.dato !== "elegibilidad_familiar");
      expect(familia(e)).toEqual([]);
      expect(calcularBorrador(e).personas[0].bloqueos.join(" ")).toMatch(/asignación familiar otorgada/i);
    }
  });
});
