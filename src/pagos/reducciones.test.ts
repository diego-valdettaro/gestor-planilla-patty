import { describe, expect, it } from "vitest";

import { calcularBorrador, type EntradaDeBorrador } from "./calcular-borrador";

// Ejemplos independientes (issue #123, fuentes/ejemplos-independientes.json): sueldo S/ 1.800,00, jornada de 480 min,
// valor día 6000 céntimos, redondeo mitad arriba por línea.
const mes = "2026-10";
const fecha = "2026-10-06";
const ana = { id: "r1", dni: "12345678", nombre: "Ana", grupo: "Taller", ingreso: "2026-01-01", cese: null, ingresoConfirmado: true, ceseConfirmado: false };

const condiciones: EntradaDeBorrador["condiciones"] = [
  { relacionId: "r1", dato: "sueldo", valor: 180000, vigenteDesde: "2026-01-01" },
  { relacionId: "r1", dato: "jornada_ordinaria_diaria", valor: 480, vigenteDesde: "2026-01-01" },
  { relacionId: "r1", dato: "elegibilidad_familiar", valor: false, vigenteDesde: "2026-01-01" },
  { relacionId: "r1", dato: "regimen_laboral", valor: "general", vigenteDesde: "2026-01-01" },
  { relacionId: "r1", dato: "afiliacion_pensionaria", valor: "onp", vigenteDesde: "2026-01-01" },
  { relacionId: "r1", dato: "sede_de_adscripcion", valor: "Taller", vigenteDesde: "2026-01-01" },
];

function hecho(parcial: Record<string, unknown> = {}) {
  return {
    dni: ana.dni, fecha, grupo: "Taller", sede: "Lima", horarioAplicado: { entradaProgramada: "09:00", salidaProgramada: "18:00" },
    resultado: "trabajada" as const, minutosTrabajados: 480, tardanza: null, horaExtra: null, diaEspecial: null,
    evidencia: { asistenciaId: `a-${fecha}`, turnoPublicadoId: `t-${fecha}` }, ...parcial,
  };
}

function calcular(hechos: unknown[], parcial: Record<string, unknown> = {}) {
  return calcularBorrador({
    mesDePago: mes, corte: { inicio: "2026-09-26", fin: "2026-10-25" }, relaciones: [ana], condiciones,
    // Reglas sintéticas completas: estas pruebas aíslan goce/reducciones, no faltantes de aportes (#126).
    reglas: [
      { codigo: "onp_tasa", valor: 1300, vigenteDesde: "2026-01-01" },
      { codigo: "essalud_tasa", valor: 900, vigenteDesde: "2026-01-01" },
      { codigo: "essalud_base_minima", valor: 100000, vigenteDesde: "2026-01-01" },
    ], problemasDelCorte: [],
    revisiones: [], hechosPorDni: { [ana.dni]: hechos }, sustitutorios: [], hechosDeOrigenPorDni: {}, fuentesPendientes: [], importes: [],
    diasDeVacaciones: {}, abonosVacacionales: [], vacacionesProvisionales: false, ...parcial,
  } as EntradaDeBorrador);
}

const reducciones = (resultado: ReturnType<typeof calcularBorrador>, indice = 0) =>
  resultado.personas[indice].lineas.filter((linea) => linea.concepto.startsWith("reduccion_por_"));

describe("reducción por tardanza real", () => {
  const tarde = (minutos: number, minutosPenalizados = 0) => hecho({ tardanza: { minutos, minutosPenalizados, politicaVersion: 1 } });

  it("CA-01 una tardanza real de 15 min reduce S/ 1,88", () => {
    expect(reducciones(calcular([tarde(15)]))).toMatchObject([{ concepto: "reduccion_por_tardanza", importeCentimos: 188 }]);
  });

  it("CA-02 una tardanza real de 30 min reduce S/ 3,75", () => {
    expect(reducciones(calcular([tarde(30)]))).toMatchObject([{ concepto: "reduccion_por_tardanza", importeCentimos: 375 }]);
  });

  it("CA-03 los minutos penalizados disciplinarios no restan dinero", () => {
    const lineas = reducciones(calcular([tarde(15, 60)]));
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ concepto: "reduccion_por_tardanza", importeCentimos: 188 });
  });
});

