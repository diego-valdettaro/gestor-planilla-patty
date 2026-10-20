import { describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";

import { confirmarPago, consultarConstancia } from "./confirmar-pago";
import { crearRepositorioDeConstanciasEnMemoria } from "./constancias-en-memoria";
import { ErrorDeMesYaConfirmado } from "./constancias-de-pago";
import { finalizarMes, listarVersiones, MENSAJE_DE_PAGO_CONFIRMADO, type DependenciasDeFinalizacion } from "./finalizar-mes";
import type { FuentesDelBorrador } from "./preparar-borrador";
import { crearRepositorioDeVersionesEnMemoria } from "./versiones-en-memoria";

// Confirmar el pago realizado del mes (#130, ADR 0013). Ejemplos resueltos del plan (E1–E5): mes 2019-11 con la versión 1 de tres personas
// (Ana S/ 2.000,00, Beto S/ 1.500,00 y Carla S/ 1.000,00 = S/ 4.500,00, aritmética manual de #96, historia 5); Finanzas confirma el
// 2019-12-02 con reloj 2019-12-02T15:00:00Z (hoy en Lima = 2019-12-02, UTC−5 sin horario de verano). Repositorios en memoria reales y reloj
// inyectado; nada de mocks de módulos propios. Cada grupo es una prueba por tabla de casos: `-t "G5"`, `-t "G6"`…
const finanzas: Actor = { id: "11111111-1111-4111-8111-111111111111", rol: "finanzas", nombreUsuario: "finanzas" };
const AHORA = new Date("2019-12-02T15:00:00Z");
const MES = "2019-11";

function crearMundo(ahora: Date = AHORA) {
  const versiones = crearRepositorioDeVersionesEnMemoria();
  const constancias = crearRepositorioDeConstanciasEnMemoria({ nombreDe: (id) => (id === finanzas.id ? "finanzas" : id) });
  const prohibido = (): never => { throw new Error("se consultó una fuente de cálculo; confirmar el pago no recalcula"); };
  const fuentes = new Proxy({}, { get: prohibido }) as FuentesDelBorrador;
  const dependencias: DependenciasDeFinalizacion = { fuentes, versiones: versiones.repositorio, pago: constancias.repositorio, ahora: () => ahora };
  /** Una versión finalizada más del mes, con las tres personas del ejemplo. */
  const finalizarVersion = (mes: string = MES) => versiones.repositorio.guardarVersion({
    mesDePago: mes, finalizadaPorId: finanzas.id, finalizadaPor: "finanzas", finalizadaEn: new Date("2019-11-26T15:00:00Z"), reglas: [], revisiones: [], fuentes: [],
    personas: [["r-ana", "10000001", "Ana", 200000], ["r-beto", "10000002", "Beto", 150000], ["r-carla", "10000003", "Carla", 100000]]
      .map(([relacionId, dni, nombre, subtotalCentimos]) => ({ relacionId: relacionId as string, dni: dni as string, nombre: nombre as string, subtotalCentimos: subtotalCentimos as number, lineas: [], bases: [] })),
  });
  return { dependencias, versiones, constancias, finalizarVersion };
}

const E1 = { mesDePago: MES, numeroDeVersion: 1, fechaDelPago: "2019-12-02", confirmadaPorId: finanzas.id, confirmadaPor: "finanzas", confirmadaEn: AHORA };

describe("confirmar el pago realizado del mes", () => {
  // G5 · Se registra la constancia de la versión final vigente a nombre de quien la confirma (contrato C1, §4.7, D14).
  const casosG5: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "U1", descripcion: "Finanzas confirma el mes con versión 1 y queda la constancia de E1",
      comprobar: async () => {
        const mundo = crearMundo();
        await mundo.finalizarVersion();

        const constancia = await confirmarPago(mundo.dependencias, finanzas, { mes: MES, numeroDeVersion: 1, fechaDelPago: "2019-12-02" });

        expect(constancia).toEqual(E1);
        expect(await mundo.dependencias.pago.buscar(MES)).toEqual(E1);
        expect(await mundo.dependencias.pago.mesConPagoConfirmado(MES)).toBe(true);
      },
    },
    {
      fila: "U2", descripcion: "con las versiones 1 y 2 finalizadas, la constancia es de la versión 2, la vigente",
      comprobar: async () => {
        const mundo = crearMundo();
        await mundo.finalizarVersion();
        await mundo.finalizarVersion();

        const constancia = await confirmarPago(mundo.dependencias, finanzas, { mes: MES, numeroDeVersion: 2, fechaDelPago: "2019-12-02" });

        expect(constancia.numeroDeVersion).toBe(2);
        expect(mundo.constancias.guardadas()).toHaveLength(1);
      },
    },
    {
      fila: "U3", descripcion: "el responsable es quien autenticó y la hora sale del reloj del servidor, no de la solicitud",
      comprobar: async () => {
        const mundo = crearMundo();
        await mundo.finalizarVersion();
        const solicitud = { mes: MES, numeroDeVersion: 1, fechaDelPago: "2019-12-02", confirmadaPorId: "otra-cuenta", confirmadaPor: "otra", confirmadaEn: new Date("2001-01-01T00:00:00Z") };

        const constancia = await confirmarPago(mundo.dependencias, finanzas, solicitud);

        expect(constancia).toMatchObject({ confirmadaPorId: finanzas.id, confirmadaPor: "finanzas", confirmadaEn: AHORA });
      },
    },
  ];
  it.each(casosG5)("G5 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G10 · Tras la constancia el mes no admite otra versión: el encadenado con finalizar usa la constancia real (contrato C2, ADR 0013).
  const casosG10: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "U13", descripcion: "confirmar 2019-11 y luego finalizarlo se rechaza con el mensaje de pago confirmado y las versiones siguen siendo [1]",
      comprobar: async () => {
        const mundo = crearMundo();
        await mundo.finalizarVersion();
        await confirmarPago(mundo.dependencias, finanzas, { mes: MES, numeroDeVersion: 1, fechaDelPago: "2019-12-02" });

        const huella = { entrada: "x", datos: {}, subtotalCentimos: 0, personas: [] };
        await expect(finalizarMes(mundo.dependencias, finanzas, { mes: MES, huella })).rejects.toThrow(MENSAJE_DE_PAGO_CONFIRMADO);

        expect((await mundo.versiones.repositorio.listarVersiones(MES)).map(({ numero }) => numero)).toEqual([1]);
        expect((await listarVersiones(mundo.dependencias, finanzas, MES)).map(({ numero }) => numero)).toEqual([1]);
      },
    },
  ];
  it.each(casosG10)("G10 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G6 · La fecha del pago es una fecha válida y no futura según el día de hoy en Lima (D14, contrato C1; E3, E4).
  const FUTURA = "La fecha del pago no puede ser futura.";
  const INVALIDA = "Indique una fecha de pago válida.";
  const rechazada = async (ahora: Date, fechaDelPago: string, mensaje: string) => {
    const mundo = crearMundo(ahora);
    await mundo.finalizarVersion();
    await expect(confirmarPago(mundo.dependencias, finanzas, { mes: MES, numeroDeVersion: 1, fechaDelPago })).rejects.toThrow(mensaje);
    expect(mundo.constancias.guardadas()).toEqual([]);
  };
  const casosG6: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    { fila: "U4", descripcion: "con reloj 2019-12-02T15:00Z la fecha 2019-12-03 es futura y no se registra nada", comprobar: () => rechazada(AHORA, "2019-12-03", FUTURA) },
    {
      fila: "U5", descripcion: "con reloj 2019-12-03T03:00Z (22:00 del 02 en Lima) se acepta el 2019-12-02 y se rechaza el 2019-12-03",
      comprobar: async () => {
        const noche = new Date("2019-12-03T03:00:00Z");
        const mundo = crearMundo(noche);
        await mundo.finalizarVersion();
        expect(await confirmarPago(mundo.dependencias, finanzas, { mes: MES, numeroDeVersion: 1, fechaDelPago: "2019-12-02" })).toMatchObject({ fechaDelPago: "2019-12-02" });
        await rechazada(noche, "2019-12-03", FUTURA);
      },
    },
    { fila: "U6", descripcion: "con reloj 2019-12-02T04:59Z (23:59 del 01 en Lima) la fecha 2019-12-02 se rechaza aunque en UTC ya sea hoy", comprobar: () => rechazada(new Date("2019-12-02T04:59:00Z"), "2019-12-02", FUTURA) },
    {
      fila: "U7", descripcion: "las fechas inválidas se rechazan sin registrar: vacía, 2019-02-30, 02/12/2019 y 2019-12-2",
      comprobar: async () => {
        for (const fecha of ["", "2019-02-30", "02/12/2019", "2019-12-2"]) await rechazada(AHORA, fecha, INVALIDA);
      },
    },
  ];
  it.each(casosG6)("G6 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G7 · Una sola confirmación por mes: la segunda se rechaza y la constancia sigue siendo la primera (contrato C1, ADR 0013; E2).
  const casosG7: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "U8", descripcion: "la segunda confirmación del mismo mes se rechaza, la constancia sigue siendo E1 y las versiones no cambian",
      comprobar: async () => {
        const mundo = crearMundo();
        await mundo.finalizarVersion();
        await confirmarPago(mundo.dependencias, finanzas, { mes: MES, numeroDeVersion: 1, fechaDelPago: "2019-12-02" });
        const versionesAntes = await listarVersiones(mundo.dependencias, finanzas, MES);

        await expect(confirmarPago(mundo.dependencias, finanzas, { mes: MES, numeroDeVersion: 1, fechaDelPago: "2019-12-01" })).rejects.toBeInstanceOf(ErrorDeMesYaConfirmado);

        expect(await mundo.dependencias.pago.buscar(MES)).toEqual(E1);
        expect(mundo.constancias.guardadas()).toEqual([E1]);
        expect(await listarVersiones(mundo.dependencias, finanzas, MES)).toEqual(versionesAntes);
      },
    },
  ];
  it.each(casosG7)("G7 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G8 · Solo se confirma un mes que tiene su propia versión finalizada: «sin versión finalizada no hay nada que confirmar» (§4.7, ADR 0013; E3).
  const SIN_VERSION = "Finalice el mes para poder confirmar el pago";
  const casosG8: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "U9", descripcion: "un mes sin versión finalizada se rechaza y no se registra nada",
      comprobar: async () => {
        const mundo = crearMundo();

        await expect(confirmarPago(mundo.dependencias, finanzas, { mes: MES, numeroDeVersion: 1, fechaDelPago: "2019-12-02" })).rejects.toThrow(SIN_VERSION);

        expect(mundo.constancias.guardadas()).toEqual([]);
      },
    },
    {
      fila: "U10", descripcion: "una versión de otro mes (2019-12) no habilita confirmar 2019-11",
      comprobar: async () => {
        const mundo = crearMundo();
        await mundo.finalizarVersion("2019-12");

        await expect(confirmarPago(mundo.dependencias, finanzas, { mes: MES, numeroDeVersion: 1, fechaDelPago: "2019-12-02" })).rejects.toThrow(SIN_VERSION);

        expect(mundo.constancias.guardadas()).toEqual([]);
      },
    },
  ];
  it.each(casosG8)("G8 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G9 · Solo Finanzas confirma y consulta la constancia: el servidor rechaza a cualquier otro rol y a la ausencia de sesión antes de leer o escribir (contrato C4, §2 principio 1).
  const MOTIVO = "No tiene permiso para consultar ni editar Pagos.";
  const sinPermiso: Array<Actor | undefined> = [
    { id: "22222222-2222-4222-8222-222222222222", rol: "administrador", nombreUsuario: "admin" },
    { id: "33333333-3333-4333-8333-333333333333", rol: "gerente_de_area", nombreUsuario: "gerente", grupos: [{ nombre: "Taller", gestionaAsistencia: true }] },
    { id: "44444444-4444-4444-8444-444444444444", rol: "recursos_humanos", nombreUsuario: "rrhh" },
    undefined,
  ];
  const sinLecturas = (): DependenciasDeFinalizacion => {
    const prohibido = (): never => { throw new Error("se leyó o escribió sin permiso"); };
    return {
      fuentes: new Proxy({}, { get: prohibido }) as FuentesDelBorrador,
      versiones: { guardarVersion: prohibido, listarVersiones: prohibido, buscarVersion: prohibido },
      pago: { confirmar: prohibido, buscar: prohibido, mesConPagoConfirmado: prohibido }, ahora: () => AHORA,
    };
  };
  const casosG9: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "U11", descripcion: "administrador, gerente de área, Recursos Humanos y sin sesión no pueden confirmar el pago, sin leer versiones ni escribir",
      comprobar: async () => {
        for (const actor of sinPermiso) await expect(confirmarPago(sinLecturas(), actor, { mes: MES, numeroDeVersion: 1, fechaDelPago: "2019-12-02" })).rejects.toThrow(MOTIVO);
      },
    },
    {
      fila: "U12", descripcion: "los mismos cuatro casos no pueden consultar la constancia, sin leerla",
      comprobar: async () => {
        for (const actor of sinPermiso) await expect(consultarConstancia(sinLecturas(), actor, MES)).rejects.toThrow(MOTIVO);
      },
    },
  ];
  it.each(casosG9)("G9 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G11 · El historial y la consulta reflejan la constancia: la versión pagada dice «Pago realizado confirmado» con su fecha y responsable (§4.2, §4.7, contrato C3).
  const casosG11: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "U15", descripcion: "con las versiones 1 y 2 y la constancia en la 2, el historial marca la 2 como pagada con fecha y responsable y la 1 como reemplazada",
      comprobar: async () => {
        const mundo = crearMundo();
        await mundo.finalizarVersion();
        await mundo.finalizarVersion();
        await confirmarPago(mundo.dependencias, finanzas, { mes: MES, numeroDeVersion: 2, fechaDelPago: "2019-12-02" });

        const historial = await listarVersiones(mundo.dependencias, finanzas, MES);

        expect(historial.map(({ numero, estado }) => ({ numero, estado }))).toEqual([{ numero: 2, estado: "Pago realizado confirmado" }, { numero: 1, estado: "Reemplazada" }]);
        expect(historial[0].pago).toEqual({ fechaDelPago: "2019-12-02", responsable: "finanzas" });
        expect(historial[1].pago).toBeUndefined();
      },
    },
    {
      fila: "U16", descripcion: "sin constancia el historial sigue igual: la 2 vigente, la 1 reemplazada y ninguna con fecha de pago",
      comprobar: async () => {
        const mundo = crearMundo();
        await mundo.finalizarVersion();
        await mundo.finalizarVersion();

        const historial = await listarVersiones(mundo.dependencias, finanzas, MES);

        expect(historial.map(({ numero, estado }) => ({ numero, estado }))).toEqual([{ numero: 2, estado: "Vigente" }, { numero: 1, estado: "Reemplazada" }]);
        expect(historial.map(({ pago }) => pago)).toEqual([undefined, undefined]);
      },
    },
    {
      fila: "U17", descripcion: "Finanzas consulta la constancia del mes pagado y no obtiene nada de un mes sin constancia",
      comprobar: async () => {
        const mundo = crearMundo();
        await mundo.finalizarVersion();
        await mundo.finalizarVersion("2019-12");
        await confirmarPago(mundo.dependencias, finanzas, { mes: MES, numeroDeVersion: 1, fechaDelPago: "2019-12-02" });

        expect(await consultarConstancia(mundo.dependencias, finanzas, MES)).toEqual(E1);
        expect(await consultarConstancia(mundo.dependencias, finanzas, "2019-12")).toBeUndefined();
      },
    },
  ];
  it.each(casosG11)("G11 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G23 · Se confirma la versión que Finanzas vio: si ya no es la vigente del mes se rechaza sin registrar nada (adenda U18, decisión P9, §6.2 «nombra la versión»).
  const OBSOLETA = "La versión mostrada ya no es la vigente; revise y vuelva a confirmar.";
  const casosG23: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "U18", descripcion: "con las versiones 1 y 2, declarar la 1 se rechaza sin constancia y declarar la 2 registra la constancia de la 2",
      comprobar: async () => {
        const mundo = crearMundo();
        await mundo.finalizarVersion();
        await mundo.finalizarVersion();

        await expect(confirmarPago(mundo.dependencias, finanzas, { mes: MES, numeroDeVersion: 1, fechaDelPago: "2019-12-02" })).rejects.toThrow(OBSOLETA);
        expect(mundo.constancias.guardadas()).toEqual([]);

        const constancia = await confirmarPago(mundo.dependencias, finanzas, { mes: MES, numeroDeVersion: 2, fechaDelPago: "2019-12-02" });
        expect(constancia).toMatchObject({ mesDePago: MES, numeroDeVersion: 2 });
        expect(mundo.constancias.guardadas()).toHaveLength(1);
      },
    },
  ];
  it.each(casosG23)("G23 $fila $descripcion", async ({ comprobar }) => comprobar());
});
