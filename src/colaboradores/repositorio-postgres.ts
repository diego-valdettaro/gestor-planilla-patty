import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { colaboradores } from "@/db/schema";

import type {
  Colaborador,
  RepositorioDeColaboradores,
} from "./registrar-colaborador";

export class RepositorioPostgresDeColaboradores
  implements RepositorioDeColaboradores
{
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async buscarPorIdHuellero(idHuellero: string): Promise<Colaborador | undefined> {
    const [colaborador] = await this.db
      .select({
        idHuellero: colaboradores.idHuellero,
        nombre: colaboradores.nombre,
        sede: colaboradores.sede,
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
      activo: colaboradores.activo,
    }).from(colaboradores).orderBy(colaboradores.nombre);
  }

}
