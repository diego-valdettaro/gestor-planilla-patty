import { describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";

import { registrarAbonoVacacional } from "./abonos-vacacionales";
import { anularImporte, confirmarFuente, registrarImporte } from "./gestionar-fuentes-externas";
import { crearRepositorioEnMemoria } from "./repositorio-en-memoria";

const finanzas: Actor = { id: "11111111-1111-4111-8111-111111111111", rol: "finanzas", nombreUsuario: "finanzas" };
const datos = { dni: "12345678", fechaDelAbono: "2026-09-28", mesDeAplicacion: "2026-09", monto: "600,00" };

describe("abono anticipado de remuneración vacacional", () => {
  it("guarda persona, fecha e importe sin pedir los días del descanso", async () => {
    const { repositorio } = crearRepositorioEnMemoria({ [datos.dni]: "Ana" });
    const abono = await registrarAbonoVacacional(repositorio, finanzas, datos);
    expect(abono).toMatchObject({ dni: datos.dni, fechaDelHecho: "2026-09-28", mesDeDevengue: "2026-09", mesDeAplicacion: "2026-09", monto: 60000, tipoDeFuente: "abonos_vacacionales", concepto: "abono_anticipado_de_remuneracion_vacacional" });
    expect(await repositorio.listarAbonosVacacionales()).toHaveLength(1);
  });

  it("solo Finanzas lo registra, rechaza duplicados y mes con pago confirmado", async () => {
    const { repositorio, mesesConPagoConfirmado } = crearRepositorioEnMemoria({ [datos.dni]: "Ana" });
    await expect(registrarAbonoVacacional(repositorio, { ...finanzas, rol: "gerente_de_area" }, datos)).rejects.toThrow(/permiso/);
    await registrarAbonoVacacional(repositorio, finanzas, datos);
    await expect(registrarAbonoVacacional(repositorio, finanzas, datos)).rejects.toThrow(/Ya existe/);
    mesesConPagoConfirmado.add("2026-10");
    await expect(registrarAbonoVacacional(repositorio, finanzas, { ...datos, mesDeAplicacion: "2026-10" })).rejects.toThrow(/pago realizado/);
  });

  it("valida persona, fecha e importe", async () => {
    const { repositorio } = crearRepositorioEnMemoria({ [datos.dni]: "Ana" });
    await expect(registrarAbonoVacacional(repositorio, finanzas, { ...datos, dni: "87654321" })).rejects.toThrow(/No existe una persona/);
    await expect(registrarAbonoVacacional(repositorio, finanzas, { ...datos, fechaDelAbono: "" })).rejects.toThrow();
    await expect(registrarAbonoVacacional(repositorio, finanzas, { ...datos, monto: "0" })).rejects.toThrow(/mayor que cero/);
  });

  it("tiene su formulario propio: la carga genérica lo rechaza; se corrige anulando con motivo y devuelve la fuente a pendiente", async () => {
    const { repositorio, confirmaciones } = crearRepositorioEnMemoria({ [datos.dni]: "Ana" });
    await expect(registrarImporte(repositorio, finanzas, { tipoDeFuente: "abonos_vacacionales", concepto: "abono_anticipado_de_remuneracion_vacacional", dni: datos.dni, fechaDelHecho: datos.fechaDelAbono, mesDeDevengue: "2026-09", mesDeAplicacion: "2026-09", monto: datos.monto })).rejects.toThrow(/formulario propio/);
    const abono = await registrarAbonoVacacional(repositorio, finanzas, datos);
    await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "abonos_vacacionales", mes: "2026-09" });
    expect(confirmaciones()).toHaveLength(1);
    const resultado = await anularImporte(repositorio, finanzas, { importeId: abono.id, motivo: "Importe mal digitado" });
    expect(resultado.volvioAPendiente).toBe(true);
    expect(await repositorio.listarAbonosVacacionales()).toHaveLength(0);
  });
});
