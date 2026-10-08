import { createHash } from "node:crypto";

import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), revalidar: vi.fn(), conservar: vi.fn(), descartar: vi.fn(), repositorio: undefined as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: simulacro.revalidar }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/fuentes-externas/servicio", () => ({
  get repositorioDeFuentesExternas() { return simulacro.repositorio; },
}));
vi.mock("@/importaciones/almacenamiento-local", () => ({ conservarContenido: simulacro.conservar, descartarArchivoFuente: simulacro.descartar }));

import type { Actor } from "@/autenticacion/permisos";
import { confirmarFuente } from "@/fuentes-externas/gestionar-fuentes-externas";
import { ENCABEZADOS_DE_FUENTE, HOJA_DE_IMPORTES } from "@/fuentes-externas/parsear-archivo-de-fuente";
import { crearRepositorioEnMemoria } from "@/fuentes-externas/repositorio-en-memoria";

import { procesarArchivoDeFuente } from "./actions";

const finanzas: Actor = { id: "fin-1", rol: "finanzas" };
const ANA = "11111111";
const MES = "2026-10";

function xlsx(...filas: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...ENCABEZADOS_DE_FUENTE], ...filas]), HOJA_DE_IMPORTES);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}
const comision = (dni: string, monto: number) => [dni, "comision_de_ventas", "2026-09-28", "2026-09", monto];

function formulario(contenido: Uint8Array | undefined, campos: Record<string, string> = {}, nombre = "comisiones.xlsx"): FormData {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries({ tipoDeFuente: "comisiones_de_ventas", mes: MES, accion: "validar", ...campos })) datos.set(campo, valor);
  if (contenido) datos.set("archivo", new File([contenido as BlobPart], nombre));
  return datos;
}

