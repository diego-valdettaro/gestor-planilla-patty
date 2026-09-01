import { and, eq, gte, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import {
  asistenciasEsperadas,
  colaboradores,
  importacionesSemanales,
  incidenciasDeImportacion,
  marcasCrudas,
  periodosPlanilla,
  turnosPublicados,
} from "@/db/schema";

import type { ImportacionSemanal, RepositorioDeImportaciones } from "./importar-semana-por-sede";

export class RepositorioPostgresDeImportaciones implements RepositorioDeImportaciones {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async buscarColaborador(idHuellero: string): Promise<{ idHuellero: string; sede: string } | undefined> {
    const [colaborador] = await this.db.select({ idHuellero: colaboradores.idHuellero, sede: colaboradores.sede })
      .from(colaboradores).where(eq(colaboradores.idHuellero, idHuellero));
    return colaborador;
  }

  async buscarTurnoPublicado(idHuellero: string, fecha: string): Promise<{ idHuellero: string; fecha: string } | undefined> {
    const [turno] = await this.db.select({ idHuellero: turnosPublicados.idHuellero, fecha: turnosPublicados.fecha })
      .from(turnosPublicados).where(and(eq(turnosPublicados.idHuellero, idHuellero), eq(turnosPublicados.fecha, fecha)));
    return turno;
  }

  async perteneceAPeriodoAbierto(fecha: string): Promise<boolean> {
    const [periodo] = await this.db.select({ id: periodosPlanilla.id }).from(periodosPlanilla)
      .where(and(eq(periodosPlanilla.estado, "abierto"), lte(periodosPlanilla.inicio, fecha), gte(periodosPlanilla.fin, fecha)));
    return Boolean(periodo);
  }

  async guardar(importacion: ImportacionSemanal): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [guardada] = await tx.insert(importacionesSemanales).values({
        sede: importacion.sede, semana: importacion.semana, archivoNombre: importacion.archivo.nombre,
        archivoUbicacion: importacion.archivo.ubicacion, archivoHashSha256: importacion.archivo.hashSha256,
        usuarioId: importacion.usuarioId, importadaEn: importacion.importadaEn,
      }).returning({ id: importacionesSemanales.id });
      if (importacion.marcasCrudas.length) {
        await tx.insert(marcasCrudas).values(importacion.marcasCrudas.map((marca) => ({ ...marca, importacionId: guardada.id })));
      }
      if (importacion.incidencias.length) {
        await tx.insert(incidenciasDeImportacion).values(importacion.incidencias.map((incidencia) => ({ ...incidencia, importacionId: guardada.id })));
      }
      for (const propuesta of importacion.propuestas) {
        await tx.insert(asistenciasEsperadas).values(propuesta).onConflictDoUpdate({
          target: [asistenciasEsperadas.idHuellero, asistenciasEsperadas.fecha],
          set: { entradaPropuesta: propuesta.entradaPropuesta ?? null, salidaPropuesta: propuesta.salidaPropuesta ?? null },
          where: eq(asistenciasEsperadas.estado, "pendiente"),
        });
      }
    });
  }
}
