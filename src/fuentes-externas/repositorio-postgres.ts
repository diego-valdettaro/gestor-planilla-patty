import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { colaboradores, confirmacionesDeFuente, cuentasLocales, importacionesDeFuente, importesExternos } from "@/db/schema";

import type {
  AlmacenDeFuentesExternas,
  ConfirmacionDeFuente,
  ImportacionDeFuente,
  ImporteExterno,
  NuevaImportacionDeFuente,
  NuevoImporteExterno,
  RepositorioDeFuentesExternas,
} from "./gestionar-fuentes-externas";
import type { CodigoDeTipoDeFuente } from "./tipos-de-fuente";

type Db = Pick<NodePgDatabase<typeof schema>, "select" | "insert" | "update" | "delete">;

const columnas = {
  id: importesExternos.id,
  nombre: colaboradores.nombre,
  tipoDeFuente: importesExternos.tipoDeFuente,
  dni: importesExternos.dni,
  concepto: importesExternos.concepto,
  fechaDelHecho: importesExternos.fechaDelHecho,
  mesDeDevengue: importesExternos.mesDeDevengue,
  mesDeAplicacion: importesExternos.mesDeAplicacion,
  monto: importesExternos.montoCentimos,
  procedencia: importesExternos.procedencia,
  registradoPorId: importesExternos.registradoPorId,
  registradoPor: cuentasLocales.nombreUsuario,
  registradoEn: importesExternos.registradoEn,
  anuladoEn: importesExternos.anuladoEn,
  motivoDeAnulacion: importesExternos.motivoDeAnulacion,
  importacionId: importesExternos.importacionId,
  estadoDeIncidencia: importesExternos.estadoDeIncidencia,
  sustento: importesExternos.sustento,
  autorizadoPor: importesExternos.autorizadoPor,
  fechaDeAutorizacion: importesExternos.fechaDeAutorizacion,
  conceptoAjustado: importesExternos.conceptoAjustado,
  sentidoAjuste: importesExternos.sentidoAjuste,
  motivoDeAjuste: importesExternos.motivoDeAjuste,
};

const columnasDeImportacion = {
  id: importacionesDeFuente.id,
  tipoDeFuente: importacionesDeFuente.tipoDeFuente,
  mesDeAplicacion: importacionesDeFuente.mesDeAplicacion,
  archivoNombre: importacionesDeFuente.archivoNombre,
  archivoUbicacion: importacionesDeFuente.archivoUbicacion,
  archivoHashSha256: importacionesDeFuente.archivoHashSha256,
  usuarioId: importacionesDeFuente.usuarioId,
  usuario: cuentasLocales.nombreUsuario,
  importadaEn: importacionesDeFuente.importadaEn,
  filas: importacionesDeFuente.filas,
  total: importacionesDeFuente.totalCentimos,
  validacion: importacionesDeFuente.validacion,
  reemplazadaEn: importacionesDeFuente.reemplazadaEn,
};

type FilaDeImportacion = Omit<ImportacionDeFuente, "tipoDeFuente"> & { tipoDeFuente: string };

function aImportacion(fila: FilaDeImportacion): ImportacionDeFuente {
  return { ...fila, tipoDeFuente: fila.tipoDeFuente as CodigoDeTipoDeFuente };
}

type Fila = Omit<ImporteExterno, "tipoDeFuente" | "estadoDeIncidencia" | "sentidoAjuste"> & { tipoDeFuente: string; estadoDeIncidencia: string | null; sentidoAjuste: string | null };

function aImporte(fila: Fila): ImporteExterno {
  return { ...fila, tipoDeFuente: fila.tipoDeFuente as CodigoDeTipoDeFuente, estadoDeIncidencia: fila.estadoDeIncidencia as ImporteExterno["estadoDeIncidencia"], sentidoAjuste: fila.sentidoAjuste as ImporteExterno["sentidoAjuste"] };
}

class AlmacenPostgresDeFuentesExternas implements AlmacenDeFuentesExternas {
  constructor(protected readonly db: Db) {}

  protected consultar() {
    return this.db.select(columnas).from(importesExternos)
      .innerJoin(colaboradores, eq(colaboradores.dni, importesExternos.dni))
      .innerJoin(cuentasLocales, eq(cuentasLocales.id, importesExternos.registradoPorId));
  }

  async listarImportes(tipo: CodigoDeTipoDeFuente, mes: string): Promise<ImporteExterno[]> {
    const filas = await this.consultar()
      .where(and(eq(importesExternos.tipoDeFuente, tipo), eq(importesExternos.mesDeAplicacion, mes), isNull(importesExternos.anuladoEn)))
      .orderBy(asc(importesExternos.dni), asc(importesExternos.fechaDelHecho), asc(importesExternos.registradoEn));
    return filas.map(aImporte);
  }

