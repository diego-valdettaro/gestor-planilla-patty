import { describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";

import { registrarConciliacionDeCese } from "./conciliacion-de-cese";
import { anularImporte, confirmarFuente, consultarFuente, registrarImporte } from "./gestionar-fuentes-externas";
import { previsualizarImportacionDeFuente } from "./importar-fuente";
import { crearRepositorioEnMemoria } from "./repositorio-en-memoria";

// Carga de la conciliación de la liquidación por cese (#128). Esperados de ejemplos-sinteticos.md (C-E2, C-E6, C-E7, C-E10), en céntimos.
// Personas y datos sintéticos.
const TIPO = "conciliacion_de_liquidacion_por_cese";
const MES = "2026-10";
const ANA = "11111111";
const finanzas: Actor = { id: "11111111-1111-4111-8111-111111111111", rol: "finanzas", nombreUsuario: "finanzas" };
const vacaciones = { dni: ANA, concepto: "vacaciones_truncas", fechaDelHecho: "2026-10-12", mesDeDevengue: MES, mesDeAplicacion: MES, monto: "400,00" };
const contexto = () => crearRepositorioEnMemoria({ [ANA]: "Ana" });

describe("conciliación de la liquidación por cese", () => {
  it("UC-01 Finanzas carga los conceptos de la liquidación con su fuente, fecha del hecho, devengue e importe, sin calcular nada", async () => {
    const { repositorio, importes } = contexto();
    const primero = await registrarConciliacionDeCese(repositorio, finanzas, vacaciones);
    const segundo = await registrarConciliacionDeCese(repositorio, finanzas, { ...vacaciones, concepto: "cts_trunca", monto: "900,00" });
    expect(primero).toMatchObject({ dni: ANA, concepto: "vacaciones_truncas", monto: 40000, tipoDeFuente: TIPO, fechaDelHecho: "2026-10-12", mesDeDevengue: MES, mesDeAplicacion: MES, procedencia: "carga_manual", registradoPorId: finanzas.id });
    expect(segundo).toMatchObject({ concepto: "cts_trunca", monto: 90000, tipoDeFuente: TIPO });
    expect(importes()).toHaveLength(2);
  });

  it("UC-02 el abono de la liquidación se registra con su fecha del hecho", async () => {
    const { repositorio } = contexto();
    const abono = await registrarConciliacionDeCese(repositorio, finanzas, { ...vacaciones, concepto: "abono_de_liquidacion", fechaDelHecho: "2026-10-13", monto: "700,00" });
    expect(abono).toMatchObject({ concepto: "abono_de_liquidacion", monto: 70000, fechaDelHecho: "2026-10-13", tipoDeFuente: TIPO });
  });

  it("UC-03 solo se cargan los conceptos del tipo", async () => {
    const { repositorio, importes } = contexto();
    await expect(registrarConciliacionDeCese(repositorio, finanzas, { ...vacaciones, concepto: "comision_de_ventas" })).rejects.toThrow(/no se carga en/);
    await expect(registrarConciliacionDeCese(repositorio, finanzas, { ...vacaciones, concepto: "ajuste_de_preliquidacion" })).rejects.toThrow(/no se carga en/);
    expect(importes()).toHaveLength(0);
  });

  it("UC-04 un importe cero o negativo, una persona inexistente o una fecha vacía se rechazan", async () => {
    const { repositorio, importes } = contexto();
    await expect(registrarConciliacionDeCese(repositorio, finanzas, { ...vacaciones, monto: "0" })).rejects.toThrow(/mayor que cero/);
    await expect(registrarConciliacionDeCese(repositorio, finanzas, { ...vacaciones, monto: "-5" })).rejects.toThrow();
    await expect(registrarConciliacionDeCese(repositorio, finanzas, { ...vacaciones, dni: "87654321" })).rejects.toThrow(/No existe una persona/);
    await expect(registrarConciliacionDeCese(repositorio, finanzas, { ...vacaciones, fechaDelHecho: "" })).rejects.toThrow();
    expect(importes()).toHaveLength(0);
  });

  it("UC-05 es un tipo de flujo propio: la carga genérica y el archivo XLSX lo rechazan", async () => {
    const { repositorio } = contexto();
    await expect(registrarImporte(repositorio, finanzas, { tipoDeFuente: TIPO, ...vacaciones })).rejects.toThrow(/formulario propio/);
    await expect(previsualizarImportacionDeFuente(repositorio, finanzas, { tipoDeFuente: TIPO, mes: MES, nombre: "liquidacion.xlsx", contenido: new Uint8Array() })).rejects.toThrow(/formulario propio/);
  });

  it("UC-06 solo Finanzas carga la conciliación", async () => {
    const { repositorio, importes } = contexto();
    await expect(registrarConciliacionDeCese(repositorio, { ...finanzas, rol: "gerente_de_area" }, vacaciones)).rejects.toThrow(/permiso/);
    await expect(registrarConciliacionDeCese(repositorio, { ...finanzas, rol: "administrador" }, vacaciones)).rejects.toThrow(/permiso/);
    expect(importes()).toHaveLength(0);
  });

  it("UC-07 registrar dos veces la misma clave se rechaza y el total cuenta una sola fila", async () => {
    const { repositorio } = contexto();
    await registrarConciliacionDeCese(repositorio, finanzas, vacaciones);
    await expect(registrarConciliacionDeCese(repositorio, finanzas, vacaciones)).rejects.toThrow(/Ya existe/);
    const detalle = await consultarFuente(repositorio, finanzas, TIPO, MES);
    expect(detalle?.filas).toBe(1);
    expect(detalle?.total).toBe(40000);
  });

  it("UC-08 corregir es anular con motivo: si la fuente estaba confirmada vuelve a pendiente", async () => {
    const { repositorio } = contexto();
    const fila = await registrarConciliacionDeCese(repositorio, finanzas, vacaciones);
    await confirmarFuente(repositorio, finanzas, { tipoDeFuente: TIPO, mes: MES });
    expect((await consultarFuente(repositorio, finanzas, TIPO, MES))?.estado).toBe("confirmada_con_importes");
    const resultado = await anularImporte(repositorio, finanzas, { importeId: fila.id, motivo: "Importe mal digitado" });
    expect(resultado.volvioAPendiente).toBe(true);
    const detalle = await consultarFuente(repositorio, finanzas, TIPO, MES);
    expect(detalle?.estado).toBe("pendiente");
    expect(detalle?.filas).toBe(0);
  });
});
