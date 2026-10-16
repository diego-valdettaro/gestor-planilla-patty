import { beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import type { CondicionLaboral } from "@/condiciones-laborales/vigencia";
import { decidirIncidencia, registrarAjuste, registrarIncidencia } from "@/fuentes-externas/incidencias-y-ajustes";
import { confirmarFuente, registrarImporte } from "@/fuentes-externas/gestionar-fuentes-externas";
import { crearRepositorioEnMemoria } from "@/fuentes-externas/repositorio-en-memoria";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";

import { prepararBorrador, type FuentesDelBorrador } from "./preparar-borrador";

// Caso de uso del borrador (#127). Esperados de ejemplos-sinteticos.md (E1, E3, E4, E5, E6, E7), en céntimos.
// Se simulan solo los lectores de relaciones, condiciones, reglas, asistencia y descansos; las fuentes externas usan el
// repositorio en memoria y los casos de uso reales de registrar y confirmar.
const MES = "2026-10";
const DNI = "12345678";
const finanzas: Actor = { id: "11111111-1111-4111-8111-111111111111", rol: "finanzas", nombreUsuario: "finanzas" };

const condicion = (dato: CondicionLaboral["dato"], valor: CondicionLaboral["valor"]): CondicionLaboral => ({
  id: `c-${dato}`, relacionId: "r1", dato, valor, vigenteDesde: "2026-01-01", registradaPorId: finanzas.id, registradaPor: "finanzas",
  registradaEn: new Date("2026-01-01T00:00:00Z"), reemplazadaEn: null, motivoDeReemplazo: null,
});

function fuentesCon(repositorio: FuentesDelBorrador["externas"]): FuentesDelBorrador {
  return {
    relaciones: { listarConPersona: async () => [{ id: "r1", dni: DNI, nombre: "Ana", grupo: "Taller", ingreso: "2026-01-01", cese: null, ingresoConfirmado: true, ceseConfirmado: false }] },
    condiciones: { listarTodas: async () => [condicion("sueldo", 200000), condicion("jornada_ordinaria_diaria", 480), condicion("regimen_laboral", "general"),
      condicion("afiliacion_pensionaria", "onp"), condicion("elegibilidad_familiar", false), condicion("sede_de_adscripcion", "Taller")] },
    // Reglas DEMO sintéticas requeridas por #126; no son tasas legales actuales.
    reglas: { listarTodas: async () => ([
      ["onp_tasa", 1300], ["essalud_tasa", 900], ["essalud_base_minima", 100000],
    ] as const).map(([codigo, valor]) => ({ id: `demo-${codigo}`, codigo, valor, vigenteDesde: "2026-01-01",
      fuenteOficial: "DEMO sintética; no usar en producción", activadaPorId: finanzas.id, activadaPor: "finanzas",
      activadaEn: new Date("2026-01-01T00:00:00Z"), reemplazadaEn: null, motivoDeReemplazo: null })) },
    asistencia: {
      listar: async () => [{ id: "p1", inicio: "2026-09-26", fin: "2026-10-25", estado: "cerrado" as const }],
      leerHechosDelPeriodo: async () => ({ periodoId: "p1", revisionId: "rev-1", numero: 1, inicio: "2026-09-26", fin: "2026-10-25", provisional: false, hechos: [] }),
    },
    externas: repositorio,
    descansos: { listarSustitutoriosParaPagos: async () => [] },
  };
}

describe("neto del borrador con fuentes externas", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;
  let fuentes: FuentesDelBorrador;

  beforeEach(() => {
    contexto = crearRepositorioEnMemoria({ [DNI]: "Ana" });
    fuentes = fuentesCon(contexto.repositorio);
  });

  const registrar = (tipoDeFuente: string, concepto: string, monto: string, fechaDelHecho = "2026-10-05") =>
    registrarImporte(contexto.repositorio, finanzas, { tipoDeFuente, dni: DNI, concepto, fechaDelHecho, mesDeDevengue: MES, mesDeAplicacion: MES, monto });
  const registrarE1 = async () => {
    await registrar("comisiones_de_ventas", "comision_de_ventas", "150");
    await registrar("movilidad_supeditada_a_asistencia", "movilidad_supeditada_a_asistencia", "120");
    await registrar("adelantos", "adelanto", "300");
    await registrar("prestamos", "cuota_de_prestamo", "200");
  };
  const confirmar = (...tipos: string[]) => Promise.all(tipos.map((tipoDeFuente) => confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente, mes: MES })));
  const confirmarTodas = () => confirmar(...TIPOS_DE_FUENTE.map(({ codigo }) => codigo));
  const ana = async () => (await prepararBorrador(fuentes, MES)).personas[0];

  it("U01 las cinco fuentes de E1 confirmadas dan el neto de E1", async () => {
    await registrarE1();
    await confirmarTodas();
    const persona = await ana();
    expect(persona.netoCentimos).toBe(177000);
    expect(persona.lineas.filter((linea) => linea.origen === "Fuente externa").map(({ concepto, importeCentimos }) => ({ concepto, importeCentimos }))
      .sort((a, b) => a.concepto.localeCompare(b.concepto))).toEqual([
      { concepto: "adelanto", importeCentimos: 30000 }, { concepto: "comision_de_ventas", importeCentimos: 15000 },
      { concepto: "cuota_de_prestamo", importeCentimos: 20000 }, { concepto: "movilidad_supeditada_a_asistencia", importeCentimos: 12000 },
    ]);
  });

  it("U02 un tipo sin confirmar deja el neto sin calcular y al confirmarlo se calcula", async () => {
    await registrarE1();
    await confirmar(...TIPOS_DE_FUENTE.map(({ codigo }) => codigo).filter((codigo) => codigo !== "prestamos"));
    const antes = await prepararBorrador(fuentes, MES);
    expect(antes.personas[0].netoCentimos).toBeNull();
    expect(antes.bloqueosDelMes).toContain("Fuente externa pendiente: Préstamos (cuotas).");
    expect(antes.fuentes.find(({ codigo }) => codigo === "prestamos")?.estado).toBe("Pendiente");
    await confirmar("prestamos");
    expect((await ana()).netoCentimos).toBe(177000);
  });

  it("U03 adelantos confirmado sin filas es cero confirmado", async () => {
    await registrar("comisiones_de_ventas", "comision_de_ventas", "150");
    await registrar("movilidad_supeditada_a_asistencia", "movilidad_supeditada_a_asistencia", "120");
    await registrar("prestamos", "cuota_de_prestamo", "200");
    await confirmarTodas();
    const borrador = await prepararBorrador(fuentes, MES);
    expect(borrador.personas[0].netoCentimos).toBe(207000);
    expect(borrador.bloqueosDelMes.some((bloqueo) => bloqueo.includes("Fuente externa pendiente"))).toBe(false);
  });

  it("U04 un adelanto repetido con la misma clave se rechaza y se resta una sola vez", async () => {
    await registrarE1();
    await expect(registrar("adelantos", "adelanto", "300")).rejects.toThrow(/Ya existe ese importe/);
    await confirmarTodas();
    expect((await ana()).netoCentimos).toBe(177000);
  });

  it("U05 la incidencia sin autorizar no entra al neto; autorizada y reconfirmada resta 80,00", async () => {
    await registrarE1();
    const incidencia = await registrarIncidencia(contexto.repositorio, finanzas, { dni: DNI, fechaDelHecho: "2026-10-06", mesDeDevengue: MES, mesDeAplicacion: MES, monto: "80" });
    await decidirIncidencia(contexto.repositorio, finanzas, { id: incidencia.id, decision: "no_descontar" });
    await confirmarTodas();
    expect((await ana()).netoCentimos).toBe(177000);
    await decidirIncidencia(contexto.repositorio, finanzas, { id: incidencia.id, decision: "autorizar", sustento: "Acta de merma", autorizadoPor: "Gerente de tienda", fechaDeAutorizacion: "2026-10-08" });
    expect((await ana()).netoCentimos).toBeNull();
    await confirmar("incidencias_de_tienda");
    const persona = await ana();
    expect(persona.netoCentimos).toBe(169000);
    expect(persona.lineas).toContainEqual(expect.objectContaining({ concepto: "descuento_autorizado_por_incidencia", importeCentimos: 8000, efectoEnNeto: "resta" }));
  });

  it("U06 un ajuste que resta 50,00 a la comisión reduce el neto", async () => {
    await registrarE1();
    await registrarAjuste(contexto.repositorio, finanzas, { dni: DNI, fechaDelHecho: "2026-10-07", mesDeDevengue: MES, mesDeAplicacion: MES, monto: "50",
      conceptoAjustado: "comision_de_ventas", sentidoAjuste: "resta", motivo: "Comisión mal calculada" });
    await confirmarTodas();
    const persona = await ana();
    expect(persona.netoCentimos).toBe(172000);
    expect(persona.lineas).toContainEqual(expect.objectContaining({ concepto: "ajuste_de_preliquidacion", importeCentimos: 5000, efectoEnNeto: "resta" }));
  });
  // RC1: E1 conserva su subtotal antes de aportes aunque se registren correcciones pensionarias.
  it.each(["aporte_onp", "aporte_obligatorio_afp", "prima_de_seguro_afp", "comision_afp"].flatMap(
    concepto => (["suma", "resta"] as const).map(sentido => [concepto, sentido] as const),
  ))("RC1 ajuste %s %s no altera E1", async (conceptoAjustado, sentidoAjuste) => {
    await registrarE1();
    await registrarAjuste(contexto.repositorio, finanzas, { dni: DNI, fechaDelHecho: "2026-10-07", mesDeDevengue: MES,
      mesDeAplicacion: MES, monto: "10", conceptoAjustado, sentidoAjuste, motivo: "Corrección pensionaria sintética" });
    await confirmarTodas();
    const persona = await ana();
    expect(persona.bloqueos).toEqual([]);
    expect(persona.lineas.some(linea => linea.concepto === "aporte_onp")).toBe(true);
    // 200000 + 15000 + 12000 - 30000 - 20000. Aportes y sus ajustes no forman este subtotal.
    expect(persona.netoCentimos).toBe(177000);
  });

  it.each(["concepto_inexistente", "ajuste_de_preliquidacion"])("RC2 registrarAjuste sigue rechazando %s", async (conceptoAjustado) => {
    await expect(registrarAjuste(contexto.repositorio, finanzas, { dni: DNI, fechaDelHecho: "2026-10-07", mesDeDevengue: MES,
      mesDeAplicacion: MES, monto: "10", conceptoAjustado, sentidoAjuste: "resta", motivo: "Dato inválido" })).rejects.toThrow(/concepto del catálogo/);
    expect(await contexto.repositorio.listarImportesDelMes(MES)).toEqual([]);
  });

});
