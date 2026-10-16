import { describe, expect, it } from "vitest";

import type { ImporteExterno } from "@/fuentes-externas/gestionar-fuentes-externas";

import { calcularBorrador, type EntradaDeBorrador } from "./calcular-borrador";

// Cálculo puro del neto con fuentes externas (#127). Esperados de ejemplos-sinteticos.md (E1–E12), en céntimos.
const mes = "2026-10";
const corte = { inicio: "2026-09-26", fin: "2026-10-25" };
const persona = (id: string, dni: string, nombre: string) => ({ id, dni, nombre, grupo: "Taller", ingreso: "2026-01-01", cese: null, ingresoConfirmado: true, ceseConfirmado: false });
const ana = persona("r1", "12345678", "Ana");

const condiciones = (relacionId: string, sueldo: number, sede = "Taller", omitir: string[] = []): EntradaDeBorrador["condiciones"] => ([
  ["sueldo", sueldo], ["jornada_ordinaria_diaria", 480], ["regimen_laboral", "general"], ["afiliacion_pensionaria", "onp"], ["elegibilidad_familiar", false], ["sede_de_adscripcion", sede],
] as const).filter(([dato]) => !omitir.includes(dato)).map(([dato, valor]) => ({ relacionId, dato, valor, vigenteDesde: "2026-01-01" }));

function importe(concepto: string, tipoDeFuente: ImporteExterno["tipoDeFuente"], monto: number, parcial: Partial<ImporteExterno> = {}): ImporteExterno {
  return { id: `${concepto}-${monto}-${parcial.fechaDelHecho ?? "05"}`, nombre: "Ana", dni: ana.dni, concepto, tipoDeFuente, fechaDelHecho: "2026-10-05", mesDeDevengue: mes, mesDeAplicacion: mes, monto,
    procedencia: "carga_manual", registradoPorId: "f-1", registradoPor: "Finanzas", registradoEn: new Date("2026-10-06T00:00:00Z"), anuladoEn: null, motivoDeAnulacion: null,
    importacionId: null, estadoDeIncidencia: null, sustento: null, autorizadoPor: null, fechaDeAutorizacion: null, conceptoAjustado: null, sentidoAjuste: null, motivoDeAjuste: null, ...parcial };
}
const comision = (monto = 15000) => importe("comision_de_ventas", "comisiones_de_ventas", monto);
const movilidad = (monto = 12000) => importe("movilidad_supeditada_a_asistencia", "movilidad_supeditada_a_asistencia", monto);
const adelanto = (monto = 30000, parcial: Partial<ImporteExterno> = {}) => importe("adelanto", "adelantos", monto, parcial);
const prestamo = (monto = 20000) => importe("cuota_de_prestamo", "prestamos", monto);
const e1 = () => [comision(), movilidad(), adelanto(), prestamo()];

function entrada(parcial: Partial<EntradaDeBorrador> = {}): EntradaDeBorrador {
  return { mesDePago: mes, corte, relaciones: [ana], condiciones: condiciones("r1", 200000), reglas: [], problemasDelCorte: [], revisiones: [], hechosPorDni: {}, sustitutorios: [],
    hechosDeOrigenPorDni: {}, fuentesPendientes: [], importes: [], diasDeVacaciones: {}, abonosVacacionales: [], vacacionesProvisionales: false, ...parcial };
}
const primera = (parcial: Partial<EntradaDeBorrador>) => calcularBorrador(entrada(parcial)).personas[0];
const externas = (lineas: Array<{ concepto: string }>) => lineas.filter(({ concepto }) => concepto !== "sueldo_basico");

