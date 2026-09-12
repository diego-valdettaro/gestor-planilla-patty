import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { celdasDePlanesSemanalesEnBorrador, colaboradores, planesSemanalesEnBorrador } from "@/db/schema";

import type { RepositorioParaCambiarGrupo } from "./cambiar-grupo";
import type { Colaborador } from "./registrar-colaborador";

export class RepositorioPostgresDeColaboradores
  implements RepositorioParaCambiarGrupo
{
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async buscarPorIdHuellero(idHuellero: string): Promise<Colaborador | undefined> {
    const [colaborador] = await this.db
      .select({
        idHuellero: colaboradores.idHuellero,
        nombre: colaboradores.nombre,
        sede: colaboradores.sede,
        grupo: colaboradores.grupo,
        activo: colaboradores.activo,
      })
      .from(colaboradores)
      .where(eq(colaboradores.idHuellero, idHuellero));

    return colaborador;
  }

  async guardar(colaborador: Colaborador): Promise<void> {
    await this.db.insert(colaboradores).values(colaborador);
  }

  async actualizar(colaborador: Colaborador): Promise<void> {
    await this.db
      .update(colaboradores)
      .set({
        nombre: colaborador.nombre,
        sede: colaborador.sede,
        grupo: colaborador.grupo,
        activo: colaborador.activo,
        actualizadoEn: new Date(),
      })
      .where(eq(colaboradores.idHuellero, colaborador.idHuellero));
  }

  async listar(): Promise<Colaborador[]> {
    return this.db.select({
      idHuellero: colaboradores.idHuellero,
      nombre: colaboradores.nombre,
      sede: colaboradores.sede,
      grupo: colaboradores.grupo,
      activo: colaboradores.activo,
    }).from(colaboradores).orderBy(colaboradores.nombre);
  }

  async tieneBorradorAbiertoEnGrupo(idHuellero: string, grupo: string): Promise<boolean> {
    const [celda] = await this.db
      .select({ id: celdasDePlanesSemanalesEnBorrador.id })
      .from(celdasDePlanesSemanalesEnBorrador)
      .innerJoin(planesSemanalesEnBorrador, eq(celdasDePlanesSemanalesEnBorrador.planId, planesSemanalesEnBorrador.id))
      .where(and(
        eq(celdasDePlanesSemanalesEnBorrador.idHuellero, idHuellero),
        eq(planesSemanalesEnBorrador.equipo, grupo),
      ));
    return Boolean(celda);
  }

}