  async buscarImporte(id: string): Promise<ImporteExterno | undefined> {
    const [fila] = await this.consultar().where(eq(importesExternos.id, id));
    return fila && aImporte(fila);
  }

  async insertarImporte(nuevo: NuevoImporteExterno): Promise<ImporteExterno | undefined> {
    const [insertado] = await this.db.insert(importesExternos).values({
      tipoDeFuente: nuevo.tipoDeFuente, dni: nuevo.dni, concepto: nuevo.concepto, fechaDelHecho: nuevo.fechaDelHecho,
      mesDeDevengue: nuevo.mesDeDevengue, mesDeAplicacion: nuevo.mesDeAplicacion, montoCentimos: nuevo.monto,
      procedencia: nuevo.procedencia, registradoPorId: nuevo.responsableId, importacionId: nuevo.importacionId ?? null,
      estadoDeIncidencia: nuevo.estadoDeIncidencia, conceptoAjustado: nuevo.conceptoAjustado,
      sentidoAjuste: nuevo.sentidoAjuste, motivoDeAjuste: nuevo.motivoDeAjuste,
    }).onConflictDoNothing().returning({ id: importesExternos.id });
    return insertado && this.buscarImporte(insertado.id);
  }

  async anularImporte(id: string, motivo: string, anuladoEn: Date): Promise<boolean> {
    const filas = await this.db.update(importesExternos).set({ anuladoEn, motivoDeAnulacion: motivo })
      .where(and(eq(importesExternos.id, id), isNull(importesExternos.anuladoEn))).returning({ id: importesExternos.id });
    return filas.length > 0;
  }

  async cambiarIncidencia(id: string, estado: NonNullable<ImporteExterno["estadoDeIncidencia"]>, sustento?: string, autorizadoPor?: string, fechaDeAutorizacion?: string): Promise<boolean> {
    const filas = await this.db.update(importesExternos).set({ estadoDeIncidencia: estado, sustento: sustento ?? null, autorizadoPor: autorizadoPor ?? null, fechaDeAutorizacion: fechaDeAutorizacion ?? null })
      .where(and(eq(importesExternos.id, id), eq(importesExternos.tipoDeFuente, "incidencias_de_tienda"), isNull(importesExternos.anuladoEn)))
      .returning({ id: importesExternos.id });
    return filas.length > 0;
  }

  async buscarConfirmacion(tipo: CodigoDeTipoDeFuente, mes: string): Promise<ConfirmacionDeFuente | undefined> {
    return (await this.confirmaciones().where(and(eq(confirmacionesDeFuente.tipoDeFuente, tipo), eq(confirmacionesDeFuente.mesDeAplicacion, mes))))[0];
  }

  async confirmar(tipo: CodigoDeTipoDeFuente, mes: string, responsableId: string, confirmadaEn: Date): Promise<boolean> {
    const filas = await this.db.insert(confirmacionesDeFuente).values({ tipoDeFuente: tipo, mesDeAplicacion: mes, confirmadaPorId: responsableId, confirmadaEn })
      .onConflictDoNothing().returning({ tipo: confirmacionesDeFuente.tipoDeFuente });
    return filas.length > 0;
  }

  async quitarConfirmacion(tipo: CodigoDeTipoDeFuente, mes: string): Promise<boolean> {
    const filas = await this.db.delete(confirmacionesDeFuente)
      .where(and(eq(confirmacionesDeFuente.tipoDeFuente, tipo), eq(confirmacionesDeFuente.mesDeAplicacion, mes))).returning({ tipo: confirmacionesDeFuente.tipoDeFuente });
    return filas.length > 0;
  }

  protected importaciones() {
    return this.db.select(columnasDeImportacion).from(importacionesDeFuente).innerJoin(cuentasLocales, eq(cuentasLocales.id, importacionesDeFuente.usuarioId));
  }

  async buscarImportacionVigente(tipo: CodigoDeTipoDeFuente, mes: string): Promise<(ImportacionDeFuente & { importesVigentes: number }) | undefined> {
    const [fila] = await this.importaciones().where(and(eq(importacionesDeFuente.tipoDeFuente, tipo), eq(importacionesDeFuente.mesDeAplicacion, mes), isNull(importacionesDeFuente.reemplazadaEn)));
    if (!fila) return undefined;
    const [{ cantidad }] = await this.db.select({ cantidad: sql<number>`count(*)::int` }).from(importesExternos)
      .where(and(eq(importesExternos.importacionId, fila.id), isNull(importesExternos.anuladoEn)));
    return { ...aImportacion(fila), importesVigentes: cantidad };
  }

