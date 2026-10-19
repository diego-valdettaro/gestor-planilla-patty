import { beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import type { CondicionLaboral } from "@/condiciones-laborales/vigencia";
import { confirmarFuente, registrarImporte, volverAPendiente } from "@/fuentes-externas/gestionar-fuentes-externas";
import { crearRepositorioEnMemoria } from "@/fuentes-externas/repositorio-en-memoria";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";
import type { HechoDiarioDeAsistencia } from "@/periodos/hechos-para-pagos";
import type { ReglaLegal } from "@/reglas-legales/vigencia";

import { consultarVersion, evaluarFinalizacion, finalizarMes, listarVersiones, type DependenciasDeFinalizacion } from "./finalizar-mes";
import { prepararBorrador, type FuentesDelBorrador } from "./preparar-borrador";
import { crearRepositorioDeVersionesEnMemoria } from "./versiones-en-memoria";

// Finalización del mes completo (#129, ADR 0007 y 0014). Personas sintéticas del plan de pruebas (mes 2026-10, corte 26/09 al 25/10):
// Ana S/ 2.000,00, Beto S/ 1.500,00 y Carla S/ 1.000,00, régimen general, ONP, sin asignación familiar, sede Taller, jornada 480 min,
// reglas DEMO (ONP 13,00 %, EsSalud 9,00 %, base mínima S/ 1.000,00) y un período cerrado con la revisión nº 1.
// Esperados del subtotal «Neto antes de aportes del trabajador» en céntimos: aritmética manual de #96, historia 5 (mes completo = sueldo;
// las líneas de aporte se conservan pero no restan del subtotal, decisión B1=A). Se simulan solo los lectores y el reloj.
const MES = "2026-10";
const AHORA = new Date("2026-10-26T15:00:00Z");
const finanzas: Actor = { id: "11111111-1111-4111-8111-111111111111", rol: "finanzas", nombreUsuario: "finanzas" };

const PERSONAS = [
  { id: "r-ana", dni: "10000001", nombre: "Ana", sueldo: 200000 },
  { id: "r-beto", dni: "10000002", nombre: "Beto", sueldo: 150000 },
  { id: "r-carla", dni: "10000003", nombre: "Carla", sueldo: 100000 },
];

type Periodo = { id: string; inicio: string; fin: string; estado: "abierto" | "cerrado" };

function crearEscenario(opciones: { alEscribirFila?: (indice: number) => void } = {}) {
  const condiciones: CondicionLaboral[] = [];
  const agregarCondicion = (relacionId: string, dato: CondicionLaboral["dato"], valor: CondicionLaboral["valor"], vigenteDesde = "2026-01-01") => {
    condiciones.push({ id: `c-${relacionId}-${dato}-${condiciones.length}`, relacionId, dato, valor, vigenteDesde, registradaPorId: finanzas.id,
      registradaPor: "finanzas", registradaEn: new Date("2026-01-01T00:00:00Z"), reemplazadaEn: null, motivoDeReemplazo: null });
  };
  for (const { id, sueldo } of PERSONAS) {
    agregarCondicion(id, "sueldo", sueldo); agregarCondicion(id, "jornada_ordinaria_diaria", 480); agregarCondicion(id, "regimen_laboral", "general");
    agregarCondicion(id, "afiliacion_pensionaria", "onp"); agregarCondicion(id, "elegibilidad_familiar", false); agregarCondicion(id, "sede_de_adscripcion", "Taller");
  }
  const reglas: ReglaLegal[] = ([["onp_tasa", 1300], ["essalud_tasa", 900], ["essalud_base_minima", 100000]] as const).map(([codigo, valor]) => ({
    id: `demo-${codigo}`, codigo, valor, vigenteDesde: "2026-01-01", fuenteOficial: "DEMO sintética; no usar en producción", activadaPorId: finanzas.id,
    activadaPor: "finanzas", activadaEn: new Date("2026-01-01T00:00:00Z"), reemplazadaEn: null, motivoDeReemplazo: null }));
  const relaciones = PERSONAS.map(({ id, dni, nombre }) => ({ id, dni, nombre, grupo: "Taller", ingreso: "2026-01-01", cese: null as string | null, ingresoConfirmado: true, ceseConfirmado: false }));
  let periodos: Periodo[] = [{ id: "p1", inicio: "2026-09-26", fin: "2026-10-25", estado: "cerrado" }];
  const hechos: HechoDiarioDeAsistencia[] = [];
  const contexto = crearRepositorioEnMemoria(Object.fromEntries(PERSONAS.map(({ dni, nombre }) => [dni, nombre])));
  const almacenDeVersiones = crearRepositorioDeVersionesEnMemoria(opciones);
  const fuentes: FuentesDelBorrador = {
    relaciones: { listarConPersona: async () => relaciones },
    condiciones: { listarTodas: async () => condiciones },
    reglas: { listarTodas: async () => reglas },
    asistencia: {
      listar: async () => periodos,
      leerHechosDelPeriodo: async (periodoId) => {
        const periodo = periodos.find(({ id }) => id === periodoId)!;
        return { periodoId, revisionId: `rev-${periodoId}`, numero: 1, inicio: periodo.inicio, fin: periodo.fin, provisional: periodo.estado !== "cerrado",
          hechos: hechos.filter(({ fecha }) => fecha >= periodo.inicio && fecha <= periodo.fin) };
      },
    },
    externas: contexto.repositorio,
    descansos: { listarSustitutoriosParaPagos: async () => [] },
  };
  const dependencias: DependenciasDeFinalizacion = { fuentes, versiones: almacenDeVersiones.repositorio, pago: contexto.repositorio, ahora: () => AHORA };
  const confirmarTodas = () => Promise.all(TIPOS_DE_FUENTE.map(({ codigo }) => confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente: codigo, mes: MES })));
  const quitarCondicion = (relacionId: string, dato: CondicionLaboral["dato"]) => {
    condiciones.splice(condiciones.findIndex((candidata) => candidata.relacionId === relacionId && candidata.dato === dato), 1);
  };
  const retirarRegla = (codigo: ReglaLegal["codigo"]) => { reglas.splice(reglas.findIndex((regla) => regla.codigo === codigo), 1); };
  const cesar = (relacionId: string, fecha: string) => { Object.assign(relaciones.find(({ id }) => id === relacionId)!, { cese: fecha, ceseConfirmado: true }); };
  const corregirSueldo = (relacionId: string, valor: number) => {
    const anterior = condiciones.find((candidata) => candidata.relacionId === relacionId && candidata.dato === "sueldo" && candidata.reemplazadaEn === null)!;
    anterior.reemplazadaEn = new Date("2026-10-20T00:00:00Z");
    agregarCondicion(relacionId, "sueldo", valor, anterior.vigenteDesde);
  };
  const corregirRegla = (codigo: ReglaLegal["codigo"], valor: number) => {
    const anterior = reglas.find((regla) => regla.codigo === codigo && regla.reemplazadaEn === null)!;
    anterior.reemplazadaEn = new Date("2026-10-20T00:00:00Z");
    reglas.push({ ...anterior, id: `${anterior.id}-corregida`, valor, reemplazadaEn: null, activadaEn: new Date("2026-10-20T00:00:00Z") });
  };
  const quitarRelaciones = () => { relaciones.length = 0; };
  const definirPeriodos = (nuevos: Periodo[]) => { periodos = nuevos; };
  return { dependencias, contexto, almacenDeVersiones, confirmarTodas, quitarCondicion, agregarCondicion, retirarRegla, cesar, quitarRelaciones, corregirSueldo, corregirRegla, definirPeriodos, hechos };
}

