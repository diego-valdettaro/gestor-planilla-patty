import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import type { CondicionLaboral } from "@/condiciones-laborales/vigencia";

import { conIndicadorDePago } from "./constancias-en-memoria";
import { exportarPreliquidacion } from "./exportar-mes";
import { MENSAJE_SIN_PERMISO, type DependenciasDeFinalizacion, type NuevaVersionDePago } from "./finalizar-mes";
import { crearRepositorioDeVersionesEnMemoria } from "./versiones-en-memoria";

const simulacro = vi.hoisted(() => ({ preparar: vi.fn() }));
vi.mock("./preparar-borrador", () => ({ prepararBorrador: simulacro.preparar }));

const CORTE = { inicio: "2026-09-26", fin: "2026-10-25" };
const finanzas: Actor = { id: "f1", rol: "finanzas", nombreUsuario: "finanzas" };
const sueldo = (importeCentimos: number) => ({ concepto: "sueldo_basico" as const, importeCentimos, dias: 30, sueldoMensualCentimos: importeCentimos, desde: "2026-10-01", hasta: "2026-10-30",
  mesDePago: "2026-10", corte: CORTE, mesDeDevengue: "2026-10", origen: "Condición laboral" as const });
const bases = [{ mesDeDevengue: "2026-10", pensionariaCentimos: 200000, essaludRemunerativaCentimos: 200000, essaludAplicableCentimos: 200000, quintaCentimos: 200000 }];

const borradorCon = (personas: number) => ({
  mesDePago: "2026-10", corte: CORTE, revisiones: [{ inicio: "2026-09-26", fin: "2026-10-25", numero: 1 }], bloqueosDelMes: [],
  fuentes: [{ nombre: "Adelantos", estado: "Pendiente", filas: 0 }],
  personas: Array.from({ length: personas }, () => ({ relacion: { id: "r1", dni: "10000001", nombre: "Ana", grupo: "Taller" }, sedeDeAdscripcion: "Taller",
    sueldoCalculadoCentimos: 200000, netoCentimos: 200000, bloqueos: [], lineas: [sueldo(200000)], basesPorDevengue: bases })),
});

const sedeVigente = (valor: string, registradaEn: string): CondicionLaboral => ({ id: valor, relacionId: "r1", dato: "sede_de_adscripcion", valor, vigenteDesde: "2026-01-01", registradaPorId: "f1",
  registradaPor: "finanzas", registradaEn: new Date(registradaEn), reemplazadaEn: null, motivoDeReemplazo: null });

function crearDependencias(condiciones: CondicionLaboral[] = []) {
  const { repositorio } = crearRepositorioDeVersionesEnMemoria();
  const dependencias = {
    fuentes: { relaciones: { listarConPersona: async () => [{ id: "r1", dni: "10000001", nombre: "Ana", grupo: "Taller", ingreso: "2026-01-01" }] }, condiciones: { listarTodas: async () => condiciones } },
    versiones: repositorio, pago: conIndicadorDePago(async () => false), ahora: () => new Date("2026-10-27T15:00:00Z"),
  } as unknown as DependenciasDeFinalizacion;
  const guardada: NuevaVersionDePago = { mesDePago: "2026-10", finalizadaPorId: "f1", finalizadaPor: "finanzas", finalizadaEn: new Date("2026-10-26T15:00:00Z"), reglas: [],
    revisiones: [{ periodoId: "p1", revisionId: "rev", numero: 1, inicio: "2026-09-26", fin: "2026-10-25" }],
    fuentes: [{ tipoDeFuente: "adelantos", nombre: "Adelantos", estado: "Confirmada", filas: 2, totalCentimos: 5000 }],
    personas: [{ relacionId: "r1", dni: "10000001", nombre: "Ana", subtotalCentimos: 111100, lineas: [sueldo(111100)], bases }] };
  return { dependencias, guardar: () => repositorio.guardarVersion(guardada) };
}

const hojas = (archivo: { contenido: Uint8Array }) => {
  const libro = XLSX.read(archivo.contenido, { type: "array" });
  return Object.fromEntries(libro.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[n], { header: 1, defval: "" })]));
};
const valorDe = (filas: unknown[][], rotulo: string) => filas.find(([r]) => r === rotulo)?.[1];

