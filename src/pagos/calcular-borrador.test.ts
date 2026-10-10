import { describe, expect, it } from "vitest";

import type { ImporteExterno } from "@/fuentes-externas/gestionar-fuentes-externas";

import { calcularBorrador, type EntradaDeBorrador, type LineaDeBorrador } from "./calcular-borrador";

const mes = "2026-10";
const persona = { id: "r1", dni: "12345678", nombre: "Ana", grupo: "Taller", ingreso: "2026-01-01", cese: null, ingresoConfirmado: true, ceseConfirmado: false };

function entrada(parcial: Partial<EntradaDeBorrador> = {}): EntradaDeBorrador {
  return {
    mesDePago: mes,
    corte: { inicio: "2026-09-26", fin: "2026-10-25" },
    relaciones: [persona],
    condiciones: [{ relacionId: "r1", dato: "sueldo", valor: 300001, vigenteDesde: "2026-01-01" }],
    reglas: [],
    problemasDelCorte: [],
    revisiones: [],
    hechosPorDni: {},
    fuentesPendientes: [],
    importes: [],
    diasDeVacaciones: {},
    abonosVacacionales: [],
    vacacionesProvisionales: false,
    ...parcial,
  };
}

describe("borrador de sueldo", () => {
  it("usa divisor 30 y el día 31 no crea sueldo adicional", () => {
    const resultado = calcularBorrador(entrada());
    expect(resultado.personas[0].lineas[0].importeCentimos).toBe(300001);
    expect(resultado.personas[0].lineas[0].dias).toBe(30);
    expect(calcularBorrador(entrada())).toEqual(resultado);
  });

  it("prorratea un cambio de sueldo y redondea cada tramo mitad arriba", () => {
    const resultado = calcularBorrador(entrada({ condiciones: [
      { relacionId: "r1", dato: "sueldo", valor: 10001, vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "sueldo", valor: 20001, vigenteDesde: "2026-10-16" },
    ] }));
    expect(resultado.personas[0].lineas.map((linea) => linea.importeCentimos)).toEqual([5001, 10001]);
  });

  it("un cambio de sueldo el día 31 no añade un día pagado", () => {
    const resultado = calcularBorrador(entrada({ condiciones: [
      { relacionId: "r1", dato: "sueldo", valor: 300000, vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "sueldo", valor: 330000, vigenteDesde: "2026-10-31" },
    ] }));
    expect(resultado.personas[0].lineas.map((linea) => linea.importeCentimos)).toEqual([300000]);
  });

  it("un ingreso el día 31 conserva un día devengado para el siguiente pago", () => {
    const siguiente = calcularBorrador(entrada({ mesDePago: "2026-11", relaciones: [{ ...persona, ingreso: "2026-10-31" }] }));
    expect(siguiente.personas[0].lineas[0]).toMatchObject({ dias: 1, mesDeDevengue: "2026-10" });
  });

  it("un cambio de sueldo en febrero conserva los 30 días convencionales", () => {
    const resultado = calcularBorrador(entrada({ mesDePago: "2026-02", condiciones: [
      { relacionId: "r1", dato: "sueldo", valor: 300000, vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "sueldo", valor: 330000, vigenteDesde: "2026-02-16" },
    ] }));
    expect(resultado.personas[0].lineas.map(({ dias }) => dias)).toEqual([15, 15]);
  });

  it("pasa un ingreso posterior al 25 al siguiente pago sin mover su devengue", () => {
    const relacion = { ...persona, ingreso: "2026-10-27" };
    expect(calcularBorrador(entrada({ relaciones: [relacion] })).personas).toEqual([]);
    const siguiente = calcularBorrador(entrada({ mesDePago: "2026-11", relaciones: [relacion] }));
    expect(siguiente.personas[0].lineas[0]).toMatchObject({ mesDePago: "2026-11", mesDeDevengue: "2026-10" });
  });

  it("separa dato faltante y cobertura incompleta del cero, sin neto definitivo", () => {
    const resultado = calcularBorrador(entrada({ condiciones: [], problemasDelCorte: ["Falta cobertura del corte."] }));
    expect(resultado.personas[0].netoCentimos).toBeNull();
    expect(resultado.personas[0].bloqueos.some((texto) => texto.includes("sueldo"))).toBe(true);
    expect(resultado.bloqueosDelMes).toContain("Falta cobertura del corte.");
  });
});

