import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AlcanceDeFinalizacion, HuellaDeRevision, ResumenDeCambio } from "@/pagos/finalizar-mes";

import { decidirPantalla } from "./decision-de-finalizacion";
import { DialogoDeFinalizacion } from "./dialogo-de-finalizacion";

// Diálogo de finalizar el mes (#129, interacción §6, §6.1.a y §6.1.b, §4.6; C6 epoch 2: el importe total se llama «subtotal» con el rótulo vigente).
// Personas y cifras del plan (mes 2026-10): Ana S/ 2.000,00, Beto S/ 1.500,00 y Carla S/ 1.000,00; subtotal total S/ 4.500,00 (aritmética manual de #96, historia 5).
// Se prueba la presentación (renderToStaticMarkup): el navegador (foco, Escape, «Guardando…» en vivo) es QA.
const ROTULO = "Neto antes de aportes del trabajador";
const alcance: AlcanceDeFinalizacion = { personas: 3, subtotalCentimos: 450000, numeroDeVersion: 1, periodos: [{ inicio: "2026-09-26", fin: "2026-10-25" }] };
const huella: HuellaDeRevision = { entrada: "a".repeat(64), datos: {}, subtotalCentimos: 450000, personas: [] };

const dialogo = (propiedades: Partial<React.ComponentProps<typeof DialogoDeFinalizacion>> = {}) =>
  renderToStaticMarkup(React.createElement(DialogoDeFinalizacion, { mes: "2026-10", modo: "normal", alcance, huella, ...propiedades }));

beforeEach(() => { vi.stubGlobal("React", React); });

