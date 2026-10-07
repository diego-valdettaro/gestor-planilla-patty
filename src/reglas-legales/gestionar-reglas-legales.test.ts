import { beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";

import { REGLAS_LEGALES } from "./catalogo";
import {
  activarReglaLegal,
  consultarHistorialDeRegla,
  consultarReglaVigente,
  corregirReglaLegal,
  listarReglasLegales,
  textoDeUsoEnVersiones,
} from "./gestionar-reglas-legales";
import { crearRepositorioEnMemoria } from "./repositorio-en-memoria";

const finanzas: Actor = { id: "fin-1", rol: "finanzas" };
const otrosRoles: Array<[string, Actor]> = [
  ["el Administrador del sistema", { id: "adm-1", rol: "administrador" }],
  ["un gerente de área", { id: "ger-1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ["Recursos Humanos", { id: "rrhh-1", rol: "recursos_humanos" }],
];
const FUENTE = "Norma de prueba, art. 1";

describe("reglas legales con vigencia", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;
  let repositorio: typeof contexto.repositorio;

  beforeEach(() => {
    contexto = crearRepositorioEnMemoria();
    repositorio = contexto.repositorio;
  });

  const activar = (codigo: string, valor: string, vigenteDesde: string, fuenteOficial = FUENTE) => activarReglaLegal(repositorio, finanzas, { codigo, valor, vigenteDesde, fuenteOficial });

  it("cada valor activado conserva su vigencia, su fuente oficial y el usuario que lo activó", async () => {
    const regla = await activar("essalud_tasa", "8,5", "2025-01-01");

    expect(regla).toMatchObject({ codigo: "essalud_tasa", valor: 850, vigenteDesde: "2025-01-01", fuenteOficial: FUENTE, activadaPorId: "fin-1", reemplazadaEn: null });
    expect(regla.activadaEn).toBeInstanceOf(Date);
    expect(contexto.reglas()).toHaveLength(1);
  });

  it("consultar una fecha devuelve la versión vigente entonces", async () => {
    await activar("rmv", "1000", "2024-01-01");
    await activar("rmv", "1200,50", "2026-03-01", "Otra norma de prueba");

    const vigente = (fecha: string) => consultarReglaVigente(repositorio, finanzas, "rmv", fecha);
    expect(await vigente("2026-02-28")).toMatchObject({ estado: "vigente", regla: { valor: 100000, fuenteOficial: FUENTE } });
    expect(await vigente("2026-03-01")).toMatchObject({ estado: "vigente", regla: { valor: 120050, fuenteOficial: "Otra norma de prueba" } });
  });

  it("sin regla vigente el dato falta de forma explícita, no como cero ni como undefined", async () => {
    await activar("rmv", "1000", "2024-01-01");

    expect(await consultarReglaVigente(repositorio, finanzas, "rmv", "2023-12-31")).toEqual({ estado: "faltante", codigo: "rmv", fecha: "2023-12-31" });
    expect(await consultarReglaVigente(repositorio, finanzas, "onp_tasa", "2026-01-01")).toEqual({ estado: "faltante", codigo: "onp_tasa", fecha: "2026-01-01" });
  });

  it("una regla programada para después de la fecha consultada tampoco rige todavía", async () => {
    await activar("onp_tasa", "13", "2027-01-01");
    expect((await consultarReglaVigente(repositorio, finanzas, "onp_tasa", "2026-12-31")).estado).toBe("faltante");
  });

  it("solo Finanzas activa, corrige o consulta reglas: el servidor rechaza a los demás roles", async () => {
    const existente = await activar("rmv", "1000", "2024-01-01");
    for (const [, actor] of otrosRoles) {
      await expect(activarReglaLegal(repositorio, actor, { codigo: "rmv", valor: "1100", vigenteDesde: "2025-01-01", fuenteOficial: FUENTE })).rejects.toThrow("No tiene permiso para consultar ni editar Pagos.");
      await expect(corregirReglaLegal(repositorio, actor, { reglaId: existente.id, valor: "1100", motivo: "Error" })).rejects.toThrow("No tiene permiso");
      await expect(consultarReglaVigente(repositorio, actor, "rmv", "2025-01-01")).rejects.toThrow("No tiene permiso");
      await expect(listarReglasLegales(repositorio, actor, { hoy: "2026-10-07" })).rejects.toThrow("No tiene permiso");
      await expect(consultarHistorialDeRegla(repositorio, actor, "rmv", "2026-10-07")).rejects.toThrow("No tiene permiso");
    }
    expect(contexto.reglas()).toHaveLength(1);
  });

  it("rechaza un código fuera del catálogo, un valor inválido para su unidad, una fuente vacía y una fecha inválida", async () => {
    await expect(activar("centro_de_costo", "10", "2026-01-01")).rejects.toThrow("Elija el valor legal");
    await expect(activar("essalud_tasa", "abc", "2026-01-01")).rejects.toThrow(/porcentaje/);
    await expect(activar("essalud_tasa", "101", "2026-01-01")).rejects.toThrow(/porcentaje/);
    await expect(activar("rmv", "0", "2026-01-01")).rejects.toThrow(/importe/);
    await expect(activar("rmv", "1000", "2026-02-30")).rejects.toThrow("La fecha de inicio de la vigencia no es válida.");
    await expect(activar("rmv", "1000", "2026-01-01", "   ")).rejects.toThrow("Indique la fuente oficial");
    await expect(activar("rmv", "1000", "2026-01-01", "x".repeat(501))).rejects.toThrow("500 caracteres");
    expect(contexto.reglas()).toHaveLength(0);
  });

  it("no acepta una segunda versión con la misma vigencia: para esa fecha se usa «Corregir»", async () => {
    await activar("rmv", "1000", "2025-01-01");

    await expect(activar("rmv", "1100", "2025-01-01")).rejects.toThrow(/ya tiene un valor desde el 01\/01\/2025.*Corregir/);
    expect(contexto.reglas()).toHaveLength(1);
  });

  it("permite cargar la historia en desorden: la vigencia de cada versión se deriva de las demás", async () => {
    await activar("rmv", "1200", "2026-03-01");
    await activar("rmv", "1000", "2024-01-01");
    await activar("rmv", "1100", "2025-01-01");

    const detalle = await consultarHistorialDeRegla(repositorio, finanzas, "rmv", "2026-10-07");
    expect(detalle!.historial.map(({ valor, vigenteDesde, vigenteHasta, estado }) => ({ valor, vigenteDesde, vigenteHasta, estado }))).toEqual([
      { valor: 100000, vigenteDesde: "2024-01-01", vigenteHasta: "2024-12-31", estado: "anterior" },
      { valor: 110000, vigenteDesde: "2025-01-01", vigenteHasta: "2026-02-28", estado: "anterior" },
      { valor: 120000, vigenteDesde: "2026-03-01", vigenteHasta: null, estado: "vigente" },
    ]);
    expect(detalle!.vigente?.valor).toBe(120000);
    expect(await consultarReglaVigente(repositorio, finanzas, "rmv", "2025-06-01")).toMatchObject({ regla: { valor: 110000 } });
  });

  it("el historial de un código inexistente no existe", async () => {
    expect(await consultarHistorialDeRegla(repositorio, finanzas, "centro_de_costo", "2026-10-07")).toBeUndefined();
  });

  describe("corregir", () => {
    it("reemplaza con motivo: la anterior queda «Reemplazada», otra ocupa la misma vigencia y la historia no se pierde", async () => {
      const anterior = await activar("essalud_tasa", "9", "2025-01-01");

      const corregida = await corregirReglaLegal(repositorio, finanzas, { reglaId: anterior.id, valor: "8", motivo: "Error de digitación" });

      expect(corregida).toMatchObject({ valor: 800, vigenteDesde: "2025-01-01", fuenteOficial: FUENTE, reemplazadaEn: null });
      const historial = (await consultarHistorialDeRegla(repositorio, finanzas, "essalud_tasa", "2026-10-07"))!.historial;
      expect(historial.map(({ valor, estado }) => ({ valor, estado }))).toEqual([{ valor: 900, estado: "reemplazado" }, { valor: 800, estado: "vigente" }]);
      expect(historial[0].motivoDeReemplazo).toBe("Error de digitación");
      expect(await consultarReglaVigente(repositorio, finanzas, "essalud_tasa", "2025-02-01")).toMatchObject({ regla: { valor: 800 } });
    });

    it("también puede corregir solo la fuente oficial y, si no se indica otra, conserva la anterior", async () => {
      const anterior = await activar("onp_tasa", "13", "2025-01-01");

      const corregida = await corregirReglaLegal(repositorio, finanzas, { reglaId: anterior.id, valor: "13", fuenteOficial: "Fuente correcta", motivo: "La referencia estaba mal" });
      expect(corregida).toMatchObject({ valor: 1300, fuenteOficial: "Fuente correcta" });

      const otra = await corregirReglaLegal(repositorio, finanzas, { reglaId: corregida.id, valor: "12", motivo: "Segunda corrección" });
      expect(otra.fuenteOficial).toBe("Fuente correcta");
    });

    it("exige motivo, no acepta uno de más de 250 caracteres y rechaza una corrección sin cambios", async () => {
      const anterior = await activar("essalud_tasa", "9", "2025-01-01");

      await expect(corregirReglaLegal(repositorio, finanzas, { reglaId: anterior.id, valor: "8", motivo: "  " })).rejects.toThrow("Escriba el motivo");
      await expect(corregirReglaLegal(repositorio, finanzas, { reglaId: anterior.id, valor: "8", motivo: "x".repeat(251) })).rejects.toThrow("250 caracteres");
      await expect(corregirReglaLegal(repositorio, finanzas, { reglaId: anterior.id, valor: "9", motivo: "Sin cambios" })).rejects.toThrow("no hay nada que corregir");
      await expect(corregirReglaLegal(repositorio, finanzas, { reglaId: anterior.id, valor: "abc", motivo: "Valor inválido" })).rejects.toThrow(/porcentaje/);
      await expect(corregirReglaLegal(repositorio, finanzas, { reglaId: "no-es-uuid", valor: "8", motivo: "Motivo" })).rejects.toThrow("No existe ese valor");
      expect(contexto.reglas()).toHaveLength(1);
      expect(contexto.reglas()[0].reemplazadaEn).toBeNull();
    });

    it("rechaza corregir una versión que ya fue reemplazada", async () => {
      const anterior = await activar("essalud_tasa", "9", "2025-01-01");
      await corregirReglaLegal(repositorio, finanzas, { reglaId: anterior.id, valor: "8", motivo: "Primera" });

      await expect(corregirReglaLegal(repositorio, finanzas, { reglaId: anterior.id, valor: "7", motivo: "Segunda" })).rejects.toThrow("ya fue reemplazado");
    });

    it("si una versión finalizada la usó no se corrige: se corrige con un ajuste de preliquidación, y no se pierde nada", async () => {
      const anterior = await activar("essalud_tasa", "9", "2025-01-01");
      contexto.versionesFinalizadas.set(anterior.id, [{ mes: "2026-09", numero: 2 }]);

      await expect(corregirReglaLegal(repositorio, finanzas, { reglaId: anterior.id, valor: "8", motivo: "Error" })).rejects.toThrow("Lo usa la versión 2 de 09/2026; corríjalo con un ajuste de preliquidación.");
      expect(contexto.reglas()).toHaveLength(1);
      expect(contexto.reglas()[0].reemplazadaEn).toBeNull();
      expect(textoDeUsoEnVersiones([{ mes: "2026-09", numero: 2 }, { mes: "2026-10", numero: 1 }])).toBe("Lo usa la versión 2 de 09/2026 y la versión 1 de 10/2026; corríjalo con un ajuste de preliquidación.");
    });
  });

  describe("listado", () => {
    it("trae una fila por cada valor legal del catálogo, también los que no tienen regla vigente", async () => {
      await activar("essalud_tasa", "9", "2025-01-01");
      await activar("essalud_tasa", "9,5", "2026-12-01");
      await activar("onp_tasa", "13", "2026-11-01");

      const filas = await listarReglasLegales(repositorio, finanzas, { hoy: "2026-10-07" });

      expect(filas).toHaveLength(REGLAS_LEGALES.length);
      expect(filas.find(({ definicion }) => definicion.codigo === "essalud_tasa")).toMatchObject({ vigente: { valor: 900, activadaPorId: "fin-1", fuenteOficial: FUENTE }, proxima: { valor: 950, vigenteDesde: "2026-12-01" } });
      // Solo programada: hoy no rige, así que sigue faltando.
      expect(filas.find(({ definicion }) => definicion.codigo === "onp_tasa")).toMatchObject({ vigente: undefined, proxima: { valor: 1300 } });
      expect(filas.find(({ definicion }) => definicion.codigo === "rmv")).toMatchObject({ vigente: undefined, proxima: undefined });
    });

    it("valida la fecha de hoy", async () => {
      await expect(listarReglasLegales(repositorio, finanzas, { hoy: "ayer" })).rejects.toThrow("La fecha de hoy no es válida.");
    });
  });
});
