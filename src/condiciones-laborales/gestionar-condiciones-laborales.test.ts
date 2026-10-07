import { beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";

import {
  consultarCondicionesVigentes,
  consultarDetalleDeRelacion,
  corregirCondicionLaboral,
  listarCondicionesLaborales,
  listarSedesDeAdscripcion,
  registrarCondicionLaboral,
  textoDeUsoEnVersiones,
} from "./gestionar-condiciones-laborales";
import { ANA_REINGRESO, ANA_RELACION, BETO_RELACION, crearRepositorioEnMemoria } from "./repositorio-en-memoria";

const finanzas: Actor = { id: "fin-1", rol: "finanzas" };
const otrosRoles: Array<[string, Actor]> = [
  ["el Administrador del sistema", { id: "adm-1", rol: "administrador" }],
  ["un gerente de área", { id: "ger-1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ["Recursos Humanos", { id: "rrhh-1", rol: "recursos_humanos" }],
];

describe("condiciones laborales con vigencia", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;
  let repositorio: typeof contexto.repositorio;

  beforeEach(() => {
    contexto = crearRepositorioEnMemoria();
    repositorio = contexto.repositorio;
  });

  const registrar = (relacionId: string, dato: string, valor: string, vigenteDesde: string) => registrarCondicionLaboral(repositorio, finanzas, { relacionId, dato, valor, vigenteDesde });

  it("registra cada dato con su vigencia y consultar una fecha devuelve el valor vigente entonces", async () => {
    await registrar(BETO_RELACION, "sueldo", "1800", "2024-01-08");
    await registrar(BETO_RELACION, "jornada_ordinaria_diaria", "8", "2024-01-08");
    await registrar(BETO_RELACION, "regimen_laboral", "general", "2024-01-08");
    await registrar(BETO_RELACION, "afiliacion_pensionaria", "afp_integra", "2024-01-08");
    await registrar(BETO_RELACION, "comision_afp", "mixta", "2024-01-08");
    await registrar(BETO_RELACION, "elegibilidad_familiar", "no", "2024-01-08");
    await registrar(BETO_RELACION, "sede_de_adscripcion", "Taller", "2024-01-08");
    await registrar(BETO_RELACION, "sueldo", "2000,50", "2026-03-01");

    expect(await consultarCondicionesVigentes(repositorio, finanzas, BETO_RELACION, "2025-12-31")).toEqual({
      sueldo: 180000, jornada_ordinaria_diaria: 480, regimen_laboral: "general", afiliacion_pensionaria: "afp_integra",
      comision_afp: "mixta", elegibilidad_familiar: false, sede_de_adscripcion: "Taller",
    });
    expect((await consultarCondicionesVigentes(repositorio, finanzas, BETO_RELACION, "2026-03-01")).sueldo).toBe(200050);
    expect((await consultarCondicionesVigentes(repositorio, finanzas, BETO_RELACION, "2023-12-31")).sueldo).toBeUndefined();
  });

  it("un cambio de sueldo dentro de un mes se representa con dos vigencias y no reescribe la historia", async () => {
    const primera = await registrar(BETO_RELACION, "sueldo", "1500", "2026-09-01");
    await registrar(BETO_RELACION, "sueldo", "1800", "2026-09-16");

    const detalle = await consultarDetalleDeRelacion(repositorio, finanzas, BETO_RELACION, "2026-09-30");
    const sueldos = detalle!.datos.find(({ dato }) => dato === "sueldo")!;
    expect(sueldos.historial.map(({ valor, vigenteDesde, vigenteHasta, estado }) => ({ valor, vigenteDesde, vigenteHasta, estado }))).toEqual([
      { valor: 150000, vigenteDesde: "2026-09-01", vigenteHasta: "2026-09-15", estado: "anterior" },
      { valor: 180000, vigenteDesde: "2026-09-16", vigenteHasta: null, estado: "vigente" },
    ]);
    expect((await consultarCondicionesVigentes(repositorio, finanzas, BETO_RELACION, "2026-09-15")).sueldo).toBe(150000);
    expect((await consultarCondicionesVigentes(repositorio, finanzas, BETO_RELACION, "2026-09-16")).sueldo).toBe(180000);
    expect(contexto.condiciones().find(({ id }) => id === primera.id)).toMatchObject({ valor: 150000, vigenteDesde: "2026-09-01", reemplazadaEn: null });
  });

  it("un valor nuevo empieza después de la última vigencia; la misma fecha o una anterior se rechazan y mandan a corregir", async () => {
    await registrar(BETO_RELACION, "sueldo", "1500", "2026-09-01");
    await registrar(BETO_RELACION, "sueldo", "1800", "2026-09-16");
    await expect(registrar(BETO_RELACION, "sueldo", "1600", "2026-09-16")).rejects.toThrow("use «Corregir»");
    await expect(registrar(BETO_RELACION, "sueldo", "1600", "2026-09-10")).rejects.toThrow("ya tiene un valor desde el 16/09/2026");
    // Otro dato conserva su propia historia: la misma fecha no choca.
    await registrar(BETO_RELACION, "jornada_ordinaria_diaria", "8", "2026-09-10");
    expect(contexto.condiciones()).toHaveLength(3);
  });

  it("un identificador que no es UUID es una relación o un valor inexistente, no un error de base de datos", async () => {
    await expect(registrar("abc", "sueldo", "1500", "2026-09-01")).rejects.toThrow("relación laboral confirmada");
    await expect(corregirCondicionLaboral(repositorio, finanzas, { condicionId: "abc", valor: "1500", motivo: "Prueba" })).rejects.toThrow("No existe ese valor.");
    await expect(consultarDetalleDeRelacion(repositorio, finanzas, "abc", "2026-10-07")).resolves.toBeUndefined();
  });

  it("la vigencia debe caer dentro de la relación laboral", async () => {
    await expect(registrar(BETO_RELACION, "sueldo", "1500", "2024-01-07")).rejects.toThrow("antes del ingreso (08/01/2024)");
    await expect(registrar(ANA_RELACION, "sueldo", "1500", "2026-02-01")).rejects.toThrow("después del cese (31/01/2026)");
    await expect(registrar(BETO_RELACION, "sueldo", "1500", "2026-02-30")).rejects.toThrow("no es válida");
  });

  it("un reingreso es otra relación laboral con su propio historial", async () => {
    await registrar(ANA_RELACION, "sueldo", "1400", "2025-03-02");
    await registrar(ANA_REINGRESO, "sueldo", "1700", "2026-06-01");

    expect((await consultarCondicionesVigentes(repositorio, finanzas, ANA_RELACION, "2026-07-01")).sueldo).toBe(140000);
    expect((await consultarCondicionesVigentes(repositorio, finanzas, ANA_REINGRESO, "2026-07-01")).sueldo).toBe(170000);
  });

  it("la sede de adscripción es una sede existente y activa de Configuración", async () => {
    await registrar(BETO_RELACION, "sede_de_adscripcion", "Tienda Benavides", "2024-01-08");
    await expect(registrar(BETO_RELACION, "sede_de_adscripcion", "Centro de costo 7", "2025-01-01")).rejects.toThrow("No existe la sede");
    await expect(registrar(BETO_RELACION, "sede_de_adscripcion", "Depósito (inactivo)", "2025-01-01")).rejects.toThrow("inactiva");
    await expect(listarSedesDeAdscripcion(repositorio, finanzas)).resolves.toEqual(["Tienda Benavides", "Taller"]);
  });

  it("rechaza datos y valores inválidos sin guardar nada", async () => {
    await expect(registrar(BETO_RELACION, "bono", "100", "2026-01-01")).rejects.toThrow("dato laboral");
    await expect(registrar(BETO_RELACION, "sueldo", "0", "2026-01-01")).rejects.toThrow("sueldo");
    await expect(registrar("inexistente", "sueldo", "1500", "2026-01-01")).rejects.toThrow("relación laboral confirmada");
    expect(contexto.condiciones()).toEqual([]);
  });

  describe("corregir un valor", () => {
    it("exige motivo, deja el anterior «Reemplazado» y ocupa la misma vigencia", async () => {
      const errada = await registrar(BETO_RELACION, "sueldo", "15000", "2026-09-01");

      await expect(corregirCondicionLaboral(repositorio, finanzas, { condicionId: errada.id, valor: "1500", motivo: "  " })).rejects.toThrow("motivo");
      await corregirCondicionLaboral(repositorio, finanzas, { condicionId: errada.id, valor: "1500", motivo: "Error de digitación" });

      const historial = (await consultarDetalleDeRelacion(repositorio, finanzas, BETO_RELACION, "2026-09-30"))!.datos[0].historial;
      expect(historial.map(({ valor, estado, motivoDeReemplazo }) => ({ valor, estado, motivoDeReemplazo }))).toEqual([
        { valor: 1500000, estado: "reemplazado", motivoDeReemplazo: "Error de digitación" },
        { valor: 150000, estado: "vigente", motivoDeReemplazo: null },
      ]);
      expect((await consultarCondicionesVigentes(repositorio, finanzas, BETO_RELACION, "2026-09-02")).sueldo).toBe(150000);
    });

    it("no corrige dos veces el mismo valor ni uno idéntico", async () => {
      const original = await registrar(BETO_RELACION, "sueldo", "1500", "2026-09-01");
      await expect(corregirCondicionLaboral(repositorio, finanzas, { condicionId: original.id, valor: "1500", motivo: "Sin cambio" })).rejects.toThrow("igual al registrado");
      await corregirCondicionLaboral(repositorio, finanzas, { condicionId: original.id, valor: "1600", motivo: "Dato correcto" });
      await expect(corregirCondicionLaboral(repositorio, finanzas, { condicionId: original.id, valor: "1700", motivo: "Otra vez" })).rejects.toThrow("ya fue reemplazado");
    });

    it("si una versión finalizada lo usó, se corrige con un ajuste de preliquidación y no cambia nada", async () => {
      const usada = await registrar(BETO_RELACION, "sueldo", "1500", "2026-08-01");
      contexto.versionesFinalizadas.set(usada.id, [{ mes: "2026-09", numero: 2 }]);

      await expect(corregirCondicionLaboral(repositorio, finanzas, { condicionId: usada.id, valor: "1600", motivo: "Corrección" }))
        .rejects.toThrow("Lo usa la versión 2 de 09/2026; corríjalo con un ajuste de preliquidación.");
      const detalle = await consultarDetalleDeRelacion(repositorio, finanzas, BETO_RELACION, "2026-09-30");
      expect(detalle!.usadasPorVersiones[usada.id]).toEqual([{ mes: "2026-09", numero: 2 }]);
      expect(contexto.condiciones()).toHaveLength(1);
      expect(contexto.condiciones()[0]).toMatchObject({ valor: 150000, reemplazadaEn: null });
    });

    it("al corregir revalida la vigencia contra la relación: un cese confirmado después la deja fuera", async () => {
      const valor = await registrar(BETO_RELACION, "sueldo", "1500", "2026-09-01");
      contexto.relaciones.find(({ id }) => id === BETO_RELACION)!.cese = "2026-08-31";

      await expect(corregirCondicionLaboral(repositorio, finanzas, { condicionId: valor.id, valor: "1600", motivo: "Corrección" })).rejects.toThrow("después del cese (31/08/2026)");
      expect(contexto.condiciones()).toHaveLength(1);
      expect(contexto.condiciones()[0].reemplazadaEn).toBeNull();
    });

    it("valida la sede nueva al corregir y deshace todo si algo falla", async () => {
      const sede = await registrar(BETO_RELACION, "sede_de_adscripcion", "Taller", "2024-01-08");
      await expect(corregirCondicionLaboral(repositorio, finanzas, { condicionId: sede.id, valor: "Inventada", motivo: "Cambio" })).rejects.toThrow("No existe la sede");
      expect(contexto.condiciones()).toHaveLength(1);
      expect(contexto.condiciones()[0].reemplazadaEn).toBeNull();
    });
  });

  describe("listado", () => {
    beforeEach(async () => {
      for (const [dato, valor] of [["sueldo", "1800"], ["jornada_ordinaria_diaria", "8"], ["regimen_laboral", "general"], ["afiliacion_pensionaria", "onp"], ["elegibilidad_familiar", "no"], ["sede_de_adscripcion", "Taller"]] as const) {
        await registrar(BETO_RELACION, dato, valor, "2024-01-08");
      }
      await registrar(ANA_REINGRESO, "sueldo", "1700", "2026-06-01");
    });

    it("lista una fila por relación laboral confirmada con sus valores vigentes hoy y lo que falta", async () => {
      const { filas, total, grupos, sedes } = await listarCondicionesLaborales(repositorio, finanzas, { hoy: "2026-10-07" });

      expect(total).toBe(3);
      expect(grupos).toEqual(["Taller", "Tiendas"]);
      // Solo sedes activas, más las que alguien tiene hoy aunque se hayan desactivado.
      expect(sedes).toEqual(["Taller", "Tienda Benavides"]);
      expect(filas.map(({ id }) => id)).toEqual([ANA_REINGRESO, ANA_RELACION, BETO_RELACION]);
      expect(filas[0].faltantes).toEqual(["jornada_ordinaria_diaria", "regimen_laboral", "afiliacion_pensionaria", "elegibilidad_familiar", "sede_de_adscripcion"]);
      expect(filas[2].faltantes).toEqual([]);
      expect(filas[2].vigentes.sueldo).toBe(180000);
      expect(filas[1].vigentes.sueldo).toBeUndefined();
    });

    it("sigue ofreciendo para filtrar una sede desactivada que una persona conserva", async () => {
      contexto.sedes.find(({ nombre }) => nombre === "Taller")!.activa = false;

      expect((await listarCondicionesLaborales(repositorio, finanzas, { hoy: "2026-10-07" })).sedes).toEqual(["Taller", "Tienda Benavides"]);
    });

    it("filtra por grupo, sede de adscripción, persona y datos faltantes", async () => {
      const ids = async (filtros: Parameters<typeof listarCondicionesLaborales>[2]["filtros"]) => (await listarCondicionesLaborales(repositorio, finanzas, { hoy: "2026-10-07", filtros })).filas.map(({ id }) => id);

      expect(await ids({ grupo: "Taller" })).toEqual([BETO_RELACION]);
      expect(await ids({ sede: "Taller" })).toEqual([BETO_RELACION]);
      expect(await ids({ persona: "ana" })).toEqual([ANA_REINGRESO, ANA_RELACION]);
      expect(await ids({ persona: "99900002" })).toEqual([BETO_RELACION]);
      expect(await ids({ soloFaltantes: true })).toEqual([ANA_REINGRESO, ANA_RELACION]);
    });
  });

  it("el texto de una versión finalizada nombra mes y versión", () => {
    expect(textoDeUsoEnVersiones([{ mes: "2026-09", numero: 2 }, { mes: "2026-10", numero: 1 }])).toBe("Lo usa la versión 2 de 09/2026 y la versión 1 de 10/2026; corríjalo con un ajuste de preliquidación.");
  });

  describe("solo Finanzas ve y edita", () => {
    it.each(otrosRoles)("%s recibe un rechazo del servidor en cada operación y no cambia nada", async (_nombre, actor) => {
      const existente = await registrar(BETO_RELACION, "sueldo", "1500", "2026-09-01");
      const rechazo = "No tiene permiso para consultar ni editar Pagos.";

      await expect(registrarCondicionLaboral(repositorio, actor, { relacionId: BETO_RELACION, dato: "sueldo", valor: "9999", vigenteDesde: "2026-10-01" })).rejects.toThrow(rechazo);
      await expect(corregirCondicionLaboral(repositorio, actor, { condicionId: existente.id, valor: "9999", motivo: "Intento" })).rejects.toThrow(rechazo);
      await expect(listarCondicionesLaborales(repositorio, actor, { hoy: "2026-10-07" })).rejects.toThrow(rechazo);
      await expect(consultarDetalleDeRelacion(repositorio, actor, BETO_RELACION, "2026-10-07")).rejects.toThrow(rechazo);
      await expect(consultarCondicionesVigentes(repositorio, actor, BETO_RELACION, "2026-10-07")).rejects.toThrow(rechazo);
      await expect(listarSedesDeAdscripcion(repositorio, actor)).rejects.toThrow(rechazo);
      expect(contexto.condiciones()).toHaveLength(1);
      expect(contexto.condiciones()[0]).toMatchObject({ valor: 150000, reemplazadaEn: null });
    });
  });

  it("una relación inexistente no tiene detalle", async () => {
    await expect(consultarDetalleDeRelacion(repositorio, finanzas, "no-existe", "2026-10-07")).resolves.toBeUndefined();
  });
});
