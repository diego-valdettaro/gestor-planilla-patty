import { describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";

import {
  asignarDescansoSemanal,
  consultarDiasDeDescansoOFeriado,
  corregirNombreDeFeriado,
  listarDescansosSemanales,
  listarFeriados,
  quitarFeriado,
  registrarDescansoSustitutorio,
  registrarFeriado,
  verificarDescansoSustitutorio,
} from "./gestionar-descansos-y-feriados";
import { ANA, BETO, crearRepositorioEnMemoria } from "./repositorio-en-memoria";

const finanzas: Actor = { id: "cuenta-finanzas", rol: "finanzas" };
const administrador: Actor = { id: "cuenta-admin", rol: "administrador" };
const recursosHumanos: Actor = { id: "cuenta-rrhh", rol: "recursos_humanos" };
const gerente: Actor = { id: "cuenta-gerente", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] };

// Semana de 2033-03-07 (lunes) a 2033-03-13 (domingo).
const LUNES = "2033-03-07";
const MIERCOLES = "2033-03-09";
const JUEVES = "2033-03-10";
const VIERNES = "2033-03-11";

describe("permisos del calendario laboral", () => {
  it("solo Finanzas y el Administrador administran y consultan; gerente y Recursos Humanos reciben un rechazo", async () => {
    const { repositorio } = crearRepositorioEnMemoria();

    for (const rechazado of [gerente, recursosHumanos]) {
      await expect(registrarFeriado(repositorio, rechazado, { fecha: "2033-07-28", nombre: "Fiestas Patrias" })).rejects.toThrow("No tiene permiso");
      await expect(corregirNombreDeFeriado(repositorio, rechazado, "2033-07-28", "Otro")).rejects.toThrow("No tiene permiso");
      await expect(quitarFeriado(repositorio, rechazado, "2033-07-28")).rejects.toThrow("No tiene permiso");
      await expect(listarFeriados(repositorio, rechazado, "2033-01-01", "2033-12-31")).rejects.toThrow("No tiene permiso");
      await expect(asignarDescansoSemanal(repositorio, rechazado, { dni: ANA, diaDeLaSemana: 7, vigenteDesde: LUNES })).rejects.toThrow("No tiene permiso");
      await expect(listarDescansosSemanales(repositorio, rechazado, ANA)).rejects.toThrow("No tiene permiso");
      await expect(registrarDescansoSustitutorio(repositorio, rechazado, { dni: ANA, origenFecha: LUNES, fechaPrevista: MIERCOLES })).rejects.toThrow("No tiene permiso");
      await expect(verificarDescansoSustitutorio(repositorio, rechazado, "x", "otorgado", LUNES)).rejects.toThrow("No tiene permiso");
      await expect(consultarDiasDeDescansoOFeriado(repositorio, rechazado, { dni: ANA, desde: LUNES, hasta: LUNES })).rejects.toThrow("No tiene permiso");
    }
    await registrarFeriado(repositorio, administrador, { fecha: "2033-07-28", nombre: "Fiestas Patrias" });
    await expect(listarFeriados(repositorio, finanzas, "2033-01-01", "2033-12-31")).resolves.toHaveLength(1);
  });
});