describe("reducción por falta y por descanso semanal", () => {
  const falta = (dia: string) => hecho({ fecha: dia, resultado: "falta", minutosTrabajados: 0, horarioAplicado: { entradaProgramada: "09:00", salidaProgramada: "18:00" },
    evidencia: { asistenciaId: `a-${dia}`, turnoPublicadoId: `t-${dia}` } });
  const de = (resultado: ReturnType<typeof calcularBorrador>, concepto: string) => reducciones(resultado).filter((linea) => linea.concepto === concepto);

  it("CA-04 una falta de un día reduce S/ 60,00", () => {
    expect(de(calcular([falta(fecha)]), "reduccion_por_falta")).toMatchObject([{ importeCentimos: 6000 }]);
  });

  it("CA-05 la misma falta reduce S/ 2,00 del descanso semanal en una línea aparte, sin duplicar el día", () => {
    const resultado = calcular([falta(fecha)]);
    expect(de(resultado, "reduccion_por_descanso_semanal")).toMatchObject([{ importeCentimos: 200 }]);
    expect(de(resultado, "reduccion_por_falta")).toMatchObject([{ importeCentimos: 6000 }]);
    expect(reducciones(resultado)).toHaveLength(2);
  });

  it("CA-06 dos faltas en fechas distintas cuentan cada día una sola vez", () => {
    const resultado = calcular([falta("2026-10-06"), falta("2026-10-07")]);
    expect(de(resultado, "reduccion_por_falta")).toMatchObject([{ fecha: "2026-10-06", importeCentimos: 6000 }, { fecha: "2026-10-07", importeCentimos: 6000 }]);
    expect(de(resultado, "reduccion_por_descanso_semanal")).toMatchObject([{ fecha: "2026-10-06", importeCentimos: 200 }, { fecha: "2026-10-07", importeCentimos: 200 }]);
  });
});

