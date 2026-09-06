import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { auditoriaDeModelosDeHorario, celdasDePlanesSemanalesEnBorrador, modelosDeHorario, turnosPublicados } from "@/db/schema";

import type { ModeloDeHorario, RepositorioDeModelosDeHorario } from "./gestionar-modelos-de-horario";

export class RepositorioPostgresDeModelosDeHorario implements RepositorioDeModelosDeHorario {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async guardar(modelo: ModeloDeHorario, responsableId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [anterior] = await tx.select({ activo: modelosDeHorario.activo }).from(modelosDeHorario)
        .where(eq(modelosDeHorario.id, modelo.id));
      await tx.insert(modelosDeHorario).values(modelo).onConflictDoUpdate({
        target: modelosDeHorario.id,
        set: {
          sede: modelo.sede,
          nombre: modelo.nombre,
          entrada: modelo.entrada,
          salida: modelo.salida,
          activo: modelo.activo,
          actualizadoEn: new Date(),
        },
      });
      await tx.insert(auditoriaDeModelosDeHorario).values({
        modeloId: modelo.id,
        accion: !anterior ? "creacion" : modelo.activo === anterior.activo ? "edicion" : modelo.activo ? "activacion" : "desactivacion",
        modelo: sinId(modelo),
        responsableId,
      });
    });
  }

  async buscarPorId(id: string): Promise<ModeloDeHorario | undefined> {
    const [modelo] = await this.db.select({
      id: modelosDeHorario.id,
      sede: modelosDeHorario.sede,
      nombre: modelosDeHorario.nombre,
      entrada: modelosDeHorario.entrada,
      salida: modelosDeHorario.salida,
      activo: modelosDeHorario.activo,
    }).from(modelosDeHorario).where(eq(modelosDeHorario.id, id));
    return modelo;
  }

  async eliminar(id: string, responsableId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [modelo] = await tx.select().from(modelosDeHorario).where(eq(modelosDeHorario.id, id));
      if (!modelo) return;
      await tx.insert(auditoriaDeModelosDeHorario).values({
        modeloId: modelo.id,
        accion: "eliminacion",
        modelo: sinId(modelo),
        responsableId,
      });
      await tx.delete(modelosDeHorario).where(eq(modelosDeHorario.id, id));
    });
  }

  async tieneUso(id: string): Promise<boolean> {
    const [turno, celda] = await Promise.all([
      this.db.select({ id: turnosPublicados.id }).from(turnosPublicados)
        .where(eq(turnosPublicados.modeloHorarioId, id)).limit(1),
      this.db.select({ id: celdasDePlanesSemanalesEnBorrador.id }).from(celdasDePlanesSemanalesEnBorrador)
        .where(eq(celdasDePlanesSemanalesEnBorrador.modeloHorarioId, id)).limit(1),
    ]);
    return Boolean(turno || celda);
  }

  async listarPorSede(sede: string): Promise<ModeloDeHorario[]> {
    return this.db.select({
      id: modelosDeHorario.id,
      sede: modelosDeHorario.sede,
      nombre: modelosDeHorario.nombre,
      entrada: modelosDeHorario.entrada,
      salida: modelosDeHorario.salida,
      activo: modelosDeHorario.activo,
    }).from(modelosDeHorario).where(eq(modelosDeHorario.sede, sede)).orderBy(modelosDeHorario.nombre);
  }

}

function sinId(modelo: ModeloDeHorario): Omit<ModeloDeHorario, "id"> {
  const { id: _, ...sinId } = modelo;
  return sinId;
}
