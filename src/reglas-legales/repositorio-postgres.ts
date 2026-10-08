import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { cuentasLocales, reglasLegales } from "@/db/schema";

import { buscarDefinicion, type CodigoDeReglaLegal } from "./catalogo";
import type { AlmacenDeReglasLegales, NuevaReglaLegal, RepositorioDeReglasLegales, VersionFinalizada } from "./gestionar-reglas-legales";
import type { ReglaLegal } from "./vigencia";

type Db = Pick<NodePgDatabase<typeof schema>, "select" | "insert" | "update">;

const columnas = {
  id: reglasLegales.id,
  codigo: reglasLegales.codigo,
  tasa: reglasLegales.tasaCentesimasDePunto,
  importe: reglasLegales.importeCentimos,
  vigenteDesde: reglasLegales.vigenteDesde,
  fuenteOficial: reglasLegales.fuenteOficial,
  activadaPorId: reglasLegales.activadaPorId,
  activadaPor: cuentasLocales.nombreUsuario,
  activadaEn: reglasLegales.activadaEn,
  reemplazadaEn: reglasLegales.reemplazadaEn,
  motivoDeReemplazo: reglasLegales.motivoDeReemplazo,
};

type Fila = {
  id: string; codigo: string; tasa: number | null; importe: number | null; vigenteDesde: string; fuenteOficial: string;
  activadaPorId: string; activadaPor: string; activadaEn: Date; reemplazadaEn: Date | null; motivoDeReemplazo: string | null;
};

function aRegla(fila: Fila): ReglaLegal {
  const valor = fila.tasa ?? fila.importe;
  if (valor === null) throw new Error(`La regla ${fila.id} no tiene valor.`);
  return {
    id: fila.id, codigo: fila.codigo as CodigoDeReglaLegal, valor, vigenteDesde: fila.vigenteDesde, fuenteOficial: fila.fuenteOficial,
    activadaPorId: fila.activadaPorId, activadaPor: fila.activadaPor, activadaEn: fila.activadaEn,
    reemplazadaEn: fila.reemplazadaEn, motivoDeReemplazo: fila.motivoDeReemplazo,
  };
}

/** La unidad del código decide en qué columna se guarda el valor; la base garantiza que solo esa columna esté llena. */
function columnasDelValor(codigo: CodigoDeReglaLegal, valor: number) {
  const unidad = buscarDefinicion(codigo)?.unidad;
  if (!unidad) throw new Error(`El código ${codigo} no está en el catálogo de reglas legales.`);
  return unidad === "porcentaje" ? { tasaCentesimasDePunto: valor } : { importeCentimos: valor };
}

class AlmacenPostgresDeReglasLegales implements AlmacenDeReglasLegales {
  constructor(protected readonly db: Db) {}

  protected consultar() {
    return this.db.select(columnas).from(reglasLegales).innerJoin(cuentasLocales, eq(cuentasLocales.id, reglasLegales.activadaPorId));
  }

  async listar(codigo: CodigoDeReglaLegal): Promise<ReglaLegal[]> {
    const filas = await this.consultar().where(eq(reglasLegales.codigo, codigo)).orderBy(asc(reglasLegales.vigenteDesde), asc(reglasLegales.activadaEn));
    return filas.map(aRegla);
  }

  async buscar(id: string): Promise<ReglaLegal | undefined> {
    const [fila] = await this.consultar().where(eq(reglasLegales.id, id));
    return fila && aRegla(fila);
  }

  async insertar({ codigo, valor, vigenteDesde, fuenteOficial, responsableId }: NuevaReglaLegal): Promise<ReglaLegal | undefined> {
    const [insertada] = await this.db.insert(reglasLegales)
      .values({ codigo, vigenteDesde, fuenteOficial, activadaPorId: responsableId, ...columnasDelValor(codigo, valor) })
      .onConflictDoNothing().returning({ id: reglasLegales.id });
    return insertada && this.buscar(insertada.id);
  }

  async reemplazar(id: string, motivo: string, reemplazadaEn: Date): Promise<boolean> {
    const filas = await this.db.update(reglasLegales).set({ reemplazadaEn, motivoDeReemplazo: motivo })
      .where(and(eq(reglasLegales.id, id), isNull(reglasLegales.reemplazadaEn))).returning({ id: reglasLegales.id });
    return filas.length > 0;
  }
}

export class RepositorioPostgresDeReglasLegales extends AlmacenPostgresDeReglasLegales implements RepositorioDeReglasLegales {
  constructor(private readonly raiz: NodePgDatabase<typeof schema>) {
    super(raiz);
  }

  async listarTodas(): Promise<ReglaLegal[]> {
    return (await this.consultar().orderBy(asc(reglasLegales.vigenteDesde), asc(reglasLegales.activadaEn))).map(aRegla);
  }

  // Pagos todavía no finaliza versiones; el ticket de finalización debe consultar aquí qué versiones aplicaron la regla.
  async versionesFinalizadasQueUsan(_reglaId: string): Promise<VersionFinalizada[]> {
    return [];
  }

  async ejecutarSobreCodigo<T>(codigo: CodigoDeReglaLegal, operacion: (almacen: AlmacenDeReglasLegales) => Promise<T>): Promise<T> {
    return this.raiz.transaction(async (tx) => {
      // Candado de aviso por código, liberado al terminar la transacción: serializa activaciones y correcciones del mismo valor.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`reglas_legales:${codigo}`}, 0))`);
      return operacion(new AlmacenPostgresDeReglasLegales(tx));
    });
  }
}