beforeEach(() => { simulacro.preparar.mockReset(); simulacro.preparar.mockResolvedValue(borradorCon(1)); });

describe("G5 permiso", () => {
  it.each([
    ["el Administrador", { id: "a", rol: "administrador" } as Actor],
    ["Recursos Humanos", { id: "r", rol: "recursos_humanos" } as Actor],
    ["un gerente de área", { id: "g", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] } as Actor],
    ["nadie (sin sesión)", undefined],
  ])("F-11 %s no exporta y no se leen los datos", async (_quien, actor) => {
    const { dependencias } = crearDependencias();
    await expect(exportarPreliquidacion(dependencias, actor, { mes: "2026-10" })).rejects.toThrow(MENSAJE_SIN_PERMISO);
    expect(simulacro.preparar).not.toHaveBeenCalled();
  });
});

describe("G6 origen de lo exportado", () => {
  it("F-12 sin versión pedida exporta el borrador calculado en ese momento", async () => {
    const { dependencias } = crearDependencias();
    const resultado = await exportarPreliquidacion(dependencias, finanzas, { mes: "2026-10" });
    expect(resultado.estado).toBe("lista");
    if (resultado.estado !== "lista") return;
    expect(resultado.archivo.nombre).toBe("preliquidacion-2026-10-borrador.xlsx");
    const libro = hojas(resultado.archivo);
    expect(valorDe(libro["Preliquidación"], "Estado")).toBe("Borrador, no definitivo");
    expect(valorDe(libro["Preliquidación"], "Generado por")).toBe("finanzas");
    expect(valorDe(libro["Preliquidación"], "Generado el")).toBe("27/10/2026");
    expect(libro["Personas"][1]).toEqual(["10000001", "Ana", "Taller", 2000, 2000, "Calculada", ""]);
    expect(libro["Fuentes"][1]).toEqual(["Adelantos", "Pendiente", 0]);
  });

  it("F-13 con versión N exporta lo guardado de esa versión, aunque el borrador de hoy sea otro, con la sede de cuando se finalizó", async () => {
    const { dependencias, guardar } = crearDependencias([sedeVigente("Taller", "2026-01-01T00:00:00Z"), sedeVigente("Tienda Benavides", "2026-10-27T00:00:00Z")]);
    await guardar();
    simulacro.preparar.mockResolvedValue(borradorCon(3));
    const resultado = await exportarPreliquidacion(dependencias, finanzas, { mes: "2026-10", version: 1 });
    expect(resultado.estado).toBe("lista");
    if (resultado.estado !== "lista") return;
    expect(resultado.archivo.nombre).toBe("preliquidacion-2026-10-version-1.xlsx");
    expect(simulacro.preparar).not.toHaveBeenCalled();
    const libro = hojas(resultado.archivo);
    expect(valorDe(libro["Preliquidación"], "Estado")).toBe("Versión 1 finalizada");
    expect(valorDe(libro["Preliquidación"], "Finalizada el")).toBe("26/10/2026");
    expect(libro["Personas"]).toHaveLength(2);
    expect(libro["Personas"][1]).toEqual(["10000001", "Ana", "Taller", 1111, 1111, "Calculada", ""]);
    expect(libro["Fuentes"][1]).toEqual(["Adelantos", "Confirmada", 2]);
  });

  it("F-14 una versión que no existe en el mes no se exporta", async () => {
    const { dependencias } = crearDependencias();
    expect(await exportarPreliquidacion(dependencias, finanzas, { mes: "2026-10", version: 7 })).toEqual({ estado: "sin_version" });
  });

  it("F-15 un mes sin personas no genera archivo y dice qué revisar", async () => {
    simulacro.preparar.mockResolvedValue(borradorCon(0));
    const { dependencias } = crearDependencias();
    expect(await exportarPreliquidacion(dependencias, finanzas, { mes: "2026-10" })).toEqual({
      estado: "sin_personas", mensaje: "No hay datos para exportar: revise las relaciones laborales confirmadas por Recursos Humanos" });
  });
});
