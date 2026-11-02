import { describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { efectosDeAjuste } from "@/conceptos-de-preliquidacion/catalogo";

import { confirmarFuente, consultarImportesDePersona, registrarImporte, volverAPendiente } from "./gestionar-fuentes-externas";
import { previsualizarImportacionDeFuente } from "./importar-fuente";
import { decidirIncidencia, registrarAjuste, registrarIncidencia } from "./incidencias-y-ajustes";
import { crearRepositorioEnMemoria } from "./repositorio-en-memoria";

const finanzas: Actor = { id: "11111111-1111-4111-8111-111111111111", rol: "finanzas", nombreUsuario: "finanzas" };
const gerente: Actor = { ...finanzas, rol: "gerente_de_area" };
const datos = { dni: "12345678", fechaDelHecho: "2026-09-29", mesDeDevengue: "2026-09", mesDeAplicacion: "2026-10", monto: "80,50" };

describe("incidencias de tienda y ajustes", () => {
  it("la incidencia no entra al neto sin autorización; investigación no bloquea confirmar la fuente", async () => {
    const { repositorio } = crearRepositorioEnMemoria({ [datos.dni]: "Ana" });
    const incidencia = await registrarIncidencia(repositorio, finanzas, datos);
    await expect(confirmarFuente(repositorio, finanzas, { tipoDeFuente: "incidencias_de_tienda", mes: datos.mesDeAplicacion })).rejects.toThrow(/sin sustento/);
    await decidirIncidencia(repositorio, finanzas, { id: incidencia.id, decision: "no_descontar" });
    await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "incidencias_de_tienda", mes: datos.mesDeAplicacion });
    expect((await consultarImportesDePersona(repositorio, finanzas, datos.dni, datos.mesDeAplicacion)).incidencias_de_tienda).toMatchObject({ estado: "confirmado", total: 0, importes: [] });
  });

  it("solo el descuento con sustento, autorizador y fecha entra al neto", async () => {
    const { repositorio } = crearRepositorioEnMemoria({ [datos.dni]: "Ana" });
    const incidencia = await registrarIncidencia(repositorio, finanzas, datos);
    await expect(decidirIncidencia(repositorio, finanzas, { id: incidencia.id, decision: "autorizar", sustento: "Acta" })).rejects.toThrow(/requiere/);
    await decidirIncidencia(repositorio, finanzas, { id: incidencia.id, decision: "autorizar", sustento: "Acta de merma", autorizadoPor: "Diego", fechaDeAutorizacion: "2026-10-01" });
    await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "incidencias_de_tienda", mes: datos.mesDeAplicacion });
    expect((await consultarImportesDePersona(repositorio, finanzas, datos.dni, datos.mesDeAplicacion)).incidencias_de_tienda).toMatchObject({ estado: "confirmado", total: 8050 });
    await expect(decidirIncidencia(repositorio, finanzas, { id: incidencia.id, decision: "no_descontar" })).rejects.toThrow(/resuelta/);
  });

  it("el ajuste conserva los tres tiempos, motivo y toma efectos del concepto corregido", async () => {
    const { repositorio } = crearRepositorioEnMemoria({ [datos.dni]: "Ana" });
    const ajuste = await registrarAjuste(repositorio, finanzas, { ...datos, conceptoAjustado: "comision_de_ventas", sentidoAjuste: "resta", motivo: "Diferencia del mes anterior" });
    expect(ajuste).toMatchObject({ ...datos, monto: 8050, conceptoAjustado: "comision_de_ventas", sentidoAjuste: "resta", motivoDeAjuste: "Diferencia del mes anterior", registradoPorId: finanzas.id });
    expect(efectosDeAjuste("comision_de_ventas", "resta")).toMatchObject({ efectoEnNeto: "resta", bases: { pensionaria: "resta", essalud: "resta", quinta: "resta" } });
    expect(efectosDeAjuste("adelanto", "resta")).toMatchObject({ efectoEnNeto: "suma", bases: { pensionaria: "no_afecta" } });
  });

  it("rechaza carga genérica, roles ajenos y cambios tras confirmar el pago", async () => {
    const { repositorio, mesesConPagoConfirmado } = crearRepositorioEnMemoria({ [datos.dni]: "Ana" });
    await expect(registrarImporte(repositorio, finanzas, { ...datos, tipoDeFuente: "incidencias_de_tienda", concepto: "descuento_autorizado_por_incidencia" })).rejects.toThrow(/formulario propio/);
    await expect(previsualizarImportacionDeFuente(repositorio, finanzas, { tipoDeFuente: "incidencias_de_tienda", mes: datos.mesDeAplicacion, nombre: "incidencias.xlsx", contenido: new Uint8Array() })).rejects.toThrow(/formulario propio/);
    await expect(previsualizarImportacionDeFuente(repositorio, finanzas, { tipoDeFuente: "ajustes_de_preliquidacion", mes: datos.mesDeAplicacion, nombre: "ajustes.xlsx", contenido: new Uint8Array() })).rejects.toThrow(/formulario propio/);
    await expect(registrarIncidencia(repositorio, gerente, datos)).rejects.toThrow(/permiso/);
    mesesConPagoConfirmado.add(datos.mesDeAplicacion);
    await expect(registrarAjuste(repositorio, finanzas, { ...datos, conceptoAjustado: "sueldo_basico", sentidoAjuste: "suma", motivo: "Corrección" })).rejects.toThrow(/pago realizado confirmado/);
  });

  it("una versión final aún no pagada permite corregir la fuente sin editar la versión; volver a pendiente explícito sigue cerrado", async () => {
    const { repositorio, mesesFinalizados } = crearRepositorioEnMemoria({ [datos.dni]: "Ana" });
    await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "ajustes_de_preliquidacion", mes: datos.mesDeAplicacion });
    mesesFinalizados.add(datos.mesDeAplicacion);
    await expect(volverAPendiente(repositorio, finanzas, { tipoDeFuente: "ajustes_de_preliquidacion", mes: datos.mesDeAplicacion })).rejects.toThrow(/mes finalizado/);
    await registrarAjuste(repositorio, finanzas, { ...datos, conceptoAjustado: "sueldo_basico", sentidoAjuste: "suma", motivo: "Corrección" });
    expect((await repositorio.buscarConfirmacion("ajustes_de_preliquidacion", datos.mesDeAplicacion))).toBeUndefined();
  });

  // R1-P03 (revisión 1): C3, los conceptos de la conciliación no entran al neto ni a las bases; un ajuste sobre ellos no hace nada y se rechaza.
  it("R1-P03 rechaza un ajuste sobre un concepto de la conciliación y no guarda ninguna fila", async () => {
    const { repositorio } = crearRepositorioEnMemoria({ [datos.dni]: "Ana" });
    for (const conceptoAjustado of ["vacaciones_truncas", "cts_trunca", "gratificacion_trunca", "remuneracion_pendiente_del_mes", "abono_de_liquidacion"]) {
      await expect(registrarAjuste(repositorio, finanzas, { ...datos, conceptoAjustado, sentidoAjuste: "suma", motivo: "Corrección" })).rejects.toThrow(/conciliaci/i);
    }
    expect(await repositorio.listarImportesDelMes(datos.mesDeAplicacion)).toEqual([]);
  });
});