describe("diálogo de finalizar el mes", () => {
  it("F-46 pide confirmar con la consecuencia, el alcance con el subtotal rotulado y la cancelación", () => {
    const html = dialogo();

    expect(html).toMatch(/<h2[^>]*>¿Finalizar la preliquidación de 10\/2026\?<\/h2>/);
    expect(html).toContain(`Se guardará una versión para 3 personas del mes (subtotal «${ROTULO}»: S/ 4.500,00). No se finaliza persona por persona.`);
    expect(html).toContain("La versión 1 no se podrá editar. Queda vinculada a los períodos de planilla 26/09–25/10 y a las reglas y fuentes de hoy. Antes de confirmar el pago puede crear otra versión sin modificar esta.");
    expect(html).toContain("Cancelar no guarda nada.");
    expect(html).toMatch(/<button[^>]*>Cancelar<\/button>/);
    expect(html).toMatch(/<button[^>]*boton-principal[^>]*type="submit"[^>]*>Finalizar mes<\/button>/);
    expect(html.toLowerCase()).not.toContain("neto total");
    expect(html.toLowerCase()).not.toContain("neto definitivo");
    // La acción del servidor lee el mes y la huella de lo revisado.
    expect(html).toContain('name="mes" value="2026-10"');
    expect(JSON.parse(/name="huella" value="([^"]*)"/.exec(html)![1].replaceAll("&quot;", '"'))).toEqual(huella);
  });

  it("F-46 con varios períodos los une y con una sola persona lo dice en singular", () => {
    const html = dialogo({ alcance: { personas: 1, subtotalCentimos: 200000, numeroDeVersion: 2, periodos: [{ inicio: "2026-09-26", fin: "2026-10-10" }, { inicio: "2026-10-11", fin: "2026-10-25" }] } });

    expect(html).toContain("para 1 persona del mes (subtotal");
    expect(html).not.toContain("1 personas");
    expect(html).toContain("La versión 2 no se podrá editar. Queda vinculada a los períodos de planilla 26/09–10/10 y 11/10–25/10 y a las reglas y fuentes de hoy.");
  });

  const cambio: ResumenDeCambio = { datosCambiados: ["Condiciones laborales"], subtotalAnteriorCentimos: 450000, subtotalActualCentimos: 460000,
    personas: [{ dni: "10000001", nombre: "Ana", anteriorCentimos: 200000, actualCentimos: 210000 }] };

  it("F-47 si el cálculo cambió no guarda: muestra el subtotal anterior y actual y las personas con diferencia, y pide revisar", () => {
    const html = dialogo({ modo: "cambio", cambio });

    expect(html).toMatch(/<h2[^>]*>El cálculo cambió desde su revisión<\/h2>/);
    expect(html).toContain("Cambiaron datos desde el borrador que revisó. Revise el cálculo actualizado antes de finalizar.");
    expect(html).toContain("Ana");
    expect(html).toContain("S/ 2.000,00 → S/ 2.100,00");
    expect(html).toMatch(/[Ss]ubtotal/);
    expect(html).toContain(ROTULO);
    expect(html).toContain("S/ 4.500,00");
    expect(html).toContain("S/ 4.600,00");
    expect(html).toMatch(/<button[^>]*>Cancelar<\/button>/);
    expect(html).toMatch(/<button[^>]*boton-principal[^>]*>Revisar cálculo actualizado<\/button>/);
    expect(html).not.toContain("Finalizar mes");
    expect(html).not.toContain("<form");
    expect(html.toLowerCase()).not.toContain("neto total");
  });

  it("F-47 una persona sin subtotal anterior muestra «Pendiente», no S/ 0,00", () => {
    const html = dialogo({ modo: "cambio", cambio: { ...cambio, personas: [{ dni: "10000004", nombre: "Dora", anteriorCentimos: null, actualCentimos: 120000 }] } });

    expect(html).toContain("Dora");
    expect(html).toContain("Pendiente → S/ 1.200,00");
    expect(html).not.toContain("S/ 0,00");
  });

  it("F-47 un cambio sin diferencia de subtotales indica qué dato cambió y no lista personas", () => {
    const html = dialogo({ modo: "cambio", cambio: { datosCambiados: ["Reglas legales"], subtotalAnteriorCentimos: 450000, subtotalActualCentimos: 450000, personas: [] } });

    expect(html).toContain("Reglas legales");
    expect(html).not.toContain("→");
    expect(html).not.toContain("<li");
  });

  it("F-48 mientras guarda, el botón de confirmar dice «Guardando…» y está deshabilitado", () => {
    const guardando = dialogo({ pendiente: true });
    const enReposo = dialogo({ pendiente: false });

    expect(guardando).toMatch(/<button[^>]*disabled=""[^>]*>Guardando…<\/button>/);
    expect(guardando).not.toMatch(/>Finalizar mes<\/button>/);
    expect(enReposo).toMatch(/<button[^>]*>Finalizar mes<\/button>/);
    expect(enReposo).not.toMatch(/<button[^>]*disabled/);
  });

  it("F-49 si falla, el error se anuncia dentro del diálogo, que mantiene Cancelar y confirmar", () => {
    const html = dialogo({ error: "No se guardó ninguna versión" });

    expect(html).toMatch(/<p class="mensaje-operacion error" role="alert">No se guardó ninguna versión<\/p>/);
    expect(html).toMatch(/<button[^>]*>Cancelar<\/button>/);
    expect(html).toMatch(/<button[^>]*>Finalizar mes<\/button>/);
    expect(dialogo()).not.toContain('role="alert"');
  });
});

describe("qué hace la pantalla con el resultado de verificar", () => {
  const cambio: ResumenDeCambio = { datosCambiados: [], subtotalAnteriorCentimos: 450000, subtotalActualCentimos: 460000, personas: [] };

  // Decisión de Diego 2026-10-18 e interacción §6.1: con bloqueos nuevos no se abre el diálogo, se actualiza el panel y el foco va al panel.
  it("F-50 con bloqueos nuevos no abre el diálogo y manda el foco al panel de bloqueos", () => {
    expect(decidirPantalla({ bloqueado: ["Sin sueldo vigente."] })).toEqual({ abrir: false, foco: "bloqueos" });
  });

  it("F-50 si el cálculo cambió abre el diálogo en modo «cambió»", () => {
    expect(decidirPantalla({ cambio })).toEqual({ abrir: true, modo: "cambio" });
  });

  it("F-50 si la verificación sale lista abre el diálogo normal", () => {
    expect(decidirPantalla({ listo: 1 })).toEqual({ abrir: true, modo: "normal" });
  });

  it("F-50 si la verificación falla abre el diálogo normal, donde se muestra el error", () => {
    expect(decidirPantalla({ error: "No se guardó ninguna versión" })).toEqual({ abrir: true, modo: "normal" });
  });
});
