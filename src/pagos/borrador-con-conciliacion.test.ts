import { describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { registrarConciliacionDeCese } from "@/fuentes-externas/conciliacion-de-cese";
import { anularImporte, confirmarFuente, registrarImporte } from "@/fuentes-externas/gestionar-fuentes-externas";
import { crearRepositorioEnMemoria } from "@/fuentes-externas/repositorio-en-memoria";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";

import { prepararBorrador, type FuentesDelBorrador } from "./preparar-borrador";

// El borrador mensual con la conciliación de la liquidación por cese (#128), de punta a punta sobre el repositorio en memoria.
// Esperados de ejemplos-sinteticos.md (C-E1, C-E2, C-E8) y de la aritmética del sueldo (12 días de 30 con 200000 = 80000), en céntimos.
// Personas y datos sintéticos.
const TIPO = "conciliacion_de_liquidacion_por_cese";
const MES = "2026-10";
const ANA = "11111111";
const CARLA = "22222222";
const finanzas: Actor = { id: "11111111-1111-4111-8111-111111111111", rol: "finanzas", nombreUsuario: "finanzas" };
const BLOQUEO_DE_CESE = "El cese de Ana no tiene su liquidación conciliada.";

const persona = (id: string, dni: string, nombre: string, cese: string | null) =>
  ({ id, dni, nombre, grupo: "Taller", ingreso: "2026-01-01", cese, ingresoConfirmado: true, ceseConfirmado: cese !== null });
const condiciones = (relacionId: string) => ([
  ["sueldo", 200000], ["jornada_ordinaria_diaria", 480], ["regimen_laboral", "general"], ["afiliacion_pensionaria", "onp"], ["elegibilidad_familiar", false], ["sede_de_adscripcion", "Taller"],
] as const).map(([dato, valor]) => ({ id: `${relacionId}-${dato}`, relacionId, dato, valor, vigenteDesde: "2026-01-01", registradaPorId: "f-1", registradaPor: "finanzas", registradaEn: new Date("2026-01-01T00:00:00Z"), reemplazadaEn: null, motivoDeReemplazo: null }));
const reglas = ([["onp_tasa", 1300], ["essalud_tasa", 900], ["essalud_base_minima", 100000]] as const).map(([codigo, valor]) => ({
  id: codigo, codigo, valor, vigenteDesde: "2026-01-01", fuenteOficial: "DEMO", activadaPorId: "f-1", activadaPor: "finanzas", activadaEn: new Date("2026-01-01T00:00:00Z"), reemplazadaEn: null, motivoDeReemplazo: null,
}));

function escenario(conCese = true) {
  const { repositorio } = crearRepositorioEnMemoria({ [ANA]: "Ana", [CARLA]: "Carla" });
  const relaciones = [persona("r1", ANA, "Ana", conCese ? "2026-10-12" : null), persona("r2", CARLA, "Carla", null)];
  const fuentes: FuentesDelBorrador = {
    relaciones: { listarConPersona: async () => relaciones },
    condiciones: { listarTodas: async () => [...condiciones("r1"), ...condiciones("r2")] },
    reglas: { listarTodas: async () => reglas },
    asistencia: {
      listar: async () => [{ id: "p1", inicio: "2026-09-26", fin: "2026-10-25", estado: "cerrado" }],
      leerHechosDelPeriodo: async () => ({ periodoId: "p1", revisionId: "v1", numero: 1, inicio: "2026-09-26", fin: "2026-10-25", provisional: false, hechos: [] }),
    },
    externas: repositorio,
    descansos: { listarSustitutoriosParaPagos: async () => [] },
  };
  const confirmarTodasMenos = async (...excepto: string[]) => {
    for (const tipo of TIPOS_DE_FUENTE) if (!excepto.includes(tipo.codigo)) await confirmarFuente(repositorio, finanzas, { tipoDeFuente: tipo.codigo, mes: MES });
  };
  const borrador = () => prepararBorrador(fuentes, MES);
  const filaDeVacaciones = { dni: ANA, concepto: "vacaciones_truncas", fechaDelHecho: "2026-10-12", mesDeDevengue: MES, mesDeAplicacion: MES, monto: "400,00" };
  return { repositorio, confirmarTodasMenos, borrador, filaDeVacaciones };
}

type Borrador = Awaited<ReturnType<typeof prepararBorrador>>;
const de = (borrador: Borrador, nombre: string) => {
  const encontrada = borrador.personas.find((candidata) => candidata.relacion.nombre === nombre);
  if (!encontrada) throw new Error(`Falta ${nombre} en el borrador.`);
  return encontrada;
};
const estadoDeLaConciliacion = (borrador: Borrador) => borrador.fuentes.find((fuente) => fuente.codigo === TIPO)?.estado;

describe("borrador mensual con la conciliación de la liquidación por cese", () => {
  it("UC-09 un cese confirmado sin conciliar bloquea el mes y a la persona sin dejar sin neto al resto", async () => {
    const { confirmarTodasMenos, borrador } = escenario();
    await confirmarTodasMenos(TIPO);
    const resultado = await borrador();
    expect(resultado.bloqueosDelMes).toContain(BLOQUEO_DE_CESE);
    expect(de(resultado, "Ana").bloqueos).toContain(BLOQUEO_DE_CESE);
    expect(de(resultado, "Carla").netoCentimos).toBe(200000);
    expect(estadoDeLaConciliacion(resultado)).toBe("Pendiente");
    expect(resultado.bloqueosDelMes.some((bloqueo) => bloqueo.includes("Fuente externa pendiente: Conciliación"))).toBe(false);
  });

  it("UC-10 cargar los conceptos de la liquidación y confirmar el tipo resuelve el bloqueo sin tocar el neto", async () => {
    const { repositorio, confirmarTodasMenos, borrador, filaDeVacaciones } = escenario();
    await registrarConciliacionDeCese(repositorio, finanzas, filaDeVacaciones);
    await registrarConciliacionDeCese(repositorio, finanzas, { ...filaDeVacaciones, concepto: "cts_trunca", monto: "900,00" });
    await confirmarTodasMenos();
    const resultado = await borrador();
    expect(resultado.bloqueosDelMes.filter((bloqueo) => bloqueo.includes("no tiene su liquidación conciliada"))).toEqual([]);
    expect(de(resultado, "Ana").netoCentimos).toBe(80000);
    expect(de(resultado, "Ana").conciliacion.conceptosCentimos).toBe(130000);
    expect(estadoDeLaConciliacion(resultado)).toBe("Confirmada");
  });

  it("UC-11 cambiar las filas de un tipo confirmado lo devuelve a pendiente y reabre el bloqueo", async () => {
    const { repositorio, confirmarTodasMenos, borrador, filaDeVacaciones } = escenario();
    await registrarConciliacionDeCese(repositorio, finanzas, filaDeVacaciones);
    const cts = await registrarConciliacionDeCese(repositorio, finanzas, { ...filaDeVacaciones, concepto: "cts_trunca", monto: "900,00" });
    await confirmarTodasMenos();
    expect(de(await borrador(), "Ana").bloqueos).toEqual([]);
    const cambio = await anularImporte(repositorio, finanzas, { importeId: cts.id, motivo: "Importe mal digitado" });
    expect(cambio.volvioAPendiente).toBe(true);
    const resultado = await borrador();
    expect(estadoDeLaConciliacion(resultado)).toBe("Pendiente");
    expect(resultado.fuentes.find((fuente) => fuente.codigo === TIPO)?.filas).toBe(1);
    expect(resultado.bloqueosDelMes).toContain(BLOQUEO_DE_CESE);
    expect(de(resultado, "Ana").netoCentimos).toBeNull();
  });

  it("UC-12 una gratificación trunca del mismo devengue que una gratificación legal ya cargada bloquea a la persona; sin la previa no", async () => {
    const { repositorio, confirmarTodasMenos, borrador } = escenario(false);
    const trunca = { dni: ANA, concepto: "gratificacion_trunca", fechaDelHecho: "2026-07-15", mesDeDevengue: "2026-07", mesDeAplicacion: MES, monto: "300,00" };
    await registrarConciliacionDeCese(repositorio, finanzas, trunca);
    await confirmarTodasMenos();
    const sinPrevia = await borrador();
    expect(de(sinPrevia, "Ana").bloqueos.filter((bloqueo) => /duplicación/i.test(bloqueo))).toEqual([]);

    await registrarImporte(repositorio, finanzas, { tipoDeFuente: "gratificacion_y_bonificacion", concepto: "gratificacion_legal", dni: ANA, fechaDelHecho: "2026-07-15", mesDeDevengue: "2026-07", mesDeAplicacion: MES, monto: "500,00" });
    await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "gratificacion_y_bonificacion", mes: MES });
    const conPrevia = await borrador();
    const ana = de(conPrevia, "Ana");
    expect(ana.bloqueos.some((bloqueo) => /duplicación/i.test(bloqueo))).toBe(true);
    expect(ana.lineas.some((linea) => ["gratificacion_legal", "gratificacion_trunca"].includes(linea.concepto as string))).toBe(false);
    expect(de(conPrevia, "Carla").netoCentimos).toBe(200000);
  });
});
