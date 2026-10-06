import { describe, expect, it } from "vitest";

import { calcularBloqueosDeAprobacion, type JornadaParaAprobar, type PersonaParaAprobar } from "./aprobacion-de-asistencia";

const periodo = { inicio: "2026-09-26", fin: "2026-09-30" };
const dias = ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"];

function persona(dni: string, nombre: string, vigencias: PersonaParaAprobar["vigencias"] = [{ ingreso: "2026-01-01", cese: null }]): PersonaParaAprobar {
  return { dni, nombre, vigencias };
}
function jornadas(dni: string, fechas: string[], situacion: JornadaParaAprobar["situacion"] = "resuelta"): JornadaParaAprobar[] {
  return fechas.map((fecha) => ({ dni, fecha, situacion }));
}

describe("bloqueos de la aprobación de asistencia de un grupo", () => {
  it("no bloquea cuando todos los días de cada persona tienen horario y situación resuelta", () => {
    const bloqueos = calcularBloqueosDeAprobacion(periodo, [persona("1", "Ana")], jornadas("1", dias));
    expect(bloqueos).toEqual([]);
  });

  it("bloquea a una persona vigente sin ningún horario, aunque no tenga marcas ni filas de asistencia", () => {
    const bloqueos = calcularBloqueosDeAprobacion(periodo, [persona("1", "Ana")], []);
    expect(bloqueos).toEqual([{ dni: "1", nombre: "Ana", causa: "sin_horario", fechas: dias }]);
  });

  it("dice qué días no tienen horario cuando solo falta una parte del período", () => {
    const bloqueos = calcularBloqueosDeAprobacion(periodo, [persona("1", "Ana")], jornadas("1", dias.slice(0, 3)));
    expect(bloqueos).toEqual([{ dni: "1", nombre: "Ana", causa: "sin_horario", fechas: ["2026-09-29", "2026-09-30"] }]);
  });

  it("bloquea por asistencia pendiente de revisión con las fechas pendientes", () => {
    const bloqueos = calcularBloqueosDeAprobacion(periodo, [persona("1", "Ana")], [
      ...jornadas("1", dias.slice(0, 4)),
      ...jornadas("1", ["2026-09-30"], "pendiente"),
    ]);
    expect(bloqueos).toEqual([{ dni: "1", nombre: "Ana", causa: "asistencia_pendiente", fechas: ["2026-09-30"] }]);
  });

  it("informa ambas causas de una misma persona y ordena por nombre", () => {
    const bloqueos = calcularBloqueosDeAprobacion(periodo, [persona("2", "Beto"), persona("1", "Ana")], [
      ...jornadas("1", ["2026-09-26"], "pendiente"),
      ...jornadas("2", dias),
    ]);
    expect(bloqueos.map(({ nombre, causa }) => [nombre, causa])).toEqual([["Ana", "sin_horario"], ["Ana", "asistencia_pendiente"]]);
  });

  it("solo exige los días dentro de la relación laboral: ingreso a mitad del período", () => {
    const bloqueos = calcularBloqueosDeAprobacion(periodo, [persona("1", "Ana", [{ ingreso: "2026-09-29", cese: null }])], jornadas("1", ["2026-09-29", "2026-09-30"]));
    expect(bloqueos).toEqual([]);
  });

  it("solo exige los días dentro de la relación laboral: cese a mitad del período", () => {
    const bloqueos = calcularBloqueosDeAprobacion(periodo, [persona("1", "Ana", [{ ingreso: "2026-01-01", cese: "2026-09-27" }])], jornadas("1", ["2026-09-26", "2026-09-27"]));
    expect(bloqueos).toEqual([]);
  });

  it("ignora a quien no tiene relación laboral vigente en el período", () => {
    const antes = persona("1", "Ana", [{ ingreso: "2026-01-01", cese: "2026-09-25" }]);
    const despues = persona("2", "Beto", [{ ingreso: "2026-10-01", cese: null }]);
    expect(calcularBloqueosDeAprobacion(periodo, [antes, despues], [])).toEqual([]);
  });

  it("con una relación sucesiva exige los días de cada relación y no los del hueco entre ambas", () => {
    const reingreso = persona("1", "Ana", [{ ingreso: "2026-01-01", cese: "2026-09-26" }, { ingreso: "2026-09-29", cese: null }]);
    expect(calcularBloqueosDeAprobacion(periodo, [reingreso], jornadas("1", ["2026-09-26", "2026-09-29", "2026-09-30"]))).toEqual([]);
    expect(calcularBloqueosDeAprobacion(periodo, [reingreso], jornadas("1", ["2026-09-26", "2026-09-29"]))).toEqual([
      { dni: "1", nombre: "Ana", causa: "sin_horario", fechas: ["2026-09-30"] },
    ]);
  });

  it("un día manual (falta, vacaciones) o confirmado cuenta como situación resuelta: el motivo no importa", () => {
    const bloqueos = calcularBloqueosDeAprobacion(periodo, [persona("1", "Ana")], jornadas("1", dias, "resuelta"));
    expect(bloqueos).toEqual([]);
  });
});
