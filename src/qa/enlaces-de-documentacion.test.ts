import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Documentos vigentes: entrada del repo, diseños, desarrollo, despliegue y ADR. La evidencia histórica
// (docs/qa, docs/ralph-progress.md, el PRD inicial) no se reescribe y queda fuera.
const RAIZ = resolve(__dirname, "../..");
const HISTORICOS = new Set(["docs/ralph-progress.md", "docs/qa-issue-40-chrome.md", "docs/qa-resumen-cierre-exportacion.md"]);

function markdownDe(carpeta: string): string[] {
  return readdirSync(join(RAIZ, carpeta))
    .filter((nombre) => nombre.endsWith(".md"))
    .map((nombre) => `${carpeta}/${nombre}`);
}

const DOCUMENTOS = ["README.md", "AGENTS.md", "CONTEXT.md", ...markdownDe("docs"), ...markdownDe("docs/adr")].filter(
  (ruta) => !HISTORICOS.has(ruta),
);

function enlacesRelativos(texto: string): string[] {
  const sinBloquesDeCodigo = texto.replace(/```[\s\S]*?```/g, "");
  return [...sinBloquesDeCodigo.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((coincidencia) => coincidencia[1])
    .filter((destino) => !/^(https?:|mailto:|#)/.test(destino))
    .map((destino) => destino.split("#")[0]);
}

describe("enlaces de la documentación vigente", () => {
  it.each(DOCUMENTOS)("%s solo enlaza archivos que existen", (ruta) => {
    const texto = readFileSync(join(RAIZ, ruta), "utf8");
    const rotos = enlacesRelativos(texto).filter((destino) => !existsSync(join(RAIZ, dirname(ruta), destino)));

    expect(rotos).toEqual([]);
  });

  it.each(DOCUMENTOS)("%s no cita documentos retirados", (ruta) => {
    const texto = readFileSync(join(RAIZ, ruta), "utf8");

    expect(texto).not.toMatch(/docs\/agents\/|diseno-software-pagos\.md|diseno-interaccion-pagos\.md/);
  });
});
