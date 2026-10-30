import { describe, expect, it } from "vitest";

import type { HechoDiarioDeAsistencia } from "@/periodos/hechos-para-pagos";
import { calcularBorrador, type EntradaDeBorrador } from "./calcular-borrador";

const mes = "2026-02";
const relacion = { id: "r1", dni: "12345678", nombre: "Ana", grupo: "Taller", ingreso: "2026-02-01", cese: null as string | null, ingresoConfirmado: true, ceseConfirmado: false };
const fijo = (valor: number, vigenteDesde = "2026-01-01") => ({ relacionId: "r1", dato: "movilidad_fija", valor, vigenteDesde } as unknown as EntradaDeBorrador["condiciones"][number]);
const falta: HechoDiarioDeAsistencia = {
  dni: relacion.dni, fecha: "2026-02-03", grupo: "Taller", sede: "Taller", horarioAplicado: { entradaProgramada: "09:00", salidaProgramada: "18:00" },
  resultado: "falta", minutosTrabajados: 0, tardanza: null, horaExtra: null, diaEspecial: null,
  evidencia: { asistenciaId: "a-1", turnoPublicadoId: "t-1" },
};
function entrada(parcial: Partial<EntradaDeBorrador> = {}): EntradaDeBorrador {
  return { mesDePago: mes, corte: { inicio: "2026-01-26", fin: "2026-02-25" }, relaciones: [relacion],
    condiciones: [{ relacionId: "r1", dato: "sueldo", valor: 150000, vigenteDesde: "2026-01-01" }],
    reglas: [], problemasDelCorte: [], revisiones: [], hechosPorDni: {}, sustitutorios: [], hechosDeOrigenPorDni: {},
    fuentesPendientes: [], importes: [], diasDeVacaciones: {}, abonosVacacionales: [], vacacionesProvisionales: false, ...parcial };
}
type ResultadoMovilidad = { movilidadFijaPendiente?: { tramos: Array<{ importeCentimos: number }> } };

describe("G01 movilidad fija mensual", () => {
  const casos = [
    { fila: "R01", fin: "2026-02-14", importes: [fijo(28000)], hechos: [], esperado: [14000] },
    { fila: "R02", fin: null, importes: [fijo(28000), fijo(56000, "2026-02-15")], hechos: [], esperado: [14000, 28000] },
    { fila: "R03", fin: null, importes: [fijo(28000)], hechos: [falta], esperado: [28000] },
    { fila: "R04", fin: "2026-02-14", importes: [fijo(100)], hechos: [], esperado: [50] },
  ];
  it.each(casos)("$fila calcula tramos por días de relación y vigencias", ({ fin, importes, hechos, esperado }) => {
    const resultado = calcularBorrador(entrada({ relaciones: [{ ...relacion, cese: fin, ceseConfirmado: fin !== null }],
      condiciones: [...entrada().condiciones, ...importes], hechosPorDni: { [relacion.dni]: hechos } })).personas[0] as unknown as ResultadoMovilidad;
    expect(resultado.movilidadFijaPendiente?.tramos.map((tramo) => tramo.importeCentimos)).toEqual(esperado);
  });
});

describe("G02 clasificación pendiente y ausencia de duplicación", () => {
  const casos = [
    { fila: "R05", importes: [fijo(28000)], fuentesPendientes: [], esperado: "clasificación" },
    { fila: "R06", importes: [fijo(28000)], fuentesPendientes: [], esperado: "clasificación" },
    { fila: "R07", importes: [], fuentesPendientes: [], esperado: "movilidad" },
  ];
  it.each(casos)("$fila no finaliza cuando falta el dato o su clasificación", ({ importes, fuentesPendientes, esperado }) => {
    const persona = calcularBorrador(entrada({ condiciones: [...entrada().condiciones, ...importes], fuentesPendientes })).personas[0] as unknown as ResultadoMovilidad & { bloqueos: string[]; netoCentimos: number | null; lineas: Array<{ concepto: string }> };
    expect(persona.bloqueos.join(" ").toLocaleLowerCase("es")).toContain(esperado);
    expect(persona.netoCentimos).toBeNull();
    if (importes.length) {
      expect(persona.movilidadFijaPendiente?.tramos).toHaveLength(1);
      expect(persona.lineas.filter(({ concepto }) => concepto === "movilidad_supeditada_a_asistencia")).toHaveLength(0);
    } else {
      const cero = calcularBorrador(entrada({ condiciones: [...entrada().condiciones, fijo(0)] })).personas[0];
      expect(cero.bloqueos.join(" ").toLocaleLowerCase("es")).not.toContain("movilidad");
    }
  });
});

function entradaCompleta(monto: number): EntradaDeBorrador {
  return entrada({
    condiciones: [
      { relacionId: "r1", dato: "sueldo", valor: 200000, vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "jornada_ordinaria_diaria", valor: 480, vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "regimen_laboral", valor: "general", vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "afiliacion_pensionaria", valor: "onp", vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "elegibilidad_familiar", valor: false, vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "sede_de_adscripcion", valor: "Taller", vigenteDesde: "2026-01-01" },
      fijo(monto),
    ],
    reglas: [
      { codigo: "onp_tasa", valor: 1300, vigenteDesde: "2026-01-01" },
      { codigo: "essalud_tasa", valor: 900, vigenteDesde: "2026-01-01" },
      { codigo: "essalud_base_minima", valor: 100000, vigenteDesde: "2026-01-01" },
    ],
  });
}

describe("G26 coexistencia de movilidades diferentes", () => {
  it("R54 conserva un único tramo fijo y una única línea de movilidad supeditada", () => {
    const datos = entradaCompleta(28000);
    datos.importes = [{ id: "m1", nombre: "Ana", dni: relacion.dni, concepto: "movilidad_supeditada_a_asistencia", tipoDeFuente: "movilidad_supeditada_a_asistencia", fechaDelHecho: "2026-02-05", mesDeDevengue: mes, mesDeAplicacion: mes, monto: 12000,
      procedencia: "carga_manual", registradoPorId: "f1", registradoPor: "Finanzas", registradoEn: new Date("2026-02-06T00:00:00Z"), anuladoEn: null, motivoDeAnulacion: null, importacionId: null, estadoDeIncidencia: null, sustento: null, autorizadoPor: null, fechaDeAutorizacion: null, conceptoAjustado: null, sentidoAjuste: null, motivoDeAjuste: null }];
    const persona = calcularBorrador(datos).personas[0];
    expect(persona.movilidadFijaPendiente.tramos.map((t) => t.importeCentimos)).toEqual([28000]);
    expect(persona.lineas.filter((l) => l.concepto === "movilidad_supeditada_a_asistencia").map((l) => l.importeCentimos)).toEqual([12000]);
    expect(persona.netoCentimos).toBeNull();
    expect(persona.bloqueos.join(" ")).toContain("clasificación contable de movilidad fija");
  });
});

describe("G27 bloqueo causado por clasificación del bono fijo", () => {
  it("R55 bono positivo bloquea y cero explícito permite calcular", () => {
    const positivo = calcularBorrador(entradaCompleta(28000)).personas[0];
    const cero = calcularBorrador(entradaCompleta(0)).personas[0];
    expect(positivo.bloqueos).toEqual([expect.stringContaining("clasificación contable de movilidad fija")]);
    expect(positivo.netoCentimos).toBeNull();
    expect(cero.bloqueos).toEqual([]);
    expect(cero.netoCentimos).toEqual(expect.any(Number));
  });
});
