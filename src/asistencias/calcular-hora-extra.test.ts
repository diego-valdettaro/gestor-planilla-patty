import { describe, expect, it } from "vitest";

import { calcularHoraExtra, calcularHorasExtraDeSemana, LIMITE_SEMANAL_EN_MINUTOS } from "./calcular-hora-extra";

function jornada(fecha: string, entradaReal: string, salidaReal: string, entradaProgramada = "09:00", salidaProgramada = "18:00") {
  return { fecha, entradaProgramada, salidaProgramada, entradaReal: `${fecha}T${entradaReal}`, salidaReal: `${fecha}T${salidaReal}` };
}

describe("calcularHoraExtra", () => {
  it("calcula una hora extra desde una hora manual sin zona horaria", () => {
    expect(calcularHoraExtra(jornada("2026-09-01", "09:00", "19:00"))).toEqual({
      minutosAl25: 60,
      minutosAl35: 0,
      trabajoNocturno: false,
      estado: "pendiente",
    });
  });

  it("mantiene el cálculo para una marca del huellero con zona horaria", () => {
    expect(calcularHoraExtra({
      entradaProgramada: "09:00", salidaProgramada: "18:00",
      entradaReal: "2026-09-01T09:00:00-05:00", salidaReal: "2026-09-01T20:30:00-05:00",
    })).toEqual({ minutosAl25: 120, minutosAl35: 30, trabajoNocturno: false, estado: "pendiente" });
  });

  it("conserva el sobretiempo fraccionario sin redondear", () => {
    expect(calcularHoraExtra(jornada("2026-09-01", "09:00", "18:37"))).toMatchObject({ minutosAl25: 37, minutosAl35: 0 });
    expect(calcularHoraExtra(jornada("2026-09-01", "09:00", "18:01"))).toMatchObject({ minutosAl25: 1, minutosAl35: 0 });
  });

  it("no genera hora extra cuando se trabaja dentro del turno", () => {
    expect(calcularHoraExtra(jornada("2026-09-01", "09:05", "18:00"))).toBeUndefined();
    expect(calcularHoraExtra(jornada("2026-09-01", "09:00", "17:30"))).toBeUndefined();
  });

  it("genera una candidata por el tiempo anterior a la entrada programada", () => {
    expect(calcularHoraExtra(jornada("2026-09-01", "08:30", "18:00"))).toMatchObject({ minutosAl25: 30, minutosAl35: 0 });
  });

  it("suma el tiempo antes de la entrada y después de la salida, y reparte 120 minutos al 25 %", () => {
    expect(calcularHoraExtra(jornada("2026-09-01", "08:00", "20:00"))).toMatchObject({ minutosAl25: 120, minutosAl35: 60 });
  });

  it("no cuenta como hora extra el tiempo ordinario de un turno que cruza la medianoche", () => {
    expect(calcularHoraExtra({
      entradaProgramada: "22:00", salidaProgramada: "06:00",
      entradaReal: "2026-09-01T22:00", salidaReal: "2026-09-02T06:20",
    })).toMatchObject({ minutosAl25: 20, minutosAl35: 0 });
  });

  it("señala el trabajo entre las 22:00 y las 06:00", () => {
    expect(calcularHoraExtra(jornada("2026-09-01", "09:00", "22:30"))).toMatchObject({ trabajoNocturno: true });
    expect(calcularHoraExtra(jornada("2026-09-01", "05:30", "18:00"))).toMatchObject({ trabajoNocturno: true });
    expect(calcularHoraExtra(jornada("2026-09-01", "09:00", "21:59"))).toMatchObject({ trabajoNocturno: false });
  });

  it("señala el trabajo nocturno aunque no haya sobretiempo", () => {
    expect(calcularHoraExtra({
      entradaProgramada: "22:00", salidaProgramada: "06:00",
      entradaReal: "2026-09-01T22:00", salidaReal: "2026-09-02T06:00",
    })).toEqual({ minutosAl25: 0, minutosAl35: 0, trabajoNocturno: true, estado: "pendiente" });
  });

  it("cuenta el exceso semanal cuando los minutos ordinarios previos ya alcanzaron el límite", () => {
    const ordinariosPrevios = LIMITE_SEMANAL_EN_MINUTOS - 60;
    expect(calcularHoraExtra(jornada("2026-09-05", "09:00", "18:00"), ordinariosPrevios)).toMatchObject({ minutosAl25: 120, minutosAl35: 360 });
  });
});

describe("calcularHorasExtraDeSemana", () => {
  const lunesASabado = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"];

  it("cuenta como exceso semanal solo los minutos ordinarios posteriores a 48 horas", () => {
    const resultado = calcularHorasExtraDeSemana(lunesASabado.map((fecha) => jornada(fecha, "09:00", "18:00")));

    expect(resultado.get("2026-09-11")).toBeUndefined();
    // cinco días de 9 h = 45 h; el sábado agrega 9 h y 6 h exceden las 48 h (360 min: 120 al 25 % y 240 al 35 %)
    expect(resultado.get("2026-09-12")).toMatchObject({ minutosAl25: 120, minutosAl35: 240 });
  });

  it("no cuenta dos veces un tramo que supera el límite diario y el semanal", () => {
    const jornadas = [...lunesASabado.slice(0, 5).map((fecha) => jornada(fecha, "09:00", "18:00")), jornada("2026-09-12", "09:00", "20:00")];

    const sabado = calcularHorasExtraDeSemana(jornadas).get("2026-09-12");

    // 120 min diarios (18:00-20:00) + 360 min semanales de su tramo ordinario, sin repetir ninguno
    expect(sabado).toMatchObject({ minutosAl25: 120, minutosAl35: 360 });
  });

  it("es independiente del orden en que llegan las jornadas", () => {
    const jornadas = lunesASabado.map((fecha) => jornada(fecha, "09:00", "18:00"));
    expect(calcularHorasExtraDeSemana([...jornadas].reverse())).toEqual(calcularHorasExtraDeSemana(jornadas));
  });

  it("no mezcla minutos de semanas distintas", () => {
    const resultado = calcularHorasExtraDeSemana([
      ...lunesASabado.slice(0, 5).map((fecha) => jornada(fecha, "09:00", "18:00")),
      jornada("2026-09-14", "09:00", "18:00"),
    ]);
    expect(resultado.get("2026-09-14")).toBeUndefined();
  });
});
