import { beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { buscarConcepto } from "@/conceptos-de-preliquidacion/catalogo";

import {
  anularImporte,
  confirmarFuente,
  consultarEstadoDeFuentes,
  consultarFuente,
  consultarImportesDePersona,
  registrarImporte,
  volverAPendiente,
} from "./gestionar-fuentes-externas";
import { posicionesDuplicadas } from "./duplicados";
import { crearRepositorioEnMemoria } from "./repositorio-en-memoria";
import { TIPOS_DE_FUENTE } from "./tipos-de-fuente";

const finanzas: Actor = { id: "fin-1", rol: "finanzas" };
const otrosRoles: Array<[string, Actor]> = [
  ["el Administrador del sistema", { id: "adm-1", rol: "administrador" }],
  ["un gerente de área", { id: "ger-1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ["Recursos Humanos", { id: "rrhh-1", rol: "recursos_humanos" }],
];
const ANA = "11111111";
const BETO = "22222222";
const MES = "2026-10";

describe("fuentes externas del mes de pago", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;
  let repositorio: typeof contexto.repositorio;

  beforeEach(() => {
    contexto = crearRepositorioEnMemoria({ [ANA]: "Ana Sintética", [BETO]: "Beto Sintético" });
    repositorio = contexto.repositorio;
  });

  const solicitud = (cambios: Partial<Parameters<typeof registrarImporte>[2]> = {}) => ({
    tipoDeFuente: "comisiones_de_ventas", dni: ANA, concepto: "comision_de_ventas", fechaDelHecho: "2026-09-28",
    mesDeDevengue: "2026-09", mesDeAplicacion: MES, monto: "250,50", ...cambios,
  });
  const registrar = (cambios: Partial<Parameters<typeof registrarImporte>[2]> = {}) => registrarImporte(repositorio, finanzas, solicitud(cambios));
  const estado = async (tipo = "comisiones_de_ventas") => (await consultarEstadoDeFuentes(repositorio, finanzas, MES)).find((fila) => fila.tipo.codigo === tipo)!;

  it("un importe externo conserva DNI, fecha del hecho, mes de devengue, mes de aplicación, monto y procedencia", async () => {
    const { importe } = await registrar();

    expect(importe).toMatchObject({
      dni: ANA, nombre: "Ana Sintética", concepto: "comision_de_ventas", tipoDeFuente: "comisiones_de_ventas", fechaDelHecho: "2026-09-28",
      mesDeDevengue: "2026-09", mesDeAplicacion: "2026-10", monto: 25050, procedencia: "carga_manual", registradoPorId: "fin-1", anuladoEn: null,
    });
    expect((await consultarFuente(repositorio, finanzas, "comisiones_de_ventas", MES))?.importes).toEqual([importe]);
  });

  it("todos los tipos aparecen en el mes y cada uno usa conceptos de su flujo", async () => {
    const filas = await consultarEstadoDeFuentes(repositorio, finanzas, MES);

    expect(filas.map((fila) => fila.tipo.codigo)).toEqual(TIPOS_DE_FUENTE.map((tipo) => tipo.codigo));
    for (const tipo of TIPOS_DE_FUENTE) {
      for (const concepto of tipo.conceptos) expect(buscarConcepto(concepto)?.origen, concepto).toBe(tipo.codigo === "ajustes_de_preliquidacion" ? "ajuste" : "fuente_externa");
    }
  });

  describe("pendiente frente a cero confirmado", () => {
    it("sin confirmar, la ausencia de una fila es dato pendiente, no cero", async () => {
      await registrar();

      const porTipo = await consultarImportesDePersona(repositorio, finanzas, BETO, MES);

      expect(porTipo.comisiones_de_ventas).toEqual({ estado: "pendiente" });
      expect((await estado()).estado).toBe("pendiente");
    });

    it("confirmar un tipo sin importes lo deja como cero confirmado, distinto de pendiente", async () => {
      const confirmacion = await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "adelantos", mes: MES });

      expect(confirmacion).toMatchObject({ tipoDeFuente: "adelantos", mesDeAplicacion: MES, confirmadaPorId: "fin-1" });
      expect(await estado("adelantos")).toMatchObject({ estado: "confirmada_sin_importes", filas: 0, total: 0 });
      const porTipo = await consultarImportesDePersona(repositorio, finanzas, ANA, MES);
      expect(porTipo.adelantos).toEqual({ estado: "confirmado", importes: [], total: 0 });
      expect(porTipo.prestamos).toEqual({ estado: "pendiente" });
    });

    it("confirmar con importes: la persona sin fila vale cero y quien tiene fila aporta su total", async () => {
      await registrar({ monto: "100" });
      await registrar({ fechaDelHecho: "2026-09-29", monto: "50,25" });
      await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "comisiones_de_ventas", mes: MES });

      expect(await estado()).toMatchObject({ estado: "confirmada_con_importes", filas: 2, total: 15025 });
      const ana = await consultarImportesDePersona(repositorio, finanzas, ANA, MES);
      const beto = await consultarImportesDePersona(repositorio, finanzas, BETO, MES);
      expect(ana.comisiones_de_ventas).toMatchObject({ estado: "confirmado", total: 15025 });
      expect(beto.comisiones_de_ventas).toEqual({ estado: "confirmado", importes: [], total: 0 });
    });

    it("la confirmación es del mes: otro mes sigue pendiente", async () => {
      await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "adelantos", mes: MES });

      const otroMes = await consultarImportesDePersona(repositorio, finanzas, ANA, "2026-11");

      expect(otroMes.adelantos).toEqual({ estado: "pendiente" });
    });

    it("no se confirma dos veces; volver a pendiente deshace la confirmación y no se repite", async () => {
      await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "adelantos", mes: MES });
      await expect(confirmarFuente(repositorio, finanzas, { tipoDeFuente: "adelantos", mes: MES })).rejects.toThrow(/ya está confirmada/);

      await volverAPendiente(repositorio, finanzas, { tipoDeFuente: "adelantos", mes: MES });

      expect((await estado("adelantos")).estado).toBe("pendiente");
      await expect(volverAPendiente(repositorio, finanzas, { tipoDeFuente: "adelantos", mes: MES })).rejects.toThrow(/ya está pendiente/);
    });

    it("cargar o anular una fila de una fuente confirmada la devuelve a Pendiente", async () => {
      await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "comisiones_de_ventas", mes: MES });
      const cargada = await registrar();
      expect(cargada.volvioAPendiente).toBe(true);
      expect((await estado()).estado).toBe("pendiente");

      await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "comisiones_de_ventas", mes: MES });
      const anulada = await anularImporte(repositorio, finanzas, { importeId: cargada.importe.id, motivo: "Monto mal digitado" });
      expect(anulada.volvioAPendiente).toBe(true);
      expect((await estado()).estado).toBe("pendiente");
    });

    it("cargar en una fuente pendiente no avisa de ningún retroceso", async () => {
      expect((await registrar()).volvioAPendiente).toBe(false);
    });
  });

  describe("importes duplicados", () => {
    it("un importe idéntico a uno cargado se rechaza y no se guarda", async () => {
      await registrar();

      await expect(registrar()).rejects.toThrow(/Ya existe ese importe: Ana Sintética \(11111111\)/);

      expect(contexto.importes()).toHaveLength(1);
    });

    it("otro monto, otra fecha del hecho, otro devengue u otra persona no son duplicados", async () => {
      await registrar();
      await registrar({ monto: "250,51" });
      await registrar({ fechaDelHecho: "2026-09-27" });
      await registrar({ mesDeDevengue: "2026-08" });
      await registrar({ dni: BETO });

      expect(contexto.importes()).toHaveLength(5);
    });

    it("un importe anulado deja de contar: se puede volver a cargar", async () => {
      const { importe } = await registrar();
      await anularImporte(repositorio, finanzas, { importeId: importe.id, motivo: "Se cargó por error" });

      await expect(registrar()).resolves.toBeDefined();
    });

    it("la regla compartida señala las filas que repiten una existente o una anterior de la misma lista", () => {
      const clave = { dni: ANA, concepto: "adelanto", fechaDelHecho: "2026-10-03", mesDeDevengue: "2026-10", mesDeAplicacion: "2026-10", monto: 5000 };

      expect(posicionesDuplicadas([clave, { ...clave, monto: 6000 }, clave])).toEqual([2]);
      expect(posicionesDuplicadas([clave, { ...clave, dni: BETO }], [clave])).toEqual([0]);
    });
  });

  describe("Finanzas no edita líneas calculadas", () => {
    it.each(["horas_extra_25", "reduccion_por_tardanza", "sueldo_basico", "aporte_onp", "essalud_patronal"])("no se carga a mano %s: es una línea calculada", async (concepto) => {
      await expect(registrar({ concepto })).rejects.toThrow(/línea calculada.*ajuste de preliquidación/);
      expect(contexto.importes()).toHaveLength(0);
    });

    it("el ajuste de preliquidación tiene su propio flujo: no se carga como importe de fuente", async () => {
      await expect(registrar({ concepto: "ajuste_de_preliquidacion" })).rejects.toThrow(/no se carga en Comisiones de ventas/);
    });

    it("un concepto de otro tipo de fuente tampoco se carga en este", async () => {
      await expect(registrar({ concepto: "adelanto" })).rejects.toThrow(/no se carga en Comisiones de ventas/);
    });

    it("un concepto fuera del catálogo no se acepta", async () => {
      await expect(registrar({ concepto: "bono_libre" })).rejects.toThrow("Elija el concepto de la lista.");
    });

    it("no existe operación que modifique un importe cargado: anular conserva su monto y su motivo", async () => {
      const { importe } = await registrar();
      await anularImporte(repositorio, finanzas, { importeId: importe.id, motivo: "Otro monto" });

      expect(contexto.importes()[0]).toMatchObject({ monto: 25050, motivoDeAnulacion: "Otro monto" });
      expect(contexto.importes()[0].anuladoEn).toBeInstanceOf(Date);
    });
  });

  describe("validaciones", () => {
    it("rechaza un tipo de fuente que no está en el catálogo", async () => {
      await expect(registrar({ tipoDeFuente: "bonos_libres" })).rejects.toThrow("Elija el tipo de fuente de la lista.");
    });

    it("rechaza un DNI mal escrito o de una persona que no existe", async () => {
      await expect(registrar({ dni: "123" })).rejects.toThrow(/DNI/);
      await expect(registrar({ dni: "99999999" })).rejects.toThrow("No existe una persona con DNI 99999999.");
    });

    it("conserva los tres tiempos separados: acepta un devengue anterior, igual o posterior al mes de aplicación", async () => {
      await registrar({ mesDeDevengue: "2026-10", fechaDelHecho: "2026-10-01" });
      await registrar({ mesDeDevengue: "2026-03", fechaDelHecho: "2026-03-10" });
      await registrar({ mesDeDevengue: "2026-11", fechaDelHecho: "2026-09-28" });
      expect(contexto.importes().map(({ mesDeDevengue }) => mesDeDevengue)).toEqual(["2026-10", "2026-03", "2026-11"]);
    });

    it.each(["0", "-5", "abc", "", "1,234", "S/ 0"])("rechaza el monto %j", async (monto) => {
      await expect(registrar({ monto })).rejects.toThrow(/importe debe ser un monto/);
    });

    it("acepta montos con S/, coma o punto decimal", async () => {
      expect((await registrar({ monto: "S/ 1250,5" })).importe.monto).toBe(125050);
      expect((await registrar({ monto: "10.25" })).importe.monto).toBe(1025);
    });

    it("rechaza meses y fechas inválidos", async () => {
      await expect(registrar({ mesDeAplicacion: "2026-13" })).rejects.toThrow(/mes de aplicación no es válido/);
      await expect(registrar({ mesDeDevengue: "09/2026" })).rejects.toThrow(/mes de devengue no es válido/);
      await expect(registrar({ fechaDelHecho: "2026-02-30" })).rejects.toThrow(/fecha del hecho no es válida/);
      await expect(consultarEstadoDeFuentes(repositorio, finanzas, "octubre")).rejects.toThrow(/mes de pago no es válido/);
    });

    it("anular exige un motivo de hasta 250 caracteres y un importe existente", async () => {
      const { importe } = await registrar();
      await expect(anularImporte(repositorio, finanzas, { importeId: importe.id, motivo: "  " })).rejects.toThrow("Escriba el motivo de la anulación.");
      await expect(anularImporte(repositorio, finanzas, { importeId: importe.id, motivo: "x".repeat(251) })).rejects.toThrow(/250 caracteres/);
      await expect(anularImporte(repositorio, finanzas, { importeId: "no-es-un-id", motivo: "x" })).rejects.toThrow("No existe ese importe.");
      await anularImporte(repositorio, finanzas, { importeId: importe.id, motivo: "ok" });
      await expect(anularImporte(repositorio, finanzas, { importeId: importe.id, motivo: "otra vez" })).rejects.toThrow(/ya fue anulado/);
    });

    it("un mes con pago confirmado no admite cambios en sus fuentes", async () => {
      const { importe } = await registrar();
      contexto.mesesConPagoConfirmado.add(MES);

      await expect(registrar({ monto: "1" })).rejects.toThrow(/tiene el pago realizado confirmado/);
      await expect(anularImporte(repositorio, finanzas, { importeId: importe.id, motivo: "x" })).rejects.toThrow(/tiene el pago realizado confirmado/);
      await expect(confirmarFuente(repositorio, finanzas, { tipoDeFuente: "adelantos", mes: MES })).rejects.toThrow(/tiene el pago realizado confirmado/);
      await expect(volverAPendiente(repositorio, finanzas, { tipoDeFuente: "adelantos", mes: MES })).rejects.toThrow(/tiene el pago realizado confirmado/);
    });
  });

  describe("resumen por tipo", () => {
    it("cuenta filas y suma importes de cada tipo, y dice de dónde viene lo último que se cargó", async () => {
      await registrar({ monto: "100" });
      await registrar({ fechaDelHecho: "2026-09-29", monto: "20" });
      await registrar({ tipoDeFuente: "adelantos", concepto: "adelanto", fechaDelHecho: "2026-10-03", mesDeDevengue: "2026-10", monto: "300" });

      expect(await estado()).toMatchObject({ filas: 2, total: 12000, ultimoOrigen: { procedencia: "carga_manual", registradoPorId: "fin-1" } });
      expect(await estado("adelantos")).toMatchObject({ filas: 1, total: 30000 });
      expect(await estado("prestamos")).toMatchObject({ estado: "pendiente", filas: 0, total: 0, ultimoOrigen: undefined });
    });

    it("las filas anuladas no cuentan ni se listan", async () => {
      const { importe } = await registrar();
      await anularImporte(repositorio, finanzas, { importeId: importe.id, motivo: "Duplicada en Excel" });

      expect(await estado()).toMatchObject({ filas: 0, total: 0 });
      expect((await consultarFuente(repositorio, finanzas, "comisiones_de_ventas", MES))?.importes).toEqual([]);
    });

    it("una fuente que no existe en el catálogo devuelve undefined", async () => {
      expect(await consultarFuente(repositorio, finanzas, "bonos_libres", MES)).toBeUndefined();
    });
  });

  describe("permisos: solo Finanzas", () => {
    it.each(otrosRoles)("%s no consulta ni edita las fuentes externas", async (_nombre, actor) => {
      const { importe } = await registrar();

      await expect(consultarEstadoDeFuentes(repositorio, actor, MES)).rejects.toThrow(/No tiene permiso/);
      await expect(consultarFuente(repositorio, actor, "adelantos", MES)).rejects.toThrow(/No tiene permiso/);
      await expect(consultarImportesDePersona(repositorio, actor, ANA, MES)).rejects.toThrow(/No tiene permiso/);
      await expect(registrarImporte(repositorio, actor, solicitud({ monto: "1" }))).rejects.toThrow(/No tiene permiso/);
      await expect(anularImporte(repositorio, actor, { importeId: importe.id, motivo: "x" })).rejects.toThrow(/No tiene permiso/);
      await expect(confirmarFuente(repositorio, actor, { tipoDeFuente: "adelantos", mes: MES })).rejects.toThrow(/No tiene permiso/);
      await expect(volverAPendiente(repositorio, actor, { tipoDeFuente: "adelantos", mes: MES })).rejects.toThrow(/No tiene permiso/);
      expect(contexto.importes()).toHaveLength(1);
      expect(contexto.confirmaciones()).toHaveLength(0);
    });
  });
});