describe("sobretiempo del borrador", () => {
  const hecho = (fecha: string, minutosAl25: number, minutosAl35: number, estado: "aprobada" | "pendiente" | "descartada" = "aprobada") => ({
    dni: persona.dni, fecha, grupo: "Taller", sede: "Lima", horarioAplicado: { entradaProgramada: "09:00", salidaProgramada: "18:00" },
    resultado: "trabajada" as const, minutosTrabajados: 540, tardanza: null,
    horaExtra: { estado, minutosAl25, minutosAl35, trabajoNocturno: false, causaDeDescarte: estado === "descartada" ? "marca_erronea" as const : null },
    diaEspecial: null, evidencia: { asistenciaId: `a-${fecha}`, turnoPublicadoId: `t-${fecha}` },
  });

  it("valora fracciones por línea con jornada pactada y base ordinaria computable", () => {
    const fecha = "2026-10-02";
    const resultado = calcularBorrador(entrada({
      condiciones: [
        { relacionId: "r1", dato: "sueldo", valor: 300000, vigenteDesde: "2026-01-01" },
        { relacionId: "r1", dato: "jornada_ordinaria_diaria", valor: 360, vigenteDesde: "2026-01-01" },
        { relacionId: "r1", dato: "regimen_laboral", valor: "remype_pequena_empresa", vigenteDesde: "2026-01-01" },
        { relacionId: "r1", dato: "elegibilidad_familiar", valor: true, vigenteDesde: "2026-01-01" },
      ],
      reglas: [
        { codigo: "rmv", valor: 100000, vigenteDesde: "2026-01-01" },
        { codigo: "asignacion_familiar_porcentaje_de_rmv", valor: 1000, vigenteDesde: "2026-01-01" },
        { codigo: "horas_extra_sobretasa_primeras_dos_horas", valor: 2500, vigenteDesde: "2026-01-01" },
        { codigo: "horas_extra_sobretasa_horas_posteriores", valor: 3500, vigenteDesde: "2026-01-01" },
      ],
      hechosPorDni: { [persona.dni]: [hecho(fecha, 90.5, 30.25)] },
      importes: [{ id: "com-1", nombre: "Ana", dni: persona.dni, concepto: "comision_de_ventas", tipoDeFuente: "comisiones_de_ventas",
        fechaDelHecho: fecha, mesDeDevengue: "2026-10", mesDeAplicacion: "2026-10", monto: 50000,
        procedencia: "carga_manual", registradoPorId: "f-1", registradoPor: "Finanzas", registradoEn: new Date("2026-10-03T00:00:00Z"),
        anuladoEn: null, motivoDeAnulacion: null, importacionId: null, estadoDeIncidencia: null, sustento: null,
        autorizadoPor: null, fechaDeAutorizacion: null, conceptoAjustado: null, sentidoAjuste: null, motivoDeAjuste: null }],
    }));
    expect(resultado.personas[0].lineas.filter((linea) => linea.concepto.startsWith("horas_extra"))).toMatchObject([
      { concepto: "horas_extra_25", importeCentimos: 3247, minutos: 90.5, remuneracionOrdinariaComputableCentimos: 310000, jornadaOrdinariaDiariaMinutos: 360 },
      { concepto: "horas_extra_35", importeCentimos: 1172, minutos: 30.25, remuneracionOrdinariaComputableCentimos: 310000, jornadaOrdinariaDiariaMinutos: 360 },
    ]);
  });

  it("deja pendientes sin pagar, ignora descartadas y bloquea trabajo nocturno", () => {
    const nocturno = hecho("2026-10-03", 30, 0);
    nocturno.horaExtra.trabajoNocturno = true;
    const marcaErronea = hecho("2026-10-02", 15, 0, "descartada");
    marcaErronea.horaExtra.trabajoNocturno = true;
    const resultado = calcularBorrador(entrada({ hechosPorDni: { [persona.dni]: [
      hecho("2026-10-01", 15, 0, "pendiente"), marcaErronea, nocturno,
    ] } }));
    expect(resultado.personas[0].lineas.filter((linea) => linea.concepto.startsWith("horas_extra"))).toEqual([]);
    expect(resultado.personas[0].bloqueos).toEqual(expect.arrayContaining([
      expect.stringContaining("horas extra pendientes"), expect.stringContaining("22:00 y 06:00"),
    ]));
    expect(resultado.personas[0].bloqueos.some((bloqueo) => bloqueo.includes("2026-10-02"))).toBe(false);
  });

  it("no suma asignación familiar sin beneficio otorgado, cualquiera sea el régimen", () => {
    const resultado = calcularBorrador(entrada({
      condiciones: [
        { relacionId: "r1", dato: "sueldo", valor: 300000, vigenteDesde: "2026-01-01" },
        { relacionId: "r1", dato: "jornada_ordinaria_diaria", valor: 360, vigenteDesde: "2026-01-01" },
        { relacionId: "r1", dato: "regimen_laboral", valor: "general", vigenteDesde: "2026-01-01" },
        { relacionId: "r1", dato: "elegibilidad_familiar", valor: false, vigenteDesde: "2026-01-01" },
      ],
      reglas: [{ codigo: "horas_extra_sobretasa_primeras_dos_horas", valor: 2500, vigenteDesde: "2026-01-01" }],
      hechosPorDni: { [persona.dni]: [hecho("2026-10-02", 60, 0)] },
    }));
    expect(resultado.personas[0].lineas.find((linea) => linea.concepto === "horas_extra_25"))
      .toMatchObject({ importeCentimos: 2083, remuneracionOrdinariaComputableCentimos: 300000 });
  });
});