describe("neto con fuentes externas", () => {
  it("C01 cada línea externa lleva el efecto en las bases del catálogo", () => {
    const porConcepto = Object.fromEntries(externas(primera({ importes: e1() }).lineas).map((linea) => [linea.concepto, "efectosEnBases" in linea ? linea.efectosEnBases : undefined]));
    expect(porConcepto).toEqual({
      comision_de_ventas: { pensionaria: "suma", essalud: "suma", quinta: "suma" },
      movilidad_supeditada_a_asistencia: { pensionaria: "no_afecta", essalud: "no_afecta", quinta: "suma" },
      adelanto: { pensionaria: "no_afecta", essalud: "no_afecta", quinta: "no_afecta" },
      cuota_de_prestamo: { pensionaria: "no_afecta", essalud: "no_afecta", quinta: "no_afecta" },
    });
  });

  it("C02 los ingresos suman y las deducciones restan", () => {
    const resultado = primera({ importes: e1() });
    expect(resultado.netoCentimos).toBe(177000);
    expect(externas(resultado.lineas).map((linea) => [linea.concepto, "efectoEnNeto" in linea && linea.efectoEnNeto])).toEqual([
      ["comision_de_ventas", "suma"], ["movilidad_supeditada_a_asistencia", "suma"], ["adelanto", "resta"], ["cuota_de_prestamo", "resta"]]);
  });

  it("C03 con fuentes pendientes el neto es null y el mes lo señala", () => {
    const resultado = calcularBorrador(entrada({ importes: e1(), fuentesPendientes: ["Préstamos (cuotas)"] }));
    expect(resultado.personas[0].netoCentimos).toBeNull();
    expect(resultado.bloqueosDelMes).toContain("Fuente externa pendiente: Préstamos (cuotas).");
    expect(resultado.personas[0].bloqueos.some((bloqueo) => bloqueo.includes("Fuente externa pendiente"))).toBe(false);
  });

  it("C04 un tipo confirmado sin importes es cero confirmado", () => {
    const resultado = calcularBorrador(entrada({ importes: [comision(), movilidad(), prestamo()] }));
    expect(resultado.personas[0].netoCentimos).toBe(207000);
    expect(resultado.bloqueosDelMes.some((bloqueo) => bloqueo.includes("Fuente externa pendiente"))).toBe(false);
  });

  it("C05 una persona con bloqueo propio conserva sus líneas externas pero no tiene neto", () => {
    const resultado = primera({ importes: e1(), condiciones: condiciones("r1", 200000, "Taller", ["jornada_ordinaria_diaria"]) });
    expect(resultado.netoCentimos).toBeNull();
    expect(resultado.lineas).toContainEqual(expect.objectContaining({ concepto: "adelanto", importeCentimos: 30000 }));
  });

  const incidencia = (estadoDeIncidencia: ImporteExterno["estadoDeIncidencia"]) =>
    importe("descuento_autorizado_por_incidencia", "incidencias_de_tienda", 8000, { estadoDeIncidencia, fechaDelHecho: "2026-10-06" });

  it("C06 una incidencia en investigación no genera línea ni resta", () => {
    const resultado = primera({ importes: [...e1(), incidencia("en_investigacion")] });
    expect(resultado.netoCentimos).toBe(177000);
    expect(resultado.lineas.some(({ concepto }) => concepto === "descuento_autorizado_por_incidencia")).toBe(false);
  });

  it("C07 una incidencia sin sustento tampoco entra", () => {
    expect(primera({ importes: [...e1(), incidencia("sin_sustento")] }).netoCentimos).toBe(177000);
  });

  it("C08 solo el descuento autorizado resta", () => {
    const resultado = primera({ importes: [...e1(), incidencia("descuento_autorizado")] });
    expect(resultado.netoCentimos).toBe(169000);
    expect(resultado.lineas).toContainEqual(expect.objectContaining({ concepto: "descuento_autorizado_por_incidencia", importeCentimos: 8000, efectoEnNeto: "resta" }));
  });

  it("C09 un ajuste toma el efecto del concepto corregido", () => {
    const ajuste = importe("ajuste_de_preliquidacion", "ajustes_de_preliquidacion", 5000, { conceptoAjustado: "comision_de_ventas", sentidoAjuste: "resta", motivoDeAjuste: "Corrección", fechaDelHecho: "2026-10-07" });
    const resultado = primera({ importes: [...e1(), ajuste] });
    expect(resultado.netoCentimos).toBe(172000);
    expect(resultado.lineas).toContainEqual(expect.objectContaining({ concepto: "ajuste_de_preliquidacion", importeCentimos: 5000, efectoEnNeto: "resta",
      efectosEnBases: { pensionaria: "resta", essalud: "resta", quinta: "resta" } }));
  });

  it("C10 un importe repetido con la misma clave se cuenta una vez", () => {
    const resultado = primera({ importes: [...e1(), { ...adelanto(), id: "otro-id" }] });
    expect(resultado.netoCentimos).toBe(177000);
    expect(resultado.lineas.filter(({ concepto }) => concepto === "adelanto")).toHaveLength(1);
  });

  it("C11 dos adelantos con fechas distintas son filas distintas", () => {
    expect(primera({ importes: [...e1(), adelanto(30000, { fechaDelHecho: "2026-10-12" })] }).netoCentimos).toBe(147000);
  });

  it("C12 un importe anulado no cuenta", () => {
    expect(primera({ importes: [comision(), movilidad(), adelanto(30000, { anuladoEn: new Date("2026-10-07T00:00:00Z"), motivoDeAnulacion: "Error" }), prestamo()] }).netoCentimos).toBe(207000);
  });

  it("C13 solo cuenta el importe cuyo mes de aplicación es el mes de pago", () => {
    const otros = [adelanto(30000, { mesDeAplicacion: "2026-09", fechaDelHecho: "2026-09-10" }), adelanto(30000, { mesDeAplicacion: "2026-11", fechaDelHecho: "2026-11-10" })];
    expect(primera({ importes: [...e1(), ...otros] }).netoCentimos).toBe(177000);
  });

  const beto = persona("r2", "87654321", "Beto");
  const E2 = { relaciones: [ana], condiciones: condiciones("r1", 100000), importes: [adelanto(120000)] };

  it("C14 no se arrastran deducciones al mes siguiente", () => {
    primera(E2);
    const noviembre = primera({ ...E2, mesDePago: "2026-11", corte: { inicio: "2026-10-26", fin: "2026-11-25" }, importes: [] });
    expect(noviembre.netoCentimos).toBe(100000);
  });

  it("C15 las sumas son exactas en céntimos enteros, por encima de 32 bits", () => {
    const resultado = primera({ condiciones: condiciones("r1", 100001), importes: [importe("comision_de_ventas", "comisiones_de_ventas", 2147483647), movilidad(1)] });
    expect(resultado.netoCentimos).toBe(2147583649);
    expect(Number.isInteger(resultado.netoCentimos)).toBe(true);
  });

  it("C16 un neto negativo bloquea a la persona sin bloquear a las demás", () => {
    const resultado = calcularBorrador(entrada({ relaciones: [ana, beto], condiciones: [...condiciones("r1", 100000), ...condiciones("r2", 150000)], importes: [adelanto(120000)] }));
    const [a, b] = resultado.personas;
    expect(a.netoCentimos).toBeNull();
    expect(a.bloqueos.some((bloqueo) => bloqueo.includes("Neto negativo") && bloqueo.includes("S/ −200,00"))).toBe(true);
    expect(b.netoCentimos).toBe(150000);
    expect(b.bloqueos).toEqual([]);
  });

  const carla = persona("r3", "11112222", "Carla");
  const deCarla = (monto: number) => ({ ...adelanto(monto), dni: carla.dni, nombre: "Carla" });
  const tresPersonas = () => entrada({ relaciones: [ana, beto, carla],
    condiciones: [...condiciones("r1", 200000), ...condiciones("r2", 100000, "Tiendas Benavides"), ...condiciones("r3", 100000)],
    importes: [...e1(), deCarla(120000)] });

  it("C17 los totales por sede suman los netos de las personas calculadas", () => {
    const resultado = calcularBorrador(entrada({ relaciones: [ana, beto], condiciones: [...condiciones("r1", 200000), ...condiciones("r2", 100000, "Tiendas Benavides")], importes: e1() }));
    expect(resultado.totalesPorSede).toMatchObject([{ sede: "Taller", calculadas: 1, netoCentimos: 177000 }, { sede: "Tiendas Benavides", calculadas: 1, netoCentimos: 100000 }]);
    expect(resultado.totalesPorSede).toHaveLength(2);
    expect(resultado.netoCalculadoCentimos).toBe(277000);
  });

  it("C18 la sede suma solo personas calculadas: la bloqueada por neto negativo no entra", () => {
    const resultado = calcularBorrador(tresPersonas());
    expect(resultado.totalesPorSede.find(({ sede }) => sede === "Taller")).toMatchObject({ personas: 2, calculadas: 1, netoCentimos: 177000 });
    expect(resultado.personasBloqueadas).toBe(1);
    expect(resultado.netoCalculadoCentimos).toBe(277000);
  });

  it("C19 con problemas de corte la persona sin bloqueo propio conserva su neto de borrador", () => {
    const resultado = calcularBorrador(entrada({ importes: e1(), problemasDelCorte: ["El período 26/09–25/10 no está cerrado: sus hechos son provisionales."] }));
    expect(resultado.personas[0].netoCentimos).toBe(177000);
    expect(resultado.bloqueosDelMes).toContain("El período 26/09–25/10 no está cerrado: sus hechos son provisionales.");
  });

  it("C20 los tipos fuera de las seis fuentes no entran al neto aunque estén confirmados con importes", () => {
    const fuera = [importe("retencion_de_quinta", "retencion_de_quinta", 9000), importe("gratificacion_legal", "gratificacion_y_bonificacion", 50000)];
    const resultado = primera({ importes: [...e1(), ...fuera] });
    expect(resultado.netoCentimos).toBe(177000);
    expect(resultado.lineas.some(({ concepto }) => ["retencion_de_quinta", "gratificacion_legal"].includes(concepto))).toBe(false);
  });

  it("C21 los tipos fuera del neto siguen exigiendo confirmación", () => {
    const resultado = calcularBorrador(entrada({ importes: e1(), fuentesPendientes: ["Retención de quinta categoría"] }));
    expect(resultado.personas[0].netoCentimos).toBeNull();
    expect(resultado.bloqueosDelMes).toContain("Fuente externa pendiente: Retención de quinta categoría.");
  });

  it("C22 el neto negativo con céntimos se muestra con signo y céntimos exactos", () => {
    const resultado = primera({ condiciones: condiciones("r1", 100000), importes: [adelanto(120050)] });
    expect(resultado.netoCentimos).toBeNull();
    expect(resultado.bloqueos.some((bloqueo) => bloqueo.includes("Neto negativo: S/ −200,50"))).toBe(true);
  });
});
