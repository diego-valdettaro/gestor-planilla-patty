import { createHash } from "node:crypto";

import { asc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { cuentasLocales, versionesDePago, versionesDePagoPersonas } from "@/db/schema";
import type * as schema from "@/db/schema";
import { corteDeIncidencias } from "@/periodos/hechos-para-pagos";

import type { BasesPorDevengue } from "./aportes-y-bases";
import type { LineaDeBorrador } from "./calcular-borrador";
import type { FuenteUsada, NuevaVersionDePago, PersonaDeVersion, ReglaUsada, RepositorioDeVersiones, RevisionUsada, VersionDePago } from "./finalizar-mes";

// Adaptador PostgreSQL del puerto de versiones (#129, ADR 0007 y 0014, P5): la cabecera lleva mes, número, actor, fecha, reglas,
// revisiones y fuentes; cada persona, su subtotal en céntimos con sus líneas y bases. Las versiones solo se agregan: nunca se reescriben.

type Db = NodePgDatabase<typeof schema>;

export class RepositorioPostgresDeVersiones implements RepositorioDeVersiones {
  constructor(private readonly db: Db) {}

  async guardarVersion(nueva: NuevaVersionDePago): Promise<VersionDePago> {
    // Todo o nada: si una fila no se puede escribir, la transacción deshace también la cabecera.
    const numero = await this.db.transaction(async (tx) => {
      const [{ ultimo }] = await tx.select({ ultimo: sql<number>`coalesce(max(${versionesDePago.numero}), 0)::int` }).from(versionesDePago)
        .where(eq(versionesDePago.mesDePago, nueva.mesDePago));
      const corte = corteDeIncidencias(nueva.mesDePago);
      const [cabecera] = await tx.insert(versionesDePago).values({
        mesDePago: nueva.mesDePago, numero: ultimo + 1, finalizadaPorId: nueva.finalizadaPorId, finalizadaEn: nueva.finalizadaEn, corteInicio: corte.inicio, corteFin: corte.fin,
        reglas: nueva.reglas, revisiones: nueva.revisiones, fuentes: nueva.fuentes, huella: huellaDelContenido(nueva),
      }).returning({ id: versionesDePago.id });
      await tx.insert(versionesDePagoPersonas).values(nueva.personas.map((persona) => ({
        versionId: cabecera.id, relacionId: persona.relacionId, dni: persona.dni, nombre: persona.nombre, subtotalCentimos: persona.subtotalCentimos,
        lineas: persona.lineas, bases: persona.bases,
      })));
      return ultimo + 1;
    });
    const guardada = await this.buscarVersion(nueva.mesDePago, numero);
    if (!guardada) throw new Error("La versión guardada no se pudo leer.");
    return guardada;
  }

  async listarVersiones(mes: string): Promise<VersionDePago[]> {
    return this.leer(eq(versionesDePago.mesDePago, mes));
  }

  async buscarVersion(mes: string, numero: number): Promise<VersionDePago | undefined> {
    return (await this.leer(sql`${versionesDePago.mesDePago} = ${mes} AND ${versionesDePago.numero} = ${numero}`))[0];
  }

  private async leer(condicion: ReturnType<typeof eq> | ReturnType<typeof sql>): Promise<VersionDePago[]> {
    const cabeceras = await this.db.select({
      id: versionesDePago.id, mesDePago: versionesDePago.mesDePago, numero: versionesDePago.numero, finalizadaPorId: versionesDePago.finalizadaPorId,
      finalizadaPor: cuentasLocales.nombreUsuario, finalizadaEn: versionesDePago.finalizadaEn, reglas: versionesDePago.reglas,
      revisiones: versionesDePago.revisiones, fuentes: versionesDePago.fuentes,
    }).from(versionesDePago).innerJoin(cuentasLocales, eq(cuentasLocales.id, versionesDePago.finalizadaPorId)).where(condicion).orderBy(asc(versionesDePago.numero));
    if (cabeceras.length === 0) return [];
    const filas = await this.db.select().from(versionesDePagoPersonas).where(inArray(versionesDePagoPersonas.versionId, cabeceras.map(({ id }) => id)))
      .orderBy(asc(versionesDePagoPersonas.nombre), asc(versionesDePagoPersonas.dni), asc(versionesDePagoPersonas.relacionId));
    return cabeceras.map((cabecera) => {
      const personas: PersonaDeVersion[] = filas.filter(({ versionId }) => versionId === cabecera.id).map((fila) => ({
        relacionId: fila.relacionId, dni: fila.dni, nombre: fila.nombre, subtotalCentimos: fila.subtotalCentimos,
        lineas: fila.lineas as LineaDeBorrador[], bases: fila.bases as BasesPorDevengue[],
      }));
      return {
        mesDePago: cabecera.mesDePago, numero: cabecera.numero, finalizadaPorId: cabecera.finalizadaPorId, finalizadaPor: cabecera.finalizadaPor, finalizadaEn: cabecera.finalizadaEn,
        reglas: cabecera.reglas as ReglaUsada[], revisiones: cabecera.revisiones as RevisionUsada[], fuentes: cabecera.fuentes as FuenteUsada[],
        subtotalCentimos: personas.reduce((suma, { subtotalCentimos }) => suma + subtotalCentimos, 0), personas,
      };
    });
  }
}

/** Resumen del contenido guardado (la columna `huella` de la cabecera); no es la huella de revisión de Finanzas. */
function huellaDelContenido(nueva: NuevaVersionDePago): string {
  return createHash("sha256").update(JSON.stringify(nueva)).digest("hex");
}