describe("acción de importar un archivo fuente (borde del servidor)", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;

  beforeEach(() => {
    vi.clearAllMocks();
    contexto = crearRepositorioEnMemoria({ [ANA]: "Ana Sintética" });
    simulacro.repositorio = contexto.repositorio;
    simulacro.actor.mockResolvedValue(finanzas);
    simulacro.conservar.mockImplementation(async (nombre: string, contenido: Uint8Array) => ({ nombre, ubicacion: `/almacen/${nombre}`, hashSha256: createHash("sha256").update(contenido).digest("hex") }));
    simulacro.descartar.mockResolvedValue(undefined);
  });

  it("«Validar archivo» devuelve la vista previa y no guarda nada", async () => {
    const estado = await procesarArchivoDeFuente({}, formulario(xlsx(comision(ANA, 100), comision(ANA, 50.5))));

    expect(estado.error).toBeUndefined();
    expect(estado.vista).toMatchObject({
      tipoNombre: "Comisiones de ventas", mes: MES, nombre: "comisiones.xlsx", errores: [], fuenteConfirmada: false,
      resumen: { filasValidas: 2, filasConError: 0, duplicadas: 0, personasDesconocidas: 0, total: 15050 },
    });
    expect(estado.vista?.hashAbreviado).toMatch(/^[0-9a-f]{8}$/);
    expect(contexto.importes()).toEqual([]);
    expect(simulacro.conservar).not.toHaveBeenCalled();
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it("la vista previa lista los errores por fila y no importa", async () => {
    const estado = await procesarArchivoDeFuente({}, formulario(xlsx(comision(ANA, 100), comision("99999999", 5))));

    expect(estado.vista).toMatchObject({ resumen: { filasValidas: 1, filasConError: 1, personasDesconocidas: 1 }, errores: [{ fila: 3, dni: "99999999", motivo: expect.stringContaining("DNI desconocido") }] });
  });

  it("«Importar» conserva el archivo, crea los importes, refresca las pantallas y cuenta quién y cuándo", async () => {
    const contenido = xlsx(comision(ANA, 100));
    const estado = await procesarArchivoDeFuente({}, formulario(contenido, { accion: "importar" }));

    expect(estado.error).toBeUndefined();
    expect(estado.resultado).toMatchObject({ nombre: "comisiones.xlsx", hashAbreviado: createHash("sha256").update(contenido).digest("hex").slice(0, 8), filas: 1, total: 10000, tipoNombre: "Comisiones de ventas", mes: MES, volvioAPendiente: false, responsable: "usuario-fin-1" });
    expect(contexto.importes()).toMatchObject([{ dni: ANA, procedencia: "archivo:comisiones.xlsx", registradoPorId: "fin-1" }]);
    expect(simulacro.revalidar).toHaveBeenCalledWith("/pagos/fuentes-externas");
    expect(simulacro.revalidar).toHaveBeenCalledWith("/pagos/fuentes-externas/[tipo]", "page");
    expect(simulacro.descartar).not.toHaveBeenCalled();
  });

  it("avisa que la fuente confirmada vuelve a Pendiente y que reemplazó un archivo anterior", async () => {
    await procesarArchivoDeFuente({}, formulario(xlsx(comision(ANA, 100)), { accion: "importar" }, "primero.xlsx"));
    await confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente: "comisiones_de_ventas", mes: MES });

    const vista = await procesarArchivoDeFuente({}, formulario(xlsx(comision(ANA, 200)), {}, "segundo.xlsx"));
    expect(vista.vista).toMatchObject({ fuenteConfirmada: true, reemplaza: { archivoNombre: "primero.xlsx", importadoPor: "usuario-fin-1" } });

    const estado = await procesarArchivoDeFuente({}, formulario(xlsx(comision(ANA, 200)), { accion: "importar" }, "segundo.xlsx"));
    expect(estado.resultado).toMatchObject({ volvioAPendiente: true, reemplazo: "primero.xlsx" });
  });

  it("importar un archivo con errores no guarda nada y devuelve la vista con los errores", async () => {
    const estado = await procesarArchivoDeFuente({}, formulario(xlsx(comision(ANA, 100), comision("99999999", 5)), { accion: "importar" }));

    expect(estado.resultado).toBeUndefined();
    expect(estado.vista?.errores).toHaveLength(1);
    expect(contexto.importes()).toEqual([]);
    expect(simulacro.descartar).toHaveBeenCalledTimes(simulacro.conservar.mock.calls.length);
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it("el mismo archivo dos veces vuelve como error del archivo", async () => {
    const contenido = xlsx(comision(ANA, 100));
    await procesarArchivoDeFuente({}, formulario(contenido, { accion: "importar" }));

    const estado = await procesarArchivoDeFuente({}, formulario(contenido, { accion: "importar" }, "copia.xlsx"));

    expect(estado.error).toMatch(/Este archivo ya se importó/);
    expect(estado.vista).toBeUndefined();
    expect(contexto.importes()).toHaveLength(1);
  });

  it("los errores de entrada vuelven junto al formulario", async () => {
    expect(await procesarArchivoDeFuente({}, formulario(undefined))).toEqual({ error: "Seleccione el archivo XLSX normalizado." });
    expect(await procesarArchivoDeFuente({}, formulario(xlsx(comision(ANA, 1)), { tipoDeFuente: "otro" }))).toEqual({ error: "Elija el tipo de fuente de la lista." });
    expect(await procesarArchivoDeFuente({}, formulario(xlsx(comision(ANA, 1)), { mes: "" }))).toEqual({ error: "Falta el mes de pago." });
    expect((await procesarArchivoDeFuente({}, formulario(new TextEncoder().encode("texto")))).error).toMatch(/No se pudo leer el archivo XLSX/);
    expect((await procesarArchivoDeFuente({}, formulario(xlsx(comision(ANA, 1)), {}, "datos.csv"))).error).toMatch(/extensión \.xlsx/);
  });

  it("un rol sin permiso recibe el error y no se guarda nada", async () => {
    simulacro.actor.mockResolvedValue({ id: "adm-1", rol: "administrador" });

    const estado = await procesarArchivoDeFuente({}, formulario(xlsx(comision(ANA, 100)), { accion: "importar" }));

    expect(estado.error).toMatch(/No tiene permiso/);
    expect(contexto.importes()).toEqual([]);
    expect(simulacro.conservar).not.toHaveBeenCalled();
  });
});