describe("descanso semanal asignado", () => {
  it("guarda varias vigencias de una persona sin reescribir la anterior y rechaza repetir una fecha", async () => {
    const { repositorio } = crearRepositorioEnMemoria();

    await asignarDescansoSemanal(repositorio, finanzas, { dni: ANA, diaDeLaSemana: 7, vigenteDesde: "2033-03-01" });
    await asignarDescansoSemanal(repositorio, finanzas, { dni: ANA, diaDeLaSemana: 3, vigenteDesde: "2033-03-16" });

    await expect(listarDescansosSemanales(repositorio, finanzas, ANA)).resolves.toMatchObject([
      { diaDeLaSemana: 7, vigenteDesde: "2033-03-01" },
      { diaDeLaSemana: 3, vigenteDesde: "2033-03-16" },
    ]);
    await expect(asignarDescansoSemanal(repositorio, finanzas, { dni: ANA, diaDeLaSemana: 5, vigenteDesde: "2033-03-16" })).rejects.toThrow("ya tiene un descanso semanal asignado desde el 16/03/2033");
  });

  it("valida el día, la fecha y la existencia de la persona", async () => {
    const { repositorio } = crearRepositorioEnMemoria();

    await expect(asignarDescansoSemanal(repositorio, finanzas, { dni: ANA, diaDeLaSemana: 0, vigenteDesde: LUNES })).rejects.toThrow("de lunes (1) a domingo (7)");
    await expect(asignarDescansoSemanal(repositorio, finanzas, { dni: ANA, diaDeLaSemana: 8, vigenteDesde: LUNES })).rejects.toThrow("de lunes (1) a domingo (7)");
    await expect(asignarDescansoSemanal(repositorio, finanzas, { dni: ANA, diaDeLaSemana: 1.5, vigenteDesde: LUNES })).rejects.toThrow("de lunes (1) a domingo (7)");
    await expect(asignarDescansoSemanal(repositorio, finanzas, { dni: ANA, diaDeLaSemana: 3, vigenteDesde: "2033-02-30" })).rejects.toThrow("no es válida");
    await expect(asignarDescansoSemanal(repositorio, finanzas, { dni: "00000000", diaDeLaSemana: 3, vigenteDesde: LUNES })).rejects.toThrow("No existe una persona");
  });
});

describe("calendario de feriados", () => {
  it("registra feriados derivando la clase de la fecha: el 1 de mayo queda distinguido", async () => {
    const { repositorio } = crearRepositorioEnMemoria();

    await registrarFeriado(repositorio, finanzas, { fecha: "2033-07-28", nombre: "  Fiestas Patrias " });
    await registrarFeriado(repositorio, finanzas, { fecha: "2033-05-01", nombre: "Día del Trabajo" });

    await expect(listarFeriados(repositorio, finanzas, "2033-01-01", "2033-12-31")).resolves.toEqual([
      { fecha: "2033-05-01", nombre: "Día del Trabajo", clase: "primero_de_mayo" },
      { fecha: "2033-07-28", nombre: "Fiestas Patrias", clase: "feriado" },
    ]);
  });

  it("rechaza fechas repetidas, nombres vacíos o largos y fechas inválidas", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    await registrarFeriado(repositorio, finanzas, { fecha: "2033-07-28", nombre: "Fiestas Patrias" });

    await expect(registrarFeriado(repositorio, finanzas, { fecha: "2033-07-28", nombre: "Otro" })).rejects.toThrow("ya está en el calendario");
    await expect(registrarFeriado(repositorio, finanzas, { fecha: "2033-07-29", nombre: "   " })).rejects.toThrow("Escriba el nombre");
    await expect(registrarFeriado(repositorio, finanzas, { fecha: "2033-07-29", nombre: "x".repeat(101) })).rejects.toThrow("no puede superar 100");
    await expect(registrarFeriado(repositorio, finanzas, { fecha: "28/07/2033", nombre: "Fiestas" })).rejects.toThrow("no es válida");
  });

  it("corrige el nombre y quita un feriado; avisa si no existe", async () => {
    const { repositorio, feriados } = crearRepositorioEnMemoria();
    await registrarFeriado(repositorio, finanzas, { fecha: "2033-07-28", nombre: "Fiestas" });

    await corregirNombreDeFeriado(repositorio, finanzas, "2033-07-28", "Fiestas Patrias");
    expect(feriados[0].nombre).toBe("Fiestas Patrias");
    await quitarFeriado(repositorio, finanzas, "2033-07-28");
    expect(feriados).toEqual([]);
    await expect(quitarFeriado(repositorio, finanzas, "2033-07-28")).rejects.toThrow("no está en el calendario");
    await expect(corregirNombreDeFeriado(repositorio, finanzas, "2033-07-28", "X")).rejects.toThrow("no está en el calendario");
  });

  it("no quita un feriado que ya tiene un descanso sustitutorio", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    await registrarFeriado(repositorio, finanzas, { fecha: "2033-07-28", nombre: "Fiestas Patrias" });
    await registrarDescansoSustitutorio(repositorio, finanzas, { dni: ANA, origenFecha: "2033-07-28", fechaPrevista: "2033-08-02" });

    await expect(quitarFeriado(repositorio, finanzas, "2033-07-28")).rejects.toThrow("tiene descansos sustitutorios registrados");
  });
});

