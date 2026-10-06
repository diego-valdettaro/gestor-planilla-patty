import { describe, expect, it } from "vitest";

import {
  claseDeFeriado,
  clasificarDia,
  descansoSemanalVigente,
  diaDeLaSemana,
  type AsistenciaDelDia,
  type DescansoSemanalAsignado,
  type Feriado,
} from "./reglas";

const asignacion = (diaDeLaSemana: number, vigenteDesde: string): DescansoSemanalAsignado => ({ dni: "99900001", diaDeLaSemana, vigenteDesde });
const feriado = (fecha: string, nombre = "Feriado de prueba"): Feriado => ({ fecha, nombre, clase: claseDeFeriado(fecha) });

describe("día de la semana", () => {
  it("numera de lunes (1) a domingo (7)", () => {
    expect(diaDeLaSemana("2033-03-07")).toBe(1);
    expect(diaDeLaSemana("2033-03-09")).toBe(3);
    expect(diaDeLaSemana("2033-03-13")).toBe(7);
  });
});

describe("clase de feriado", () => {
  it("distingue el 1 de mayo de cualquier otro feriado, sea cual sea el año", () => {
    expect(claseDeFeriado("2033-05-01")).toBe("primero_de_mayo");
    expect(claseDeFeriado("2034-05-01")).toBe("primero_de_mayo");
    expect(claseDeFeriado("2033-05-02")).toBe("feriado");
    expect(claseDeFeriado("2033-07-28")).toBe("feriado");
    expect(claseDeFeriado("2033-01-05")).toBe("feriado");
  });
});

describe("descanso semanal vigente", () => {
  it("sin asignación no hay descanso: nunca se asume el domingo", () => {
    expect(descansoSemanalVigente([], "2033-03-13")).toBeNull();
  });

  it("no hay descanso antes de la primera vigencia", () => {
    expect(descansoSemanalVigente([asignacion(3, "2033-03-10")], "2033-03-09")).toBeNull();
  });

  it("un cambio a mitad de mes aplica desde su fecha y conserva la historia", () => {
    const asignaciones = [asignacion(7, "2033-03-01"), asignacion(3, "2033-03-16")];

    expect(descansoSemanalVigente(asignaciones, "2033-03-15")?.diaDeLaSemana).toBe(7);
    expect(descansoSemanalVigente(asignaciones, "2033-03-16")?.diaDeLaSemana).toBe(3);
    expect(descansoSemanalVigente([...asignaciones].reverse(), "2033-03-31")?.diaDeLaSemana).toBe(3);
  });
});

describe("clasificar un día", () => {
  const sinAsistencia: AsistenciaDelDia | null = null;
  const confirmada: AsistenciaDelDia = { estado: "confirmada", minutosTrabajados: 480, tipoManual: null };
  const manual = (tipoManual: AsistenciaDelDia["tipoManual"]): AsistenciaDelDia => ({ estado: "manual", minutosTrabajados: null, tipoManual });
  const miercoles = "2033-03-09";
  const domingo = "2033-03-13";

  it("un domingo sin descanso asignado ese día no es descanso ni feriado", () => {
    expect(clasificarDia({ fecha: domingo, asignaciones: [asignacion(3, "2033-03-01")], feriado: null, asistencia: confirmada, sustitutorio: null })).toBeNull();
  });

  it("una jornada confirmada en el descanso asignado es trabajo en descanso, no un estado manual", () => {
    const dia = clasificarDia({ fecha: miercoles, asignaciones: [asignacion(3, "2033-03-01")], feriado: null, asistencia: confirmada, sustitutorio: null });

    expect(dia).toEqual({ fecha: miercoles, descansoSemanal: true, feriado: null, situacion: { tipo: "jornada_trabajada", minutosTrabajados: 480 }, sustitutorio: null });
  });

  it("un estado manual de descanso o de feriado no cuenta como jornada trabajada", () => {
    const asignaciones = [asignacion(3, "2033-03-01")];

    expect(clasificarDia({ fecha: miercoles, asignaciones, feriado: null, asistencia: manual("descanso"), sustitutorio: null })?.situacion).toEqual({ tipo: "estado_manual", estado: "descanso" });
    expect(clasificarDia({ fecha: miercoles, asignaciones: [], feriado: feriado(miercoles), asistencia: manual("feriado"), sustitutorio: null })?.situacion).toEqual({ tipo: "estado_manual", estado: "feriado" });
    expect(clasificarDia({ fecha: miercoles, asignaciones, feriado: null, asistencia: manual("falta"), sustitutorio: null })?.situacion).toEqual({ tipo: "estado_manual", estado: "falta" });
  });

  it("una asistencia pendiente o ausente queda sin resolver", () => {
    const asignaciones = [asignacion(3, "2033-03-01")];

    expect(clasificarDia({ fecha: miercoles, asignaciones, feriado: null, asistencia: { estado: "pendiente", minutosTrabajados: null, tipoManual: null }, sustitutorio: null })?.situacion).toEqual({ tipo: "sin_resolver" });
    expect(clasificarDia({ fecha: miercoles, asignaciones, feriado: null, asistencia: sinAsistencia, sustitutorio: null })?.situacion).toEqual({ tipo: "sin_resolver" });
  });

  it("conserva la clase del feriado, distinguiendo el 1 de mayo", () => {
    const comun = clasificarDia({ fecha: "2033-07-28", asignaciones: [], feriado: feriado("2033-07-28", "Fiestas Patrias"), asistencia: confirmada, sustitutorio: null });
    const primeroDeMayo = clasificarDia({ fecha: "2033-05-01", asignaciones: [], feriado: feriado("2033-05-01", "Día del Trabajo"), asistencia: confirmada, sustitutorio: null });

    expect(comun?.feriado).toEqual({ clase: "feriado", nombre: "Fiestas Patrias" });
    expect(primeroDeMayo?.feriado).toEqual({ clase: "primero_de_mayo", nombre: "Día del Trabajo" });
  });

  it("un feriado que cae en el descanso semanal devuelve ambas marcas", () => {
    const dia = clasificarDia({ fecha: domingo, asignaciones: [asignacion(7, "2033-03-01")], feriado: feriado(domingo), asistencia: confirmada, sustitutorio: null });

    expect(dia).toMatchObject({ descansoSemanal: true, feriado: { clase: "feriado" } });
  });

  it("adjunta el descanso sustitutorio del día", () => {
    const sustitutorio = { id: "s1", estado: "previsto" as const, fechaPrevista: "2033-03-11" };

    expect(clasificarDia({ fecha: miercoles, asignaciones: [asignacion(3, "2033-03-01")], feriado: null, asistencia: confirmada, sustitutorio })?.sustitutorio).toEqual(sustitutorio);
  });
});