describe("finalización del mes completo", () => {
  let escenario: ReturnType<typeof crearEscenario>;
  let dependencias: DependenciasDeFinalizacion;

  beforeEach(async () => {
    escenario = crearEscenario();
    dependencias = escenario.dependencias;
    await escenario.confirmarTodas();
  });

  /** Como en la pantalla: Finanzas revisa el borrador (verificación) y luego pide finalizar con la huella de lo que revisó. */
  const finalizar = async () => {
    const revision = await evaluarFinalizacion(dependencias, finanzas, { mes: MES });
    return finalizarMes(dependencias, finanzas, { mes: MES, huella: revision.huella });
  };
  /** Todos los bloqueos informados, del mes y de las personas; falla si el resultado no es «bloqueado». */
  const bloqueosDe = (resultado: Awaited<ReturnType<typeof finalizar>>) => {
    if (resultado.estado !== "bloqueado") throw new Error(`Se esperaba «bloqueado» y se obtuvo «${resultado.estado}».`);
    return [...resultado.bloqueos.delMes, ...resultado.bloqueos.porPersona.flatMap(({ bloqueos }) => bloqueos)];
  };
  const finalizada = async () => {
    const resultado = await finalizar();
    if (resultado.estado !== "finalizada") throw new Error(`Se esperaba una versión finalizada y se obtuvo «${resultado.estado}».`);
    return resultado.version;
  };

  it("F-02 finaliza un mes de 3 personas válidas: versión 1 con las 3 filas, su actor y la fecha del reloj", async () => {
    const version = await finalizada();

    expect(version.numero).toBe(1);
    expect(version.personas.map(({ nombre }) => nombre)).toEqual(["Ana", "Beto", "Carla"]);
    expect(version.subtotalCentimos).toBe(450000);
    expect(version.finalizadaPorId).toBe(finanzas.id);
    expect(version.finalizadaPor).toBe("finanzas");
    expect(version.finalizadaEn.toISOString().slice(0, 10)).toBe("2026-10-26");
  });

  it("F-03 la versión conserva por persona las líneas, las bases y el subtotal del borrador revisado, sin restar los aportes", async () => {
    const borrador = await prepararBorrador(dependencias.fuentes, MES);
    const version = await finalizada();

    expect(version.personas.map(({ subtotalCentimos }) => subtotalCentimos)).toEqual([200000, 150000, 100000]);
    const ana = version.personas[0];
    expect(ana.lineas.find(({ concepto }) => concepto === "sueldo_basico")?.importeCentimos).toBe(200000);
    expect(ana.lineas.some(({ concepto }) => concepto === "aporte_onp")).toBe(true);
    expect(ana.bases.map(({ mesDeDevengue, pensionariaCentimos }) => ({ mesDeDevengue, pensionariaCentimos }))).toEqual([{ mesDeDevengue: MES, pensionariaCentimos: 200000 }]);
    expect(version.personas.map(({ lineas, bases }) => ({ lineas, bases }))).toEqual(borrador.personas.map(({ lineas, basesPorDevengue }) => ({ lineas, bases: basesPorDevengue })));
  });

  it("F-04 la versión guarda las reglas legales vigentes, las revisiones de asistencia y el estado de cada fuente externa", async () => {
    await registrarImporte(escenario.contexto.repositorio, finanzas, { tipoDeFuente: "comisiones_de_ventas", dni: "10000001", concepto: "comision_de_ventas",
      fechaDelHecho: "2026-10-05", mesDeDevengue: MES, mesDeAplicacion: MES, monto: "150" });
    await confirmarFuente(escenario.contexto.repositorio, finanzas, { tipoDeFuente: "comisiones_de_ventas", mes: MES });

    const version = await finalizada();

    expect(version.reglas.map(({ codigo, valor, vigenteDesde }) => ({ codigo, valor, vigenteDesde })).sort((a, b) => a.codigo.localeCompare(b.codigo))).toEqual([
      { codigo: "essalud_base_minima", valor: 100000, vigenteDesde: "2026-01-01" },
      { codigo: "essalud_tasa", valor: 900, vigenteDesde: "2026-01-01" },
      { codigo: "onp_tasa", valor: 1300, vigenteDesde: "2026-01-01" },
    ]);
    expect(version.reglas.every(({ fuenteOficial, activadaPor }) => fuenteOficial.length > 0 && activadaPor === "finanzas")).toBe(true);
    expect(version.revisiones.map(({ periodoId, numero, inicio, fin }) => ({ periodoId, numero, inicio, fin }))).toEqual([{ periodoId: "p1", numero: 1, inicio: "2026-09-26", fin: "2026-10-25" }]);
    expect(version.fuentes.map(({ tipoDeFuente, estado, filas, totalCentimos }) => ({ tipoDeFuente, estado, filas, totalCentimos }))).toEqual(
      TIPOS_DE_FUENTE.map(({ codigo }) => ({ tipoDeFuente: codigo, estado: "Confirmada", filas: codigo === "comisiones_de_ventas" ? 1 : 0, totalCentimos: codigo === "comisiones_de_ventas" ? 15000 : 0 })));
  });

  it("F-05 si Beto no tiene sueldo vigente no se guarda ninguna versión y se informa su bloqueo con su causa", async () => {
    escenario.quitarCondicion("r-beto", "sueldo");

    const resultado = await finalizar();

    expect(resultado.estado).toBe("bloqueado");
    if (resultado.estado !== "bloqueado") return;
    expect(resultado.bloqueos.porPersona).toEqual([{ dni: "10000002", nombre: "Beto", bloqueos: [expect.stringContaining("Sin sueldo vigente")] }]);
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-06 con la fuente Adelantos sin confirmar no se finaliza y se indica la fuente", async () => {
    await volverAPendiente(escenario.contexto.repositorio, finanzas, { tipoDeFuente: "adelantos", mes: MES });

    const resultado = await finalizar();

    expect(resultado.estado).toBe("bloqueado");
    if (resultado.estado !== "bloqueado") return;
    expect(resultado.bloqueos.delMes).toEqual([expect.stringContaining("Adelantos")]);
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-07 sin tasa de EsSalud vigente no se finaliza", async () => {
    escenario.retirarRegla("essalud_tasa");

    const bloqueos = bloqueosDe(await finalizar());

    expect(bloqueos).toEqual(expect.arrayContaining([expect.stringMatching(/^No hay .*EsSalud.* vigente/)]));
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-08 un cambio de régimen laboral dentro del mes bloquea todo el mes", async () => {
    escenario.agregarCondicion("r-ana", "regimen_laboral", "remype_pequena_empresa", "2026-10-10");

    const bloqueos = bloqueosDe(await finalizar());

    expect(bloqueos).toEqual(expect.arrayContaining([expect.stringMatching(/^Pendiente: cambio dentro del mes .*falta definir la regla con Finanzas\.$/)]));
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-09 una jornada con horas extra entre 22:00 y 06:00 bloquea el mes", async () => {
    escenario.hechos.push({ dni: "10000001", fecha: "2026-10-07", grupo: "Taller", sede: "Lima", horarioAplicado: { entradaProgramada: "14:00", salidaProgramada: "22:00" },
      resultado: "trabajada", minutosTrabajados: 540, tardanza: null, horaExtra: { estado: "aprobada", minutosAl25: 60, minutosAl35: 0, trabajoNocturno: true, causaDeDescarte: null },
      diaEspecial: null, evidencia: { asistenciaId: "a-1", turnoPublicadoId: "t-1" } });

    const bloqueos = bloqueosDe(await finalizar());

    expect(bloqueos).toEqual(expect.arrayContaining([expect.stringMatching(/^Trabajo entre 22:00 y 06:00 el .*07.*\. Aún no se calcula; la finalización queda bloqueada hasta definir y validar la regla\.$/)]));
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-10 con la tercera persona en subtotal negativo no existe ninguna versión y se muestra el motivo", async () => {
    await registrarImporte(escenario.contexto.repositorio, finanzas, { tipoDeFuente: "adelantos", dni: "10000003", concepto: "adelanto",
      fechaDelHecho: "2026-10-05", mesDeDevengue: MES, mesDeAplicacion: MES, monto: "1200" });
    await confirmarFuente(escenario.contexto.repositorio, finanzas, { tipoDeFuente: "adelantos", mes: MES });

    const resultado = await finalizar();

    expect(resultado.estado).toBe("bloqueado");
    if (resultado.estado !== "bloqueado") return;
    expect(resultado.bloqueos.porPersona).toEqual([{ dni: "10000003", nombre: "Carla", bloqueos: [expect.stringContaining("Neto negativo: S/ −200,00")] }]);
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-11 un cese sin conciliar bloquea el mes", async () => {
    escenario.cesar("r-beto", "2026-10-20");

    const bloqueos = bloqueosDe(await finalizar());

    expect(bloqueos).toContain("El cese de Beto no tiene su liquidación conciliada.");
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-12 un hueco en la cobertura del corte bloquea el mes", async () => {
    escenario.definirPeriodos([{ id: "p1", inicio: "2026-09-26", fin: "2026-10-11", estado: "cerrado" }, { id: "p2", inicio: "2026-10-15", fin: "2026-10-25", estado: "cerrado" }]);

    const bloqueos = bloqueosDe(await finalizar());

    expect(bloqueos).toContain("Falta cobertura del 12/10/2026 al 14/10/2026: ningún período la incluye.");
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-13 períodos solapados bloquean el mes", async () => {
    escenario.definirPeriodos([{ id: "p1", inicio: "2026-09-26", fin: "2026-10-05", estado: "cerrado" }, { id: "p2", inicio: "2026-10-03", fin: "2026-10-25", estado: "cerrado" }]);

    const bloqueos = bloqueosDe(await finalizar());

    expect(bloqueos).toEqual(expect.arrayContaining([expect.stringMatching(/^Los períodos .* se solapan\.$/)]));
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-14 un período que cruza el día 25 bloquea el mes", async () => {
    escenario.definirPeriodos([{ id: "p1", inicio: "2026-09-26", fin: "2026-10-10", estado: "cerrado" }, { id: "p2", inicio: "2026-10-11", fin: "2026-10-30", estado: "cerrado" }]);

    const bloqueos = bloqueosDe(await finalizar());

    expect(bloqueos).toEqual(expect.arrayContaining([expect.stringMatching(/^El período .* cruza el día 25/)]));
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-15 un período del corte sin cerrar impide finalizar", async () => {
    escenario.definirPeriodos([{ id: "p1", inicio: "2026-09-26", fin: "2026-10-25", estado: "abierto" }]);

    const bloqueos = bloqueosDe(await finalizar());

    expect(bloqueos).toEqual(expect.arrayContaining([expect.stringMatching(/^El período .* no está cerrado/)]));
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-16 un mes sin personas no se puede finalizar", async () => {
    escenario.quitarRelaciones();

    const resultado = await finalizar();

    expect(resultado).toEqual({ estado: "sin_personas", mensaje: "Este mes no incluye personas" });
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-17 con varios bloqueos se informan todos, con un conteo igual al del panel «Bloqueos del mes (N)»", async () => {
    // Un bloqueo del mes (hueco en la cobertura) y dos personas bloqueadas: Beto sin sueldo y Carla con subtotal negativo.
    escenario.definirPeriodos([{ id: "p1", inicio: "2026-09-26", fin: "2026-10-11", estado: "cerrado" }, { id: "p2", inicio: "2026-10-15", fin: "2026-10-25", estado: "cerrado" }]);
    escenario.quitarCondicion("r-beto", "sueldo");
    await registrarImporte(escenario.contexto.repositorio, finanzas, { tipoDeFuente: "adelantos", dni: "10000003", concepto: "adelanto",
      fechaDelHecho: "2026-10-05", mesDeDevengue: MES, mesDeAplicacion: MES, monto: "1200" });
    await confirmarFuente(escenario.contexto.repositorio, finanzas, { tipoDeFuente: "adelantos", mes: MES });

    const resultado = await evaluarFinalizacion(dependencias, finanzas, { mes: MES });

    expect(resultado.estado).toBe("bloqueado");
    if (resultado.estado !== "bloqueado") return;
    expect(resultado.bloqueos.total).toBe(3);
    expect(resultado.bloqueos.delMes).toEqual([expect.stringContaining("Falta cobertura")]);
    expect(resultado.bloqueos.porPersona).toEqual([
      { dni: "10000002", nombre: "Beto", bloqueos: [expect.stringContaining("Sin sueldo vigente")] },
      { dni: "10000003", nombre: "Carla", bloqueos: [expect.stringContaining("Neto negativo: S/ −200,00")] },
    ]);
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-18 antes de abrir el diálogo, la verificación informa el alcance exacto sin guardar nada", async () => {
    const resultado = await evaluarFinalizacion(dependencias, finanzas, { mes: MES });

    expect(resultado).toMatchObject({ estado: "lista", alcance: { personas: 3, subtotalCentimos: 450000, numeroDeVersion: 1, periodos: [{ inicio: "2026-09-26", fin: "2026-10-25" }] } });
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-19 si los datos cambiaron desde el borrador revisado no se guarda y se devuelve un resumen con los subtotales y las personas con diferencia", async () => {
    const revision = await evaluarFinalizacion(dependencias, finanzas, { mes: MES });
    escenario.corregirSueldo("r-ana", 210000);

    const resultado = await finalizarMes(dependencias, finanzas, { mes: MES, huella: revision.huella });

    expect(resultado).toMatchObject({ estado: "cambio", resumen: { subtotalAnteriorCentimos: 450000, subtotalActualCentimos: 460000,
      personas: [{ dni: "10000001", nombre: "Ana", anteriorCentimos: 200000, actualCentimos: 210000 }] } });
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-20 un cambio de cualquier dato de entrada cuenta aunque el subtotal no varíe, e indica el tipo de dato", async () => {
    const revision = await evaluarFinalizacion(dependencias, finanzas, { mes: MES });
    escenario.corregirRegla("essalud_tasa", 950);

    const resultado = await finalizarMes(dependencias, finanzas, { mes: MES, huella: revision.huella });

    expect(resultado).toMatchObject({ estado: "cambio", resumen: { subtotalAnteriorCentimos: 450000, subtotalActualCentimos: 450000, personas: [], datosCambiados: ["Reglas legales"] } });
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-21 tras revisar el cálculo actualizado, finalizar guarda la versión", async () => {
    const revisada = await evaluarFinalizacion(dependencias, finanzas, { mes: MES });
    escenario.corregirSueldo("r-ana", 210000);
    expect((await finalizarMes(dependencias, finanzas, { mes: MES, huella: revisada.huella })).estado).toBe("cambio");
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);

    const version = await finalizada();

    expect(version.numero).toBe(1);
    expect(version.personas.map(({ subtotalCentimos }) => subtotalCentimos)).toEqual([210000, 150000, 100000]);
    expect(version.subtotalCentimos).toBe(460000);
  });

  it("F-22 un bloqueo nuevo aparecido tras la revisión da «bloqueado» con los bloqueos actuales, no «cambió», y no guarda", async () => {
    const revisada = await evaluarFinalizacion(dependencias, finanzas, { mes: MES });
    expect(revisada.estado).toBe("lista");
    escenario.retirarRegla("essalud_tasa");

    const resultado = await finalizarMes(dependencias, finanzas, { mes: MES, huella: revisada.huella });

    expect(bloqueosDe(resultado)).toEqual(expect.arrayContaining([expect.stringMatching(/^No hay .*EsSalud.* vigente/)]));
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-23 una segunda finalización crea la versión 2 y deja la versión 1 exactamente igual aunque los datos hayan cambiado", async () => {
    const primera = await finalizada();
    const copiaDeLaPrimera = structuredClone(primera);
    escenario.corregirSueldo("r-ana", 210000);

    const segunda = await finalizada();

    expect(primera.subtotalCentimos).toBe(450000);
    expect(segunda.numero).toBe(2);
    expect(segunda.subtotalCentimos).toBe(460000);
    expect(segunda.personas[0].subtotalCentimos).toBe(210000);
    expect(escenario.almacenDeVersiones.guardadas()[0]).toEqual(copiaDeLaPrimera);
    expect(escenario.almacenDeVersiones.guardadas().map(({ numero }) => numero)).toEqual([1, 2]);
  });

  it("F-24 un mes con pago realizado confirmado no admite una nueva versión", async () => {
    const primera = await finalizada();
    escenario.contexto.mesesConPagoConfirmado.add(MES);
    escenario.corregirSueldo("r-ana", 210000);

    await expect(finalizar()).rejects.toThrow("Este mes ya tiene su pago realizado confirmado; no admite una nueva versión.");

    expect(escenario.almacenDeVersiones.guardadas()).toEqual([primera]);
  });

  it("F-25 solo Finanzas evalúa o finaliza: el servidor rechaza a cualquier otro rol y a la ausencia de sesión sin leer importes ni guardar", async () => {
    const prohibido = (): never => { throw new Error("se consultó una fuente sin permiso"); };
    const sinLecturas: DependenciasDeFinalizacion = {
      fuentes: { relaciones: { listarConPersona: prohibido }, condiciones: { listarTodas: prohibido }, reglas: { listarTodas: prohibido },
        asistencia: { listar: prohibido, leerHechosDelPeriodo: prohibido },
        externas: { listarImportesDelMes: prohibido, listarConfirmacionesDelMes: prohibido, listarAbonosVacacionales: prohibido },
        descansos: { listarSustitutoriosParaPagos: prohibido } },
      versiones: { guardarVersion: prohibido, listarVersiones: prohibido, buscarVersion: prohibido }, pago: { mesConPagoConfirmado: prohibido }, ahora: () => AHORA,
    };
    const huella = { entrada: "x", datos: {}, subtotalCentimos: 0, personas: [] };
    const sinPermiso: Array<Actor | undefined> = [
      { id: "22222222-2222-4222-8222-222222222222", rol: "administrador", nombreUsuario: "admin" },
      { id: "33333333-3333-4333-8333-333333333333", rol: "gerente_de_area", nombreUsuario: "gerente", grupos: [{ nombre: "Taller", gestionaAsistencia: true }] },
      { id: "44444444-4444-4444-8444-444444444444", rol: "recursos_humanos", nombreUsuario: "rrhh" },
      undefined,
    ];

    for (const actor of sinPermiso) {
      const motivo = "No tiene permiso para consultar ni editar Pagos.";
      await expect(evaluarFinalizacion(sinLecturas, actor as Actor, { mes: MES })).rejects.toThrow(motivo);
      await expect(finalizarMes(sinLecturas, actor as Actor, { mes: MES, huella })).rejects.toThrow(motivo);
      await expect(listarVersiones(sinLecturas, actor as Actor, MES)).rejects.toThrow(motivo);
      await expect(consultarVersion(sinLecturas, actor as Actor, MES, 1)).rejects.toThrow(motivo);
    }
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-26 si falla el guardado a mitad (la segunda persona no se puede escribir) no queda versión parcial y se informa «No se guardó ninguna versión»", async () => {
    let falla = true;
    escenario = crearEscenario({ alEscribirFila: (indice) => { if (falla && indice === 1) throw new Error("conexión perdida al escribir la fila 2"); } });
    dependencias = escenario.dependencias;
    await escenario.confirmarTodas();

    await expect(finalizar()).rejects.toThrow(/^No se guardó ninguna versión$/);
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);

    falla = false;
    expect((await finalizada()).numero).toBe(1);
  });

  it("F-27 el historial lista por versión número, actor, fecha y estado (la última «Vigente», las anteriores «Reemplazada») y cada versión se abre completa", async () => {
    const primera = await finalizada();
    escenario.corregirSueldo("r-ana", 210000);
    const segunda = await finalizada();

    const historial = await listarVersiones(dependencias, finanzas, MES);
    const abierta = await consultarVersion(dependencias, finanzas, MES, 1);

    expect(historial).toEqual([
      { numero: 2, finalizadaPorId: finanzas.id, finalizadaPor: "finanzas", finalizadaEn: AHORA, estado: "Vigente", personas: 3, subtotalCentimos: 460000 },
      { numero: 1, finalizadaPorId: finanzas.id, finalizadaPor: "finanzas", finalizadaEn: AHORA, estado: "Reemplazada", personas: 3, subtotalCentimos: 450000 },
    ]);
    expect(abierta).toEqual(primera);
    expect(abierta?.personas.every(({ lineas, bases }) => lineas.length > 0 && bases.length > 0)).toBe(true);
    expect(abierta?.reglas.length).toBe(3);
    expect(abierta?.revisiones).toHaveLength(1);
    expect(abierta?.fuentes).toHaveLength(TIPOS_DE_FUENTE.length);
    expect(await consultarVersion(dependencias, finanzas, MES, 2)).toEqual(segunda);
  });

  it("F-28 consultar una versión inexistente o de otro mes no devuelve datos de otra versión", async () => {
    await finalizada();
    escenario.corregirSueldo("r-ana", 210000);
    await finalizada();

    expect(await consultarVersion(dependencias, finanzas, MES, 3)).toBeUndefined();
    expect(await consultarVersion(dependencias, finanzas, "2026-09", 1)).toBeUndefined();
    expect(await listarVersiones(dependencias, finanzas, "2026-09")).toEqual([]);
  });

  // Prueba posterior (no TDD): `enOrdenEstable` ya existía cuando se escribió; se acompaña de un control de sensibilidad, no de un rojo.
  it("F-65 la huella no cambia si las mismas listas llegan en otro orden, y sí cambia si cambia el contenido de una fila", async () => {
    const { repositorio } = escenario.contexto;
    for (const [dni, monto] of [["10000001", "150"], ["10000002", "80"], ["10000003", "40"]]) {
      await registrarImporte(repositorio, finanzas, { tipoDeFuente: "comisiones_de_ventas", dni, concepto: "comision_de_ventas", fechaDelHecho: "2026-10-05", mesDeDevengue: MES, mesDeAplicacion: MES, monto });
    }
    await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "comisiones_de_ventas", mes: MES });
    const invertida = <A extends unknown[], T>(leer: (...argumentos: A) => Promise<T[]>) => async (...argumentos: A) => [...await leer(...argumentos)].reverse();
    const { fuentes } = dependencias;
    const enOtroOrden: DependenciasDeFinalizacion = { ...dependencias, fuentes: { ...fuentes,
      relaciones: { listarConPersona: invertida(fuentes.relaciones.listarConPersona) },
      condiciones: { listarTodas: invertida(fuentes.condiciones.listarTodas) },
      reglas: { listarTodas: invertida(fuentes.reglas.listarTodas) },
      externas: { ...repositorio, listarImportesDelMes: invertida(repositorio.listarImportesDelMes) } } };
    const revisada = await evaluarFinalizacion(dependencias, finanzas, { mes: MES });

    const permutada = await evaluarFinalizacion(enOtroOrden, finanzas, { mes: MES });
    expect(permutada.huella).toEqual(revisada.huella);
    expect((await finalizarMes(enOtroOrden, finanzas, { mes: MES, huella: revisada.huella })).estado).toBe("finalizada");

    escenario.corregirSueldo("r-ana", 210000);
    const modificada = await evaluarFinalizacion(enOtroOrden, finanzas, { mes: MES });
    expect(modificada.huella.entrada).not.toBe(revisada.huella.entrada);
    expect(await finalizarMes(enOtroOrden, finanzas, { mes: MES, huella: revisada.huella })).toMatchObject({ estado: "cambio" });
    expect(escenario.almacenDeVersiones.guardadas()).toHaveLength(1);
  });
});
