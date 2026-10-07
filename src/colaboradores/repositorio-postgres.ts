import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { bloquearPeriodos, invalidarAprobacionesDeAsistencia, SIN_FIN, SIN_INICIO } from "@/periodos/aprobaciones";
import { celdasDePlanesSemanalesEnBorrador, colaboradores, planesSemanalesEnBorrador } from "@/db/schema";

import type { RepositorioParaCambiarGrupo } from "./cambiar-grupo";
import type { Colaborador } from "./registrar-colaborador";

export class RepositorioPostgresDeColaboradores
  implements RepositorioParaCambiarGrupo
{
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async buscarPorDni(dni: string): Promise<Colaborador | undefined> {
    const [colaborador] = await this.db
      .select({
        dni: colaboradores.dni,
        nombre: colaboradores.nombre,
        sede: colaboradores.sede,
        grupo: colaboradores.grupo,
        activo: colaboradores.activo,
      })
      .from(colaboradores)
      .where(eq(colaboradores.dni, dni));

    return colaborador;
  }

  async guardar(colaborador: Colaborador): Promise<void> {
    await this.db.insert(colaboradores).values(colaborador);
  }

  async actualizar(colaborador: Colaborador): Promise<void> {
    await this.db.transaction(async (tx) => {
      const grupoActual = async () => (await tx.select({ grupo: colaboradores.grupo }).from(colaboradores).where(eq(colaboradores.dni, colaborador.dni)))[0]?.grupo;
      let anterior = await grupoActual();
      const invalidar = (motivo: string) => invalidarAprobacionesDeAsistencia(tx, { dnis: [colaborador.dni], desde: SIN_INICIO, hasta: SIN_FIN, motivo, soloAbiertos: true });
      if (anterior !== undefined && anterior !== colaborador.grupo) {
        // Cambiar de grupo mueve a la persona entre poblaciones: invalida la aprobación de asistencia del grupo que deja y del que recibe (ADR 0012).
        // Orden de bloqueos período → persona; se vuelve a leer el grupo bajo bloqueo por si otro cambio lo movió antes.
        await bloquearPeriodos(tx);
        await tx.select({ id: colaboradores.id }).from(colaboradores).where(eq(colaboradores.dni, colaborador.dni)).for("update");
        anterior = await grupoActual();
        if (anterior !== undefined && anterior !== colaborador.grupo) await invalidar(`${colaborador.dni} dejó el grupo ${anterior}.`);
      }
      const cambioDeGrupo = anterior !== undefined && anterior !== colaborador.grupo;
      await tx
        .update(colaboradores)
        .set({
          nombre: colaborador.nombre,
          sede: colaborador.sede,
          grupo: colaborador.grupo,
          activo: colaborador.activo,
          actualizadoEn: new Date(),
        })
        .where(eq(colaboradores.dni, colaborador.dni));
      if (cambioDeGrupo) await invalidar(`${colaborador.dni} entró al grupo ${colaborador.grupo}.`);
    });
  }

  async listar(): Promise<Colaborador[]> {
    return this.db.select({
      dni: colaboradores.dni,
      nombre: colaboradores.nombre,
      sede: colaboradores.sede,
      grupo: colaboradores.grupo,
      activo: colaboradores.activo,
    }).from(colaboradores).orderBy(colaboradores.nombre);
  }

  async tieneBorradorAbiertoEnGrupo(dni: string, grupo: string): Promise<boolean> {
    const [celda] = await this.db
      .select({ id: celdasDePlanesSemanalesEnBorrador.id })
      .from(celdasDePlanesSemanalesEnBorrador)
      .innerJoin(planesSemanalesEnBorrador, eq(celdasDePlanesSemanalesEnBorrador.planId, planesSemanalesEnBorrador.id))
      .where(and(
        eq(celdasDePlanesSemanalesEnBorrador.dni, dni),
        eq(planesSemanalesEnBorrador.equipo, grupo),
      ));
    return Boolean(celda);
  }

}