describe("permisos y suspensiones según su clasificación de goce", () => {
  const beto = { ...ana, id: "r2", dni: "87654321", nombre: "Beto" };
  const condicionesDeBeto = condiciones.map((condicion) => ({ ...condicion, relacionId: "r2" }));
  const clasificacion = (dni: string, conGoce: boolean, dia = fecha) => ({ dni, fecha: dia, conGoce, clasificadoPorId: "fin-1", clasificadoEn: new Date("2026-10-10T15:00:00Z") });
  const ausencia = (dni: string, resultado: "permiso" | "suspension", dia = fecha) => hecho({ dni, fecha: dia, resultado, minutosTrabajados: 0,
    evidencia: { asistenciaId: `a-${dni}-${dia}`, turnoPublicadoId: `t-${dni}-${dia}` } });
  const calcularDos = (hechosPorDni: Record<string, unknown[]>, clasificaciones: unknown[]) =>
    calcular([], { relaciones: [ana, beto], condiciones: [...condiciones, ...condicionesDeBeto], hechosPorDni, clasificacionesDeGoce: clasificaciones });
  const porPersona = (resultado: ReturnType<typeof calcularBorrador>, dni: string) => resultado.personas.findIndex(({ relacion }) => relacion.dni === dni);

  it.each(["permiso", "suspension"] as const)("CA-07 un %s sin goce reduce S/ 60,00 el día y S/ 2,00 el descanso semanal", (motivo) => {
    const resultado = calcular([ausencia(ana.dni, motivo)], { clasificacionesDeGoce: [clasificacion(ana.dni, false)] });
    expect(reducciones(resultado)).toMatchObject([{ concepto: "reduccion_por_ausencia_sin_goce", importeCentimos: 6000 }, { concepto: "reduccion_por_descanso_semanal", importeCentimos: 200 }]);
    expect(resultado.personas[0].bloqueos).toEqual([]);
  });

  it.each(["permiso", "suspension"] as const)("CA-08 un %s con goce no reduce, a diferencia del mismo día sin goce", (motivo) => {
    const resultado = calcularDos(
      { [ana.dni]: [ausencia(ana.dni, motivo)], [beto.dni]: [ausencia(beto.dni, motivo)] },
      [clasificacion(ana.dni, true), clasificacion(beto.dni, false)],
    );
    const conGoce = porPersona(resultado, ana.dni);
    const sinGoce = porPersona(resultado, beto.dni);
    expect(reducciones(resultado, conGoce)).toEqual([]);
    expect(resultado.personas[conGoce].bloqueos).toEqual([]);
    expect(reducciones(resultado, sinGoce).map((linea) => linea.importeCentimos)).toEqual([6000, 200]);
  });

  it.each(["permiso", "suspension"] as const)("CA-09 un %s sin clasificar no reduce y bloquea a la persona", (motivo) => {
    const resultado = calcular([ausencia(ana.dni, motivo)]);
    expect(reducciones(resultado)).toEqual([]);
    expect(resultado.personas[0].bloqueos).toEqual([expect.stringMatching(/2026-10-06.*goce|goce.*2026-10-06/)]);
  });

  it("CA-10 el bloqueo por clasificación pendiente afecta solo a esa persona", () => {
    const resultado = calcularDos({ [ana.dni]: [ausencia(ana.dni, "permiso")], [beto.dni]: [hecho({ dni: beto.dni, resultado: "falta", minutosTrabajados: 0 })] }, []);
    const pendiente = porPersona(resultado, ana.dni);
    const conFalta = porPersona(resultado, beto.dni);
    expect(resultado.personas[pendiente].bloqueos).toHaveLength(1);
    expect(reducciones(resultado, pendiente)).toEqual([]);
    expect(resultado.personas[conFalta].bloqueos).toEqual([]);
    expect(reducciones(resultado, conFalta).map((linea) => linea.importeCentimos)).toEqual([6000, 200]);
  });
});

describe("trazabilidad de las reducciones", () => {
  it("CA-11 cada reducción apunta a la fecha y a la evidencia de su jornada de Asistencia", () => {
    const evidencia = { asistenciaId: "a-ref", turnoPublicadoId: "t-ref" };
    const resultado = calcular([
      hecho({ fecha: "2026-10-06", tardanza: { minutos: 15, minutosPenalizados: 0, politicaVersion: 1 }, evidencia }),
      hecho({ fecha: "2026-10-07", resultado: "falta", minutosTrabajados: 0, evidencia: { ...evidencia, asistenciaId: "a-falta" } }),
    ]);
    expect(reducciones(resultado)).toMatchObject([
      { concepto: "reduccion_por_tardanza", fecha: "2026-10-06", evidencia },
      { concepto: "reduccion_por_falta", fecha: "2026-10-07", evidencia: { ...evidencia, asistenciaId: "a-falta" } },
      { concepto: "reduccion_por_descanso_semanal", fecha: "2026-10-07", evidencia: { ...evidencia, asistenciaId: "a-falta" } },
    ]);
  });

  it("CA-12 la reducción de un permiso sin goce lleva la decisión de goce, su actor y su fecha", () => {
    const clasificadoEn = new Date("2026-10-10T15:00:00Z");
    const evidencia = { asistenciaId: "a-perm", turnoPublicadoId: "t-perm" };
    const resultado = calcular([hecho({ resultado: "permiso", minutosTrabajados: 0, evidencia })],
      { clasificacionesDeGoce: [{ dni: ana.dni, fecha, conGoce: false, clasificadoPorId: "fin-1", clasificadoEn }] });
    const decision = { conGoce: false, clasificadoPorId: "fin-1", clasificadoEn };
    expect(reducciones(resultado)).toMatchObject([
      { concepto: "reduccion_por_ausencia_sin_goce", fecha, evidencia, decision },
      { concepto: "reduccion_por_descanso_semanal", fecha, evidencia, decision },
    ]);
  });
});
