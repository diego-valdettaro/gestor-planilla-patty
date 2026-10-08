import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { obtenerActorActual } = vi.hoisted(() => ({ obtenerActorActual: vi.fn() }));

vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual }));

import { HOJA_DE_IMPORTES } from "@/fuentes-externas/parsear-archivo-de-fuente";

import { GET } from "./route";

const pedir = (consulta: string) => GET(new NextRequest(`http://localhost/pagos/fuentes-externas/plantilla${consulta}`));

describe("plantilla normalizada de una fuente externa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerActorActual.mockResolvedValue({ id: "fin-1", rol: "finanzas" });
  });

  it("Finanzas descarga un XLSX con los encabezados del tipo y sin filas de datos", async () => {
    const respuesta = await pedir("?tipo=prestamos");
    const libro = XLSX.read(await respuesta.arrayBuffer());

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(respuesta.headers.get("content-disposition")).toContain('filename="plantilla-prestamos.xlsx"');
    expect(XLSX.utils.sheet_to_json(libro.Sheets[HOJA_DE_IMPORTES], { header: 1 })).toEqual([["DNI", "Concepto", "Fecha del hecho", "Mes de devengue", "Importe"]]);
    expect(XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets.Instrucciones, { header: 1 }).flat()).toContain("cuota_de_prestamo");
  });

  it("pide un tipo de fuente válido", async () => {
    expect((await pedir("")).status).toBe(400);
    expect((await pedir("?tipo=otro")).status).toBe(400);
  });

  it.each([
    ["el Administrador del sistema", { id: "a", rol: "administrador" }],
    ["un gerente de área", { id: "g", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
    ["Recursos Humanos", { id: "r", rol: "recursos_humanos" }],
  ])("responde 403 a %s", async (_nombre, actor) => {
    obtenerActorActual.mockResolvedValue(actor);
    expect((await pedir("?tipo=prestamos")).status).toBe(403);
  });

  it("responde 403 sin sesión", async () => {
    obtenerActorActual.mockRejectedValue(new Error("La sesión no es válida."));
    expect((await pedir("?tipo=prestamos")).status).toBe(403);
  });
});
