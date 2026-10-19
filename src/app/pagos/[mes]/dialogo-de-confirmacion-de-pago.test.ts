import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DialogoDeConfirmacionDePago } from "./dialogo-de-confirmacion-de-pago";

// Diálogo de confirmar el pago realizado (#130, interacción §6.2 y §4.7; contrato C4). Ejemplos E6: los del diseño (mes 10/2026, versión 2, 42 personas,
// S/ 48.210,35) y los del escenario (mes 11/2019, versión 1, 3 personas, S/ 4.500,00; aritmética manual de #96, historia 5). Se prueba la presentación
// (renderToStaticMarkup): el navegador (foco, Escape, «Registrando…» en vivo) es QA.
const dialogo = (propiedades: Partial<React.ComponentProps<typeof DialogoDeConfirmacionDePago>> = {}) =>
  renderToStaticMarkup(React.createElement(DialogoDeConfirmacionDePago, { mes: "2019-11", numeroDeVersion: 1, personas: 3, subtotalCentimos: 450000, responsable: "finanzas", hoy: "2019-12-02", ...propiedades }));

beforeEach(() => { vi.stubGlobal("React", React); });

type Caso = { fila: string; descripcion: string; comprobar: () => void };

const CONSECUENCIA = "No se podrá reemplazar esta preliquidación ni reabrir los períodos de planilla que la sustentan. No se puede deshacer en esta versión de la app. La app no ejecuta ni verifica la transferencia: solo registra su constancia.";

// G20 · Contenido del diálogo §6.2.
const casosG20: Caso[] = [
  {
    fila: "D1", descripcion: "título, alcance con versión, personas e importe, consecuencia literal, cancelación y responsable (ambos ejemplos)",
    comprobar: () => {
      const delDiseno = dialogo({ mes: "2026-10", numeroDeVersion: 2, personas: 42, subtotalCentimos: 4821035 });
      const delEscenario = dialogo();

      expect(delDiseno).toMatch(/<h2[^>]*tabindex="-1"[^>]*>¿Confirmar que se pagó 10\/2026 fuera de la app\?<\/h2>/);
      expect(delDiseno).toContain("Versión 2 del mes completo, 42 personas, S/ 48.210,35.");
      expect(delEscenario).toMatch(/<h2[^>]*tabindex="-1"[^>]*>¿Confirmar que se pagó 11\/2019 fuera de la app\?<\/h2>/);
      expect(delEscenario).toContain("Versión 1 del mes completo, 3 personas, S/ 4.500,00.");
      for (const html of [delDiseno, delEscenario]) {
        expect(html).toContain(CONSECUENCIA);
        expect(html).toContain("Cancelar no registra nada.");
        expect(html).toContain("Se registrará a nombre de finanzas");
      }
    },
  },
  {
    fila: "D2", descripcion: "fecha editable no futura, responsable de solo lectura y mes y versión ocultos",
    comprobar: () => {
      const html = dialogo({ mes: "2019-11", numeroDeVersion: 1, hoy: "2019-12-02" });

      const fecha = /<input[^>]*name="fecha"[^>]*>/.exec(html)?.[0] ?? "";
      expect(fecha).toContain('type="date"');
      expect(fecha).toContain('max="2019-12-02"');
      expect(fecha).toContain("required");
      expect(fecha).not.toMatch(/value=|readonly|disabled/);
      expect(html).toMatch(/<label[^>]*>Fecha del pago/);
      // El responsable es texto: no hay campo que Finanzas pueda editar ni que viaje como dato confiable.
      expect(html).not.toMatch(/<input[^>]*name="(responsable|usuario|confirmadaPor)"/);
      expect(html).toContain('name="mes" value="2019-11"');
      expect(html).toContain('name="version" value="1"');
    },
  },
  {
    fila: "D3", descripcion: "«Cancelar» no envía y «Confirmar pago realizado» es el botón principal que envía, no destructivo",
    comprobar: () => {
      const html = dialogo();

      expect(html).toMatch(/<button[^>]*type="button"[^>]*>Cancelar<\/button>/);
      expect(html).toMatch(/<button[^>]*boton-principal[^>]*type="submit"[^>]*>Confirmar pago realizado<\/button>/);
      expect(html).not.toContain("peligro");
    },
  },
];
describe("diálogo de confirmar el pago realizado", () => {
  it.each(casosG20)("G20 $fila $descripcion", ({ comprobar }) => comprobar());
});

// G21 · Estados del diálogo (§4.7 «Cargando» y «Error», §6 y V3).
const casosG21: Caso[] = [
  {
    fila: "D4", descripcion: "mientras registra, el botón dice «Registrando…» y está deshabilitado (no «Guardando…»)",
    comprobar: () => {
      const registrando = dialogo({ pendiente: true });
      const enReposo = dialogo({ pendiente: false });

      expect(registrando).toMatch(/<button[^>]*disabled=""[^>]*>Registrando…<\/button>/);
      expect(registrando).not.toContain("Guardando…");
      expect(registrando).not.toMatch(/>Confirmar pago realizado<\/button>/);
      expect(enReposo).toMatch(/<button[^>]*>Confirmar pago realizado<\/button>/);
      expect(enReposo).not.toMatch(/<button[^>]*disabled/);
    },
  },
  {
    fila: "D5", descripcion: "el error se anuncia junto al botón con «No se registró el pago» o con la causa del dominio, y el diálogo mantiene Cancelar y Confirmar",
    comprobar: () => {
      for (const error of ["No se registró el pago", "La fecha del pago no puede ser futura."]) {
        const html = dialogo({ error });

        expect(html).toContain(`<p class="mensaje-operacion error" role="alert">${error}</p>`);
        expect(html).toMatch(/<button[^>]*>Cancelar<\/button>/);
        expect(html).toMatch(/<button[^>]*>Confirmar pago realizado<\/button>/);
      }
      expect(dialogo()).not.toContain('role="alert"');
    },
  },
  {
    fila: "D6", descripcion: "el diálogo usa el contenedor de Pagos y las acciones que se apilan en ancho estrecho (V3)",
    comprobar: () => {
      const html = dialogo();

      expect(html).toMatch(/^<dialog[^>]*class="[^"]*\bdialogo-de-pagos\b[^"]*"/);
      expect(html).toContain('class="acciones-dialogo"');
    },
  },
];
describe("estados del diálogo de confirmar el pago realizado", () => {
  it.each(casosG21)("G21 $fila $descripcion", ({ comprobar }) => comprobar());
});