  async insertarImportacion(nueva: NuevaImportacionDeFuente): Promise<ImportacionDeFuente> {
    const [insertada] = await this.db.insert(importacionesDeFuente).values({
      tipoDeFuente: nueva.tipoDeFuente, mesDeAplicacion: nueva.mesDeAplicacion, archivoNombre: nueva.archivoNombre, archivoUbicacion: nueva.archivoUbicacion,
      archivoHashSha256: nueva.archivoHashSha256, usuarioId: nueva.usuarioId, importadaEn: nueva.importadaEn, filas: nueva.filas, totalCentimos: nueva.total, validacion: nueva.validacion,
    }).returning({ id: importacionesDeFuente.id });
    const [fila] = await this.importaciones().where(eq(importacionesDeFuente.id, insertada.id));
    return aImportacion(fila);
  }

  async reemplazarImportacion(id: string, motivo: string, reemplazadaEn: Date): Promise<number> {
    await this.db.update(importacionesDeFuente).set({ reemplazadaEn }).where(and(eq(importacionesDeFuente.id, id), isNull(importacionesDeFuente.reemplazadaEn)));
    const anulados = await this.db.update(importesExternos).set({ anuladoEn: reemplazadaEn, motivoDeAnulacion: motivo })
      .where(and(eq(importesExternos.importacionId, id), isNull(importesExternos.anuladoEn))).returning({ id: importesExternos.id });
    return anulados.length;
  }

  // Pagos todavía no confirma pagos; el ticket de pago debe consultar aquí si el mes ya tiene una versión pagada.
  async mesConPagoConfirmado(_mes: string): Promise<boolean> {
    return false;
  }

  // El ticket de finalización debe consultar aquí las versiones finales; aún no existe su tabla.
  async mesFinalizado(_mes: string): Promise<boolean> {
    return false;
  }

  protected confirmaciones() {
    return this.db.select({
      tipoDeFuente: sql<CodigoDeTipoDeFuente>`${confirmacionesDeFuente.tipoDeFuente}`,
      mesDeAplicacion: confirmacionesDeFuente.mesDeAplicacion,
      confirmadaPorId: confirmacionesDeFuente.confirmadaPorId,
      confirmadaPor: cuentasLocales.nombreUsuario,
      confirmadaEn: confirmacionesDeFuente.confirmadaEn,
    }).from(confirmacionesDeFuente).innerJoin(cuentasLocales, eq(cuentasLocales.id, confirmacionesDeFuente.confirmadaPorId));
  }
}

export class RepositorioPostgresDeFuentesExternas extends AlmacenPostgresDeFuentesExternas implements RepositorioDeFuentesExternas {
  constructor(private readonly raiz: NodePgDatabase<typeof schema>) {
    super(raiz);
  }

  async buscarPersona(dni: string): Promise<{ nombre: string } | undefined> {
    const [persona] = await this.raiz.select({ nombre: colaboradores.nombre }).from(colaboradores).where(eq(colaboradores.dni, dni));
    return persona;
  }

  async listarImportesDelMes(mes: string): Promise<ImporteExterno[]> {
    const filas = await this.consultar().where(and(eq(importesExternos.mesDeAplicacion, mes), isNull(importesExternos.anuladoEn)))
      .orderBy(asc(importesExternos.dni), asc(importesExternos.fechaDelHecho), asc(importesExternos.registradoEn));
    return filas.map(aImporte);
  }

  async listarAbonosVacacionales(): Promise<ImporteExterno[]> {
    const filas = await this.consultar().where(and(eq(importesExternos.tipoDeFuente, "abonos_vacacionales"), isNull(importesExternos.anuladoEn)))
      .orderBy(asc(importesExternos.dni), asc(importesExternos.fechaDelHecho), asc(importesExternos.registradoEn));
    return filas.map(aImporte);
  }

  async listarConfirmacionesDelMes(mes: string): Promise<ConfirmacionDeFuente[]> {
    return this.confirmaciones().where(eq(confirmacionesDeFuente.mesDeAplicacion, mes));
  }

  async ejecutarSobreFuente<T>(tipo: CodigoDeTipoDeFuente, mes: string, operacion: (almacen: AlmacenDeFuentesExternas) => Promise<T>): Promise<T> {
    return this.raiz.transaction(async (tx) => {
      // Candado de aviso por fuente y mes, liberado al terminar la transacción: serializa cargas, anulaciones y confirmaciones.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`fuentes_externas:${tipo}:${mes}`}, 0))`);
      return operacion(new AlmacenPostgresDeFuentesExternas(tx));
    });
  }
}