describe("descanso sustitutorio", () => {
  async function conDescansoDeAnaElMiercoles() {
    const mundo = crearRepositorioEnMemoria();
    await asignarDescansoSemanal(mundo.repositorio, finanzas, { dni: ANA, diaDeLaSemana: 3, vigenteDesde: "2033-03-01" });
    return mundo;
  }

  it("se registra como previsto para sustituir el descanso semanal asignado, no un domingo cualquiera", async () => {
    const { repositorio } = await conDescansoDeAnaElMiercoles();

    const previsto = await registrarDescansoSustitutorio(repositorio, finanzas, { dni: ANA, origenFecha: MIERCOLES, fechaPrevista: VIERNES });

    expect(previsto).toMatchObject({ dni: ANA, origenFecha: MIERCOLES, origenTipo: "descanso_semanal", fechaPrevista: VIERNES, estado: "previsto", verificadoPorId: null, verificadoEn: null });
    await expect(registrarDescansoSustitutorio(repositorio, finanzas, { dni: ANA, origenFecha: "2033-03-13", fechaPrevista: "2033-03-15" })).rejects.toThrow("no es feriado ni el descanso semanal");
  });

  it("sustituye un feriado, con su clase de origen, aunque la persona no tenga descanso asignado", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    await registrarFeriado(repositorio, finanzas, { fecha: "2033-05-01", nombre: "Día del Trabajo" });

    const previsto = await registrarDescansoSustitutorio(repositorio, finanzas, { dni: BETO, origenFecha: "2033-05-01", fechaPrevista: "2033-05-04" });

    expect(previsto.origenTipo).toBe("primero_de_mayo");
  });

  it("el día previsto debe ser otro día laborable y el origen admite un solo sustitutorio", async () => {
    const { repositorio } = await conDescansoDeAnaElMiercoles();
    await registrarFeriado(repositorio, finanzas, { fecha: VIERNES, nombre: "Feriado de prueba" });

    await expect(registrarDescansoSustitutorio(repositorio, finanzas, { dni: ANA, origenFecha: MIERCOLES, fechaPrevista: MIERCOLES })).rejects.toThrow("otro día distinto");
    await expect(registrarDescansoSustitutorio(repositorio, finanzas, { dni: ANA, origenFecha: MIERCOLES, fechaPrevista: VIERNES })).rejects.toThrow("ya es feriado o descanso semanal");
    await expect(registrarDescansoSustitutorio(repositorio, finanzas, { dni: ANA, origenFecha: MIERCOLES, fechaPrevista: "2033-03-16" })).rejects.toThrow("ya es feriado o descanso semanal");
    await registrarDescansoSustitutorio(repositorio, finanzas, { dni: ANA, origenFecha: MIERCOLES, fechaPrevista: JUEVES });
    await expect(registrarDescansoSustitutorio(repositorio, finanzas, { dni: ANA, origenFecha: MIERCOLES, fechaPrevista: LUNES })).rejects.toThrow("ya tiene un descanso sustitutorio");
  });

  it("un mismo día previsto no sustituye dos orígenes, salvo que el primero no se haya otorgado", async () => {
    const { repositorio } = await conDescansoDeAnaElMiercoles();
    await registrarFeriado(repositorio, finanzas, { fecha: "2033-03-08", nombre: "Feriado de prueba" });
    const primero = await registrarDescansoSustitutorio(repositorio, finanzas, { dni: ANA, origenFecha: MIERCOLES, fechaPrevista: VIERNES });

    await expect(registrarDescansoSustitutorio(repositorio, finanzas, { dni: ANA, origenFecha: "2033-03-08", fechaPrevista: VIERNES })).rejects.toThrow("ya sustituye otro descanso o feriado");
    await verificarDescansoSustitutorio(repositorio, finanzas, primero.id, "no_otorgado", VIERNES);
    await expect(registrarDescansoSustitutorio(repositorio, finanzas, { dni: ANA, origenFecha: "2033-03-08", fechaPrevista: VIERNES })).resolves.toMatchObject({ estado: "previsto" });
  });

  it("se verifica una sola vez como otorgado o no otorgado, con responsable, y no antes de su fecha", async () => {
    const { repositorio, sustitutorios } = await conDescansoDeAnaElMiercoles();
    const previsto = await registrarDescansoSustitutorio(repositorio, finanzas, { dni: ANA, origenFecha: MIERCOLES, fechaPrevista: VIERNES });

    await expect(verificarDescansoSustitutorio(repositorio, finanzas, previsto.id, "otorgado", JUEVES)).rejects.toThrow("previsto para el 11/03/2033");
    expect(sustitutorios[0].estado).toBe("previsto");

    await verificarDescansoSustitutorio(repositorio, finanzas, previsto.id, "no_otorgado", VIERNES);

    expect(sustitutorios[0]).toMatchObject({ estado: "no_otorgado", verificadoPorId: finanzas.id });
    expect(sustitutorios[0].verificadoEn).toBeInstanceOf(Date);
    await expect(verificarDescansoSustitutorio(repositorio, finanzas, previsto.id, "otorgado", VIERNES)).rejects.toThrow("ya fue verificado");
    await expect(verificarDescansoSustitutorio(repositorio, finanzas, "no-existe", "otorgado", VIERNES)).rejects.toThrow("No existe ese descanso sustitutorio");
  });
});

