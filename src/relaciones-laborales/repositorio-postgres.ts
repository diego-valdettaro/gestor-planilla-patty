import { and, asc, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { colaboradores, relacionesLaborales } from "@/db/schema";
import { bloquearPeriodos, invalidarAprobacionesDeAsistencia, SIN_FIN } from "@/periodos/aprobaciones";

import type { AlmacenDeRelaciones, RelacionConPersona, RepositorioDeRelacionesLaborales } from "./gestionar-relaciones-laborales";
import { vigenciasConfirmadas, type RelacionLaboral, type Vigencia } from "./vigencia";

type Db = Pick<NodePgDatabase<typeof schema>, "select" | "selectDistinct" | "insert" | "update">;

const columnas = {
  id: relacionesLaborales.id,
  dni: relacionesLaborales.dni,
  ingreso: relacionesLaborales.ingreso,
  cese: relacionesLaborales.cese,
  ingresoConfirmadoEn: relacionesLaborales.ingresoConfirmadoEn,
  ceseConfirmadoEn: relacionesLaborales.ceseConfirmadoEn,
};

type Fila = { id: string; dni: string; ingreso: string; cese: string | null; ingresoConfirmadoEn: Date | null; ceseConfirmadoEn: Date | null };

function aRelacion(fila: Fila): RelacionLaboral {
  return { id: fila.id, dni: fila.dni, ingreso: fila.ingreso, cese: fila.cese, ingresoConfirmado: fila.ingresoConfirmadoEn !== null, ceseConfirmado: fila.ceseConfirmadoEn !== null };
}

class AlmacenPostgresDeRelaciones implements AlmacenDeRelaciones {
  constructor(protected readonly db: Db) {}

  async listarDelColaborador(dni: string): Promise<RelacionLaboral[]> {
    const filas = await this.db.select(columnas).from(relacionesLaborales).where(eq(relacionesLaborales.dni, dni)).orderBy(asc(relacionesLaborales.ingreso));
    return filas.map(aRelacion);
  }

  async buscar(id: string): Promise<RelacionLaboral | undefined> {
    const [fila] = await this.db.select(columnas).from(relacionesLaborales).where(eq(relacionesLaborales.id, id));
    return fila && aRelacion(fila);
  }

  async insertar({ dni, ingreso, responsableId }: { dni: string; ingreso: string; responsableId: string }): Promise<RelacionLaboral> {
    const [fila] = await this.db.insert(relacionesLaborales).values({ dni, ingreso, registradaPorId: responsableId }).returning(columnas);
    return aRelacion(fila);
  }

  async actualizarIngreso(id: string, ingreso: string): Promise<void> {
    await this.db.update(relacionesLaborales).set({ ingreso }).where(eq(relacionesLaborales.id, id));
  }

  async confirmarIngreso(id: string, responsableId: string, confirmadoEn: Date): Promise<void> {
    const [relacion] = await this.db.update(relacionesLaborales).set({ ingresoConfirmadoPorId: responsableId, ingresoConfirmadoEn: confirmadoEn })
      .where(eq(relacionesLaborales.id, id)).returning({ dni: relacionesLaborales.dni, ingreso: relacionesLaborales.ingreso, cese: relacionesLaborales.cese });
    await this.invalidarAprobaciones(relacion, "Se confirmó un ingreso");
  }

  async actualizarCese(id: string, cese: string): Promise<void> {
    await this.db.update(relacionesLaborales).set({ cese }).where(eq(relacionesLaborales.id, id));
  }

  async confirmarCese(id: string, responsableId: string, confirmadoEn: Date): Promise<void> {
    const [relacion] = await this.db.update(relacionesLaborales).set({ ceseConfirmadoPorId: responsableId, ceseConfirmadoEn: confirmadoEn })
      .where(eq(relacionesLaborales.id, id)).returning({ dni: relacionesLaborales.dni, ingreso: relacionesLaborales.ingreso, cese: relacionesLaborales.cese });
    await this.invalidarAprobaciones(relacion, "Se confirmó un cese");
  }

  /** Confirmar un ingreso o un cese cambia quién entra en la población del grupo: invalida su aprobación (ADR 0012). */
  private async invalidarAprobaciones(relacion: { dni: string; ingreso: string; cese: string | null } | undefined, motivo: string): Promise<void> {
    if (!relacion) return;
    await invalidarAprobacionesDeAsistencia(this.db, { dnis: [relacion.dni], desde: relacion.ingreso, hasta: relacion.cese ?? SIN_FIN, motivo: `${motivo} de la relación laboral de ${relacion.dni}.` });
  }
}

/** Relaciones confirmadas de una persona como intervalos; las usan la publicación de horarios (también dentro de su transacción) y Pagos. */
export async function vigenciasConfirmadasDe(db: Pick<NodePgDatabase<typeof schema>, "select">, dni: string): Promise<Vigencia[]> {
  const filas = await db.select(columnas).from(relacionesLaborales).where(eq(relacionesLaborales.dni, dni));
  return vigenciasConfirmadas(filas.map(aRelacion));
}

export class RepositorioPostgresDeRelacionesLaborales extends AlmacenPostgresDeRelaciones implements RepositorioDeRelacionesLaborales {
  constructor(private readonly raiz: NodePgDatabase<typeof schema>) {
    super(raiz);
  }

  async buscarColaborador(dni: string) {
    const [colaborador] = await this.raiz.select({ dni: colaboradores.dni, nombre: colaboradores.nombre, grupo: colaboradores.grupo }).from(colaboradores).where(eq(colaboradores.dni, dni));
    return colaborador;
  }

  async listarConPersona(): Promise<RelacionConPersona[]> {
    const filas = await this.raiz.select({ ...columnas, nombre: colaboradores.nombre, grupo: colaboradores.grupo })
      .from(relacionesLaborales)
      .innerJoin(colaboradores, eq(colaboradores.dni, relacionesLaborales.dni))
      .orderBy(asc(colaboradores.nombre), desc(relacionesLaborales.ingreso));
    return filas.map((fila) => ({ ...aRelacion(fila), nombre: fila.nombre, grupo: fila.grupo }));
  }

  async ejecutarSobreColaborador<T>(dni: string, operacion: (almacen: AlmacenDeRelaciones) => Promise<T>): Promise<T> {
    return this.raiz.transaction(async (tx) => {
      await bloquearPeriodos(tx);
      await tx.select({ id: colaboradores.id }).from(colaboradores).where(and(eq(colaboradores.dni, dni))).for("update");
      return operacion(new AlmacenPostgresDeRelaciones(tx));
    });
  }
}