describe("vacaciones entre meses", () => {
  const sueldo = 300000;
  const rango = (desde: string, hasta: string) => {
    const fechas: string[] = [];
    for (let instante = Date.parse(`${desde}T00:00:00Z`); instante <= Date.parse(`${hasta}T00:00:00Z`); instante += 86_400_000) fechas.push(new Date(instante).toISOString().slice(0, 10));
    return fechas;
  };
  const abono = (parcial: Partial<ImporteExterno> = {}): ImporteExterno => ({
    id: "ab-1", nombre: "Ana", dni: persona.dni, concepto: "abono_anticipado_de_remuneracion_vacacional", tipoDeFuente: "abonos_vacacionales",
    fechaDelHecho: "2026-09-28", mesDeDevengue: "2026-09", mesDeAplicacion: "2026-09", monto: 30000,
    procedencia: "carga_manual", registradoPorId: "f-1", registradoPor: "Finanzas", registradoEn: new Date("2026-09-28T00:00:00Z"),
    anuladoEn: null, motivoDeAnulacion: null, importacionId: null, estadoDeIncidencia: null, sustento: null,
    autorizadoPor: null, fechaDeAutorizacion: null, conceptoAjustado: null, sentidoAjuste: null, motivoDeAjuste: null, ...parcial,
  });
  const septiembre = { mesDePago: "2026-09", corte: { inicio: "2026-08-26", fin: "2026-09-25" } };
  const lineas = (resultado: ReturnType<typeof calcularBorrador>, concepto: LineaDeBorrador["concepto"]) => resultado.personas[0].lineas.filter((linea) => linea.concepto === concepto);
  const total = (resultado: ReturnType<typeof calcularBorrador>) => resultado.personas[0].lineas.reduce((suma, linea) => suma + linea.importeCentimos, 0);
  const referencia = rango("2026-09-29", "2026-10-04");
  const condiciones = [{ relacionId: "r1", dato: "sueldo" as const, valor: sueldo, vigenteDesde: "2026-01-01" }];

  it("caso de referencia en octubre: 4 días de octubre reclasifican el sueldo y el total no sube", () => {
    const resultado = calcularBorrador(entrada({ condiciones, diasDeVacaciones: { [persona.dni]: referencia }, abonosVacacionales: [abono()] }));
    expect(lineas(resultado, "remuneracion_vacacional")).toMatchObject([{ importeCentimos: 40000, dias: 4, diasCalendario: 4, desde: "2026-10-01", hasta: "2026-10-04", baseSueldoCentimos: sueldo, mesDeDevengue: "2026-10", inicioDelDescanso: "2026-09-29" }]);
    expect(lineas(resultado, "sueldo_basico")).toMatchObject([{ importeCentimos: 260000, dias: 26 }]);
    expect(total(resultado)).toBe(sueldo);
    expect(resultado.personas[0].sueldoCalculadoCentimos).toBe(sueldo);
  });

  it("caso de referencia en septiembre: 2 días de septiembre, con el mismo desglose del descanso", () => {
    const resultado = calcularBorrador(entrada({ ...septiembre, condiciones, diasDeVacaciones: { [persona.dni]: referencia }, abonosVacacionales: [abono()] }));
    expect(lineas(resultado, "remuneracion_vacacional")).toMatchObject([{ importeCentimos: 20000, dias: 2, desde: "2026-09-29", hasta: "2026-09-30" }]);
    expect(lineas(resultado, "sueldo_basico")).toMatchObject([{ importeCentimos: 280000, dias: 28 }]);
    expect(total(resultado)).toBe(sueldo);
  });

  it("el abono se asigna a ambos meses por días calendario y reduce cada saldo una sola vez, también cuando se paga en otro mes", () => {
    const resultado = calcularBorrador(entrada({ condiciones, diasDeVacaciones: { [persona.dni]: referencia }, abonosVacacionales: [abono()] }));
    const [descanso] = resultado.personas[0].vacaciones;
    expect(descanso).toMatchObject({ inicio: "2026-09-29", fin: "2026-10-04", dias: 6 });
    expect(descanso.meses).toEqual([
      { mes: "2026-09", diasDeDescanso: 2, diasConvencionales: 2, remuneracionCentimos: 20000, abonosAsignadosCentimos: 10000, saldoCentimos: 10000 },
      { mes: "2026-10", diasDeDescanso: 4, diasConvencionales: 4, remuneracionCentimos: 40000, abonosAsignadosCentimos: 20000, saldoCentimos: 20000 },
    ]);
    expect(descanso.abonos).toMatchObject([{ id: "ab-1", fechaDelAbono: "2026-09-28", importeCentimos: 30000, mesDeAplicacion: "2026-09", asignaciones: [{ mes: "2026-09", centimos: 10000 }, { mes: "2026-10", centimos: 20000 }] }]);
    expect(descanso.meses.reduce((suma, fila) => suma + fila.abonosAsignadosCentimos, 0)).toBe(30000);
    expect(resultado.personas[0].bloqueos.filter((bloqueo) => bloqueo.includes("abono"))).toEqual([]);
  });

  it("los céntimos sobrantes del abono van al último mes y dos abonos del mismo descanso se suman", () => {
    const resultado = calcularBorrador(entrada({ condiciones, diasDeVacaciones: { [persona.dni]: referencia }, abonosVacacionales: [
      abono({ monto: 10001 }), abono({ id: "ab-2", fechaDelHecho: "2026-09-27", monto: 20000, mesDeDevengue: "2026-09" }),
    ] }));
    const [descanso] = resultado.personas[0].vacaciones;
    expect(descanso.meses.map(({ abonosAsignadosCentimos }) => abonosAsignadosCentimos)).toEqual([3333 + 6666, 6668 + 13334]);
  });

  it("sin abono el saldo es toda la remuneración vacacional del mes", () => {
    const resultado = calcularBorrador(entrada({ condiciones, diasDeVacaciones: { [persona.dni]: referencia } }));
    expect(resultado.personas[0].vacaciones[0].meses.map(({ saldoCentimos, remuneracionCentimos }) => [saldoCentimos, remuneracionCentimos])).toEqual([[20000, 20000], [40000, 40000]]);
  });

  it("mes de 31 días: el día 31 de vacaciones no crea sueldo adicional", () => {
    const resultado = calcularBorrador(entrada({ condiciones, diasDeVacaciones: { [persona.dni]: rango("2026-10-28", "2026-10-31") } }));
    expect(lineas(resultado, "remuneracion_vacacional")).toMatchObject([{ importeCentimos: 30000, dias: 3, diasCalendario: 4 }]);
    expect(lineas(resultado, "sueldo_basico")).toMatchObject([{ dias: 27, importeCentimos: 270000 }]);
    expect(total(resultado)).toBe(sueldo);
    expect(resultado.personas[0].vacaciones[0].meses[0]).toMatchObject({ diasDeDescanso: 4, diasConvencionales: 3 });
  });

  it("mes de 30 días: todo el mes de vacaciones paga lo mismo que el sueldo", () => {
    const resultado = calcularBorrador(entrada({ ...septiembre, condiciones, diasDeVacaciones: { [persona.dni]: rango("2026-09-01", "2026-09-30") } }));
    expect(lineas(resultado, "sueldo_basico")).toEqual([]);
    expect(total(resultado)).toBe(sueldo);
  });

  it("mes de 28 días: febrero completa los 30 días convencionales sin sueldo adicional", () => {
    const febrero = { mesDePago: "2027-02", corte: { inicio: "2027-01-26", fin: "2027-02-25" } };
    const resultado = calcularBorrador(entrada({ ...febrero, condiciones, diasDeVacaciones: { [persona.dni]: rango("2027-02-25", "2027-02-28") } }));
    expect(lineas(resultado, "remuneracion_vacacional")).toMatchObject([{ dias: 6, diasCalendario: 4, importeCentimos: 60000 }]);
    expect(total(resultado)).toBe(sueldo);
  });

  it("un descanso que cruza el fin de año se divide entre diciembre y enero", () => {
    const diciembre = { mesDePago: "2026-12", corte: { inicio: "2026-11-26", fin: "2026-12-25" } };
    const resultado = calcularBorrador(entrada({ ...diciembre, condiciones, diasDeVacaciones: { [persona.dni]: rango("2026-12-28", "2027-01-03") } }));
    expect(resultado.personas[0].vacaciones[0].meses.map(({ mes, diasDeDescanso }) => [mes, diasDeDescanso])).toEqual([["2026-12", 4], ["2027-01", 3]]);
    expect(total(resultado)).toBe(sueldo);
  });

  it("una variación de sueldo durante el descanso deja un ajuste trazable y el total sigue siendo el del sueldo vigente", () => {
    const resultado = calcularBorrador(entrada({ diasDeVacaciones: { [persona.dni]: referencia }, condiciones: [
      { relacionId: "r1", dato: "sueldo", valor: 300000, vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "sueldo", valor: 330000, vigenteDesde: "2026-10-03" },
    ] }));
    expect(lineas(resultado, "remuneracion_vacacional").map((linea) => linea.importeCentimos)).toEqual([20000, 20000]);
    expect(lineas(resultado, "ajuste_por_variacion_de_sueldo_en_vacaciones")).toMatchObject([{
      importeCentimos: 2000, dias: 2, desde: "2026-10-03", hasta: "2026-10-04", baseSueldoCentimos: 300000, sueldoVigenteCentimos: 330000,
      inicioDelDescanso: "2026-09-29", mesDeDevengue: "2026-10", origen: "Variación de sueldo durante el descanso",
    }]);
    expect(total(resultado)).toBe(20000 + 308000);
  });

  it("si el sueldo baja durante el descanso el ajuste es negativo", () => {
    const resultado = calcularBorrador(entrada({ diasDeVacaciones: { [persona.dni]: referencia }, condiciones: [
      { relacionId: "r1", dato: "sueldo", valor: 300000, vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "sueldo", valor: 270000, vigenteDesde: "2026-10-03" },
    ] }));
    expect(lineas(resultado, "ajuste_por_variacion_de_sueldo_en_vacaciones")).toMatchObject([{ importeCentimos: -2000 }]);
  });

  it("un cambio de sueldo anterior al descanso no genera ajuste", () => {
    const resultado = calcularBorrador(entrada({ diasDeVacaciones: { [persona.dni]: referencia }, condiciones: [
      { relacionId: "r1", dato: "sueldo", valor: 300000, vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "sueldo", valor: 330000, vigenteDesde: "2026-09-15" },
    ] }));
    expect(lineas(resultado, "ajuste_por_variacion_de_sueldo_en_vacaciones")).toEqual([]);
    expect(lineas(resultado, "remuneracion_vacacional")).toMatchObject([{ baseSueldoCentimos: 330000 }]);
  });

  it("un abono sin descanso que empiece desde su fecha bloquea a la persona en su mes de aplicación", () => {
    const tardio = abono({ fechaDelHecho: "2026-10-05", mesDeDevengue: "2026-10", mesDeAplicacion: "2026-10" });
    const resultado = calcularBorrador(entrada({ condiciones, diasDeVacaciones: { [persona.dni]: referencia }, abonosVacacionales: [tardio] }));
    expect(resultado.personas[0].bloqueos).toContainEqual(expect.stringMatching(/abono vacacional del 05\/10\/2026.*Asistencia/));
    expect(resultado.personas[0].vacaciones[0].abonos).toEqual([]);
    const otroMes = calcularBorrador(entrada({ mesDePago: "2026-11", corte: { inicio: "2026-10-26", fin: "2026-11-25" }, condiciones, abonosVacacionales: [tardio] }));
    expect(otroMes.personas[0].bloqueos.some((bloqueo) => bloqueo.includes("abono vacacional"))).toBe(false);
  });

  it("un abono entregado antes de la ventana no se reasigna a un descanso posterior, salvo que se haya aplicado en este mes", () => {
    const noviembre = { mesDePago: "2026-11", corte: { inicio: "2026-10-26", fin: "2026-11-25" } };
    const viejo = abono({ fechaDelHecho: "2026-09-15", mesDeDevengue: "2026-09", mesDeAplicacion: "2026-09" });
    const ignorado = calcularBorrador(entrada({ ...noviembre, condiciones, diasDeVacaciones: { [persona.dni]: rango("2026-11-02", "2026-11-06") }, abonosVacacionales: [viejo] }));
    expect(ignorado.personas[0].vacaciones[0].abonos).toEqual([]);
    expect(ignorado.personas[0].bloqueos.some((bloqueo) => bloqueo.includes("abono vacacional"))).toBe(false);
    const aplicadoAqui = abono({ fechaDelHecho: "2026-09-15", mesDeDevengue: "2026-09", mesDeAplicacion: "2026-11" });
    const atado = calcularBorrador(entrada({ ...noviembre, condiciones, diasDeVacaciones: { [persona.dni]: rango("2026-11-02", "2026-11-06") }, abonosVacacionales: [aplicadoAqui] }));
    expect(atado.personas[0].vacaciones[0].abonos).toMatchObject([{ id: "ab-1", importeCentimos: 30000 }]);
  });

  it("un abono de otra relación laboral del mismo DNI no se ata a los descansos de la relación vigente", () => {
    const reingreso = { ...persona, id: "r2", ingreso: "2026-10-10" };
    const resultado = calcularBorrador(entrada({ relaciones: [reingreso], condiciones: [{ relacionId: "r2", dato: "sueldo", valor: sueldo, vigenteDesde: "2026-10-10" }],
      diasDeVacaciones: { [persona.dni]: rango("2026-10-15", "2026-10-16") }, abonosVacacionales: [abono({ fechaDelHecho: "2026-09-20", mesDeDevengue: "2026-09", mesDeAplicacion: "2026-09" })] }));
    expect(resultado.personas[0].vacaciones[0].abonos).toEqual([]);
    expect(resultado.personas[0].bloqueos.some((bloqueo) => bloqueo.includes("abono vacacional"))).toBe(false);
  });

  it("un cese confirmado recorta el descanso: no se pagan vacaciones después del último día de la relación", () => {
    const resultado = calcularBorrador(entrada({ relaciones: [{ ...persona, cese: "2026-10-02", ceseConfirmado: true }], condiciones, diasDeVacaciones: { [persona.dni]: referencia } }));
    expect(resultado.personas[0].vacaciones[0]).toMatchObject({ inicio: "2026-09-29", fin: "2026-10-02", dias: 4 });
    expect(lineas(resultado, "remuneracion_vacacional")).toMatchObject([{ dias: 2, hasta: "2026-10-02" }]);
    expect(lineas(resultado, "sueldo_basico")).toEqual([]);
  });

  it("el ingreso después del 25 arrastra al mes de pago sus vacaciones del mes anterior sin duplicar días", () => {
    const resultado = calcularBorrador(entrada({ relaciones: [{ ...persona, ingreso: "2026-09-27" }], condiciones, diasDeVacaciones: { [persona.dni]: rango("2026-09-28", "2026-10-02") } }));
    const septiembre = resultado.personas[0].lineas.filter((linea) => linea.mesDeDevengue === "2026-09");
    expect(septiembre.map((linea) => [linea.concepto, linea.importeCentimos])).toEqual([["sueldo_basico", 10000], ["remuneracion_vacacional", 30000]]);
    expect(lineas(resultado, "remuneracion_vacacional").map((linea) => linea.importeCentimos)).toEqual([30000, 20000]);
    expect(resultado.personas[0].vacaciones[0].meses.map(({ mes, diasDeDescanso }) => [mes, diasDeDescanso])).toEqual([["2026-09", 3], ["2026-10", 2]]);
    expect(total(resultado)).toBe(40000 + sueldo);
  });

  it("sin sueldo vigente al inicio del descanso bloquea y no inventa una remuneración", () => {
    const resultado = calcularBorrador(entrada({ condiciones: [{ relacionId: "r1", dato: "sueldo", valor: sueldo, vigenteDesde: "2026-10-02" }], diasDeVacaciones: { [persona.dni]: rango("2026-10-01", "2026-10-04") }, relaciones: [{ ...persona, ingreso: "2026-09-01" }] }));
    expect(resultado.personas[0].bloqueos.some((bloqueo) => bloqueo.includes("inicio del descanso"))).toBe(true);
    expect(lineas(resultado, "remuneracion_vacacional")).toEqual([]);
  });

  it("ignora vacaciones fuera de la relación laboral y las de meses que el descanso no toca", () => {
    const fuera = calcularBorrador(entrada({ condiciones, diasDeVacaciones: { [persona.dni]: referencia }, relaciones: [{ ...persona, ingreso: "2026-10-03" }] }));
    expect(fuera.personas[0].vacaciones[0].dias).toBe(2);
    const noviembre = calcularBorrador(entrada({ mesDePago: "2026-11", corte: { inicio: "2026-10-26", fin: "2026-11-25" }, condiciones, diasDeVacaciones: { [persona.dni]: referencia } }));
    expect(noviembre.personas[0].vacaciones).toEqual([]);
    expect(lineas(noviembre, "remuneracion_vacacional")).toEqual([]);
  });

  it("una persona sin jornadas de vacaciones en Asistencia (por ejemplo, Administración) no tiene desglose", () => {
    const resultado = calcularBorrador(entrada({ condiciones }));
    expect(resultado.personas[0].vacaciones).toEqual([]);
    expect(lineas(resultado, "sueldo_basico")).toMatchObject([{ dias: 30, importeCentimos: sueldo }]);
  });
});