describe("consulta de días de descanso o feriado", () => {
  it("distingue la jornada trabajada en descanso de un estado manual de descanso o feriado, y adjunta el sustitutorio", async () => {
    const { repositorio, asistencias } = crearRepositorioEnMemoria();
    await asignarDescansoSemanal(repositorio, finanzas, { dni: ANA, diaDeLaSemana: 3, vigenteDesde: "2033-03-01" });
    await registrarFeriado(repositorio, finanzas, { fecha: JUEVES, nombre: "Feriado de prueba" });
    asistencias.push(
      { dni: ANA, fecha: MIERCOLES, estado: "confirmada", minutosTrabajados: 540, tipoManual: null },
      { dni: ANA, fecha: JUEVES, estado: "manual", minutosTrabajados: null, tipoManual: "feriado" },
      { dni: ANA, fecha: LUNES, estado: "confirmada", minutosTrabajados: 480, tipoManual: null },
    );
    const previsto = await registrarDescansoSustitutorio(repositorio, finanzas, { dni: ANA, origenFecha: MIERCOLES, fechaPrevista: VIERNES });

    const dias = await consultarDiasDeDescansoOFeriado(repositorio, finanzas, { dni: ANA, desde: LUNES, hasta: "2033-03-13" });

    expect(dias).toEqual([
      { fecha: MIERCOLES, descansoSemanal: true, feriado: null, situacion: { tipo: "jornada_trabajada", minutosTrabajados: 540 }, sustitutorio: { id: previsto.id, estado: "previsto", fechaPrevista: VIERNES } },
      { fecha: JUEVES, descansoSemanal: false, feriado: { clase: "feriado", nombre: "Feriado de prueba" }, situacion: { tipo: "estado_manual", estado: "feriado" }, sustitutorio: null },
    ]);
  });

  it("valida el rango", async () => {
    const { repositorio } = crearRepositorioEnMemoria();

    await expect(consultarDiasDeDescansoOFeriado(repositorio, finanzas, { dni: ANA, desde: JUEVES, hasta: MIERCOLES })).rejects.toThrow("no puede ser anterior");
    await expect(consultarDiasDeDescansoOFeriado(repositorio, finanzas, { dni: ANA, desde: "2033-01-01", hasta: "2034-12-31" })).rejects.toThrow("más de 366 días");
  });
});
