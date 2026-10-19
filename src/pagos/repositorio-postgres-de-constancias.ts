import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { constanciasDePago, cuentasLocales, periodosPlanilla, versionesDePago } from "@/db/schema";
import type * as schema from "@/db/schema";

import { ErrorDeMesYaConfirmado, ErrorDePeriodoFuenteReabierto, ErrorDeVersionNoFinalizada, type ConstanciaDePago, type NuevaConstanciaDePago, type RepositorioDeConstancias } from "./constancias-de-pago";

// Adaptador PostgreSQL del puerto de constancias (#130, ADR 0013): una constancia por mes (índice único de la migración 0042).

type Db = NodePgDatabase<typeof schema>;

/** Código SQLSTATE del error de PostgreSQL, que Drizzle envuelve como causa del error de la consulta. */
function codigoDeError(error: unknown): string | undefined {
  const candidato = error as { code?: unknown; cause?: { code?: unknown } } | null;
  const codigo = candidato?.code ?? candidato?.cause?.code;
  return typeof codigo === "string" ? codigo : undefined;
}

/** Serializa, hasta el final de la transacción, quien confirma el pago de un mes y quien le agrega una versión. */
export async function bloquearPagoDelMes(tx: Pick<Db, "execute">, mes: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`pago-del-mes:${mes}`}, 0))`);
}

/**
 * Toma el bloqueo de los períodos de la versión pagada (el mismo FOR UPDATE de `reabrir`, #114) y exige que sigan cerrados: así confirmar el pago
 * y reabrir uno de esos períodos se serializan; gana uno y el otro se rechaza (P7, ADR 0013).
 */
async function exigirPeriodosFuenteCerrados(tx: Pick<Db, "select">, nueva: NuevaConstanciaDePago): Promise<void> {
  const [version] = await tx.select({ revisiones: versionesDePago.revisiones }).from(versionesDePago)
    .where(and(eq(versionesDePago.mesDePago, nueva.mesDePago), eq(versionesDePago.numero, nueva.numeroDeVersion)));
  const periodoIds = ((version?.revisiones ?? []) as Array<{ periodoId: string }>).map(({ periodoId }) => periodoId);
  if (periodoIds.length === 0) return;
  const periodos = await tx.select({ estado: periodosPlanilla.estado }).from(periodosPlanilla)
    .where(inArray(periodosPlanilla.id, periodoIds)).orderBy(asc(periodosPlanilla.id)).for("update");
  if (periodos.some(({ estado }) => estado !== "cerrado")) throw new ErrorDePeriodoFuenteReabierto();
}

export class RepositorioPostgresDeConstancias implements RepositorioDeConstancias {
  constructor(private readonly db: Db) {}

  async confirmar(nueva: NuevaConstanciaDePago): Promise<ConstanciaDePago> {
    try {
      await this.db.transaction(async (tx) => {
        await bloquearPagoDelMes(tx, nueva.mesDePago);
        await exigirPeriodosFuenteCerrados(tx, nueva);
        await tx.insert(constanciasDePago).values(nueva);
      });
    } catch (error) {
      if (codigoDeError(error) === "23505") throw new ErrorDeMesYaConfirmado();
      if (codigoDeError(error) === "23503") throw new ErrorDeVersionNoFinalizada();
      throw error;
    }
    const guardada = await this.buscar(nueva.mesDePago);
    if (!guardada) throw new Error("La constancia guardada no se pudo leer.");
    return guardada;
  }

  async buscar(mes: string): Promise<ConstanciaDePago | undefined> {
    const [fila] = await this.db.select({
      mesDePago: constanciasDePago.mesDePago, numeroDeVersion: constanciasDePago.numeroDeVersion, fechaDelPago: constanciasDePago.fechaDelPago,
      confirmadaPorId: constanciasDePago.confirmadaPorId, confirmadaPor: cuentasLocales.nombreUsuario, confirmadaEn: constanciasDePago.confirmadaEn,
    }).from(constanciasDePago).innerJoin(cuentasLocales, eq(cuentasLocales.id, constanciasDePago.confirmadaPorId)).where(eq(constanciasDePago.mesDePago, mes));
    return fila;
  }

  async mesConPagoConfirmado(mes: string): Promise<boolean> {
    return (await this.buscar(mes)) !== undefined;
  }
}