function contextoDeIncidenciaDeGerente() {
  const contexto = crearRepositorioEnMemoria({ [datos.dni]: "Ana" });
  const original = contexto.repositorio.ejecutarSobreFuente.bind(contexto.repositorio);
  contexto.repositorio.ejecutarSobreFuente = (tipo, mes, operacion) => original(tipo, mes, async (almacen) => {
    const insertar = almacen.insertarImporte.bind(almacen);
    const adaptado = {
      ...almacen,
      buscarGrupoDePersona: async () => "Taller",
      gerenteAsignadoAlGrupo: async (cuentaId: string, grupo: string) => cuentaId === gerenteTaller.id && grupo === "Taller",
      insertarImporte: async (nuevo: Parameters<typeof insertar>[0] & { motivoIncidencia?: string }) => {
        const resultado = await insertar(nuevo);
        if (resultado && nuevo.motivoIncidencia) Object.assign(resultado, { motivoIncidencia: nuevo.motivoIncidencia });
        return resultado;
      },
    };
    return operacion(adaptado);
  });
  return contexto;
}
const gerenteTaller: Actor = { id: "g1", rol: "gerente_de_area", grupos: [{ nombre: "Taller", gestionaAsistencia: true }] };
const solicitudGerente = (fechaDelHecho: string) => ({ dni: datos.dni, fechaDelHecho, monto: "80,50", motivo: "Producto dañado" }) as unknown as Parameters<typeof registrarIncidencia>[2];

describe("G06 incidencia por corte", () => {
  const casos = [
    { fila: "R15", fecha: "2026-10-25", mes: "2026-10", devengue: "2026-10", pagado: false },
    { fila: "R16", fecha: "2026-10-26", mes: "2026-11", devengue: "2026-10", pagado: false },
    { fila: "R17", fecha: "2026-12-26", mes: "2027-01", devengue: "2026-12", pagado: false },
    { fila: "R18", fecha: "2026-10-25", mes: "2026-10", devengue: "2026-10", pagado: true },
  ];
  it.each(casos)("$fila deriva el pago de la fecha y respeta el pago confirmado", async ({ fecha, mes, devengue, pagado }) => {
    const { repositorio, mesesConPagoConfirmado } = contextoDeIncidenciaDeGerente();
    if (pagado) mesesConPagoConfirmado.add(mes);
    const operacion = registrarIncidencia(repositorio, gerenteTaller, solicitudGerente(fecha));
    if (pagado) {
      await expect(operacion).rejects.toThrow(/pago realizado confirmado/i);
      expect(await repositorio.listarImportesDelMes(mes)).toEqual([]);
    } else {
      await expect(operacion).resolves.toMatchObject({ fechaDelHecho: fecha, mesDeAplicacion: mes, mesDeDevengue: devengue, monto: 8050, motivoIncidencia: "Producto dañado", estadoDeIncidencia: "sin_sustento" });
    }
  });
});

describe("G07 decisión financiera de incidencia registrada por gerente", () => {
  const casos = [{ fila: "R20", decision: "autorizar" as const, total: 8050 }, { fila: "R21", decision: "no_descontar" as const, total: 0 }];
  it.each(casos)("$fila aplica solo la decisión de Finanzas", async ({ decision, total }) => {
    const { repositorio } = contextoDeIncidenciaDeGerente();
    const incidencia = await registrarIncidencia(repositorio, gerenteTaller, solicitudGerente("2026-10-25"));
    await decidirIncidencia(repositorio, finanzas, { id: incidencia.id, decision, sustento: "Acta", autorizadoPor: "Finanzas", fechaDeAutorizacion: "2026-10-26" });
    await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "incidencias_de_tienda", mes: "2026-10" });
    expect((await consultarImportesDePersona(repositorio, finanzas, datos.dni, "2026-10")).incidencias_de_tienda).toMatchObject({ estado: "confirmado", total });
  });
});
