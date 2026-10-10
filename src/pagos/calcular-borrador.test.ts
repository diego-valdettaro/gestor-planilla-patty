import { describe, expect, it } from "vitest";

import { calcularBorrador, type EntradaDeBorrador } from "./calcular-borrador";

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
