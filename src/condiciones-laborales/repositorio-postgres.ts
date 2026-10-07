import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { colaboradores, condicionesLaborales, cuentasLocales, relacionesLaborales, sedes } from "@/db/schema";

import type { DatoLaboral, ValorLaboral } from "./catalogo";
import type { AlmacenDeCondiciones, NuevaCondicion, RelacionParaCondiciones, RepositorioDeCondicionesLaborales, VersionFinalizada } from "./gestionar-condiciones-laborales";
import type { CondicionLaboral } from "./vigencia";

type Db = Pick<NodePgDatabase<typeof schema>, "select" | "insert" | "update">;

const columnas = {
  id: condicionesLaborales.id,
  relacionId: condicionesLaborales.relacionLaboralId,
  dato: condicionesLaborales.dato,
  sueldoCentimos: condicionesLaborales.sueldoCentimos,
  jornadaMinutos: condicionesLaborales.jornadaMinutos,
  regimen: condicionesLaborales.regimen,
  afiliacionPensionaria: condicionesLaborales.afiliacionPensionaria,
  comisionAfp: condicionesLaborales.comisionAfp,
  elegible: condicionesLaborales.elegibleAsignacionFamiliar,
  sede: condicionesLaborales.sedeDeAdscripcion,
  vigenteDesde: condicionesLaborales.vigenteDesde,
  registradaPorId: condicionesLaborales.registradoPorId,
  registradaPor: cuentasLocales.nombreUsuario,
  registradaEn: condicionesLaborales.registradoEn,
  reemplazadaEn: condicionesLaborales.reemplazadaEn,
  motivoDeReemplazo: condicionesLaborales.motivoDeReemplazo,
};

type Fila = {
  id: string; relacionId: string; dato: DatoLaboral;
  sueldoCentimos: number | null; jornadaMinutos: number | null; regimen: string | null; afiliacionPensionaria: string | null;
  comisionAfp: string | null; elegible: boolean | null; sede: string | null;
  vigenteDesde: string; registradaPorId: string; registradaPor: string; registradaEn: Date; reemplazadaEn: Date | null; motivoDeReemplazo: string | null;
};

/** Cada dato vive en su propia columna tipada; la base garantiza que solo esa columna esté llena. */
function valorDe(fila: Fila): ValorLaboral {
  const valor = {
    sueldo: fila.sueldoCentimos,
    jornada_ordinaria_diaria: fila.jornadaMinutos,
    regimen_laboral: fila.regimen,
    afiliacion_pensionaria: fila.afiliacionPensionaria,
    comision_afp: fila.comisionAfp,
    elegibilidad_familiar: fila.elegible,
    sede_de_adscripcion: fila.sede,
  }[fila.dato];
  if (valor === null || valor === undefined) throw new Error(`La condición ${fila.id} no tiene valor para ${fila.dato}.`);
  return valor;
}

function aCondicion(fila: Fila): CondicionLaboral {
  return {
    id: fila.id, relacionId: fila.relacionId, dato: fila.dato, valor: valorDe(fila), vigenteDesde: fila.vigenteDesde,
    registradaPorId: fila.registradaPorId, registradaPor: fila.registradaPor, registradaEn: fila.registradaEn,
    reemplazadaEn: fila.reemplazadaEn, motivoDeReemplazo: fila.motivoDeReemplazo,
  };
}

function columnasDelValor(dato: DatoLaboral, valor: ValorLaboral) {
  switch (dato) {
    case "sueldo": return { sueldoCentimos: Number(valor) };
    case "jornada_ordinaria_diaria": return { jornadaMinutos: Number(valor) };
    case "regimen_laboral": return { regimen: String(valor) as "general" | "remype_pequena_empresa" };
    case "afiliacion_pensionaria": return { afiliacionPensionaria: String(valor) as "onp" | "afp_habitat" | "afp_integra" | "afp_prima" | "afp_profuturo" };
    case "comision_afp": return { comisionAfp: String(valor) as "flujo" | "mixta" };
    case "elegibilidad_familiar": return { elegibleAsignacionFamiliar: Boolean(valor) };
    case "sede_de_adscripcion": return { sedeDeAdscripcion: String(valor) };
  }
}

class AlmacenPostgresDeCondiciones implements AlmacenDeCondiciones {
  constructor(protected readonly db: Db) {}

  protected consultar() {
    return this.db.select(columnas).from(condicionesLaborales).innerJoin(cuentasLocales, eq(cuentasLocales.id, condicionesLaborales.registradoPorId));
  }

  protected async relaciones(id?: string): Promise<RelacionParaCondiciones[]> {
    const confirmada = isNotNull(relacionesLaborales.ingresoConfirmadoEn);
    const filas = await this.db.select({
      id: relacionesLaborales.id, dni: relacionesLaborales.dni, nombre: colaboradores.nombre, grupo: colaboradores.grupo,
      ingreso: relacionesLaborales.ingreso, cese: relacionesLaborales.cese, ceseConfirmadoEn: relacionesLaborales.ceseConfirmadoEn,
    }).from(relacionesLaborales).innerJoin(colaboradores, eq(colaboradores.dni, relacionesLaborales.dni))
      .where(id ? and(confirmada, eq(relacionesLaborales.id, id)) : confirmada)
      .orderBy(asc(colaboradores.nombre), asc(relacionesLaborales.ingreso));
    // Un cese sin confirmar no cierra la relación (ADR 0012).
    return filas.map(({ ceseConfirmadoEn, cese, ...relacion }) => ({ ...relacion, cese: ceseConfirmadoEn ? cese : null }));
  }

  async buscarRelacion(id: string) {
    return (await this.relaciones(id))[0];
  }

  async buscarSede(nombre: string) {
    const [sede] = await this.db.select({ nombre: sedes.nombre, activa: sedes.activa }).from(sedes).where(eq(sedes.nombre, nombre));
    return sede;
  }

  async listar(relacionId: string): Promise<CondicionLaboral[]> {
    const filas = await this.consultar().where(eq(condicionesLaborales.relacionLaboralId, relacionId)).orderBy(asc(condicionesLaborales.vigenteDesde), asc(condicionesLaborales.registradoEn));
    return filas.map(aCondicion);
  }

  async buscar(id: string): Promise<CondicionLaboral | undefined> {
    const [fila] = await this.consultar().where(eq(condicionesLaborales.id, id));
    return fila && aCondicion(fila);
  }

  async insertar({ relacionId, dato, valor, vigenteDesde, responsableId }: NuevaCondicion): Promise<CondicionLaboral | undefined> {
    const [insertada] = await this.db.insert(condicionesLaborales)
      .values({ relacionLaboralId: relacionId, dato, vigenteDesde, registradoPorId: responsableId, ...columnasDelValor(dato, valor) })
      .onConflictDoNothing().returning({ id: condicionesLaborales.id });
    return insertada && this.buscar(insertada.id);
  }

  async reemplazar(id: string, motivo: string, reemplazadaEn: Date): Promise<boolean> {
    const filas = await this.db.update(condicionesLaborales).set({ reemplazadaEn, motivoDeReemplazo: motivo })
      .where(and(eq(condicionesLaborales.id, id), isNull(condicionesLaborales.reemplazadaEn))).returning({ id: condicionesLaborales.id });
    return filas.length > 0;
  }
}

export class RepositorioPostgresDeCondicionesLaborales extends AlmacenPostgresDeCondiciones implements RepositorioDeCondicionesLaborales {
  constructor(private readonly raiz: NodePgDatabase<typeof schema>) {
    super(raiz);
  }

  listarRelaciones() {
    return this.relaciones();
  }

  async listarTodas(): Promise<CondicionLaboral[]> {
    return (await this.consultar().orderBy(asc(condicionesLaborales.vigenteDesde), asc(condicionesLaborales.registradoEn))).map(aCondicion);
  }

  async listarSedesActivas(): Promise<string[]> {
    return (await this.raiz.select({ nombre: sedes.nombre }).from(sedes).where(eq(sedes.activa, true)).orderBy(asc(sedes.nombre))).map(({ nombre }) => nombre);
  }

  // Pagos todavía no finaliza versiones; el ticket de finalización debe consultar aquí qué versiones aplicaron la condición.
  async versionesFinalizadasQueUsan(_condicionId: string): Promise<VersionFinalizada[]> {
    return [];
  }

  async ejecutarSobreRelacion<T>(relacionId: string, operacion: (almacen: AlmacenDeCondiciones) => Promise<T>): Promise<T> {
    return this.raiz.transaction(async (tx) => {
      await tx.select({ id: relacionesLaborales.id }).from(relacionesLaborales).where(eq(relacionesLaborales.id, relacionId)).for("update");
      return operacion(new AlmacenPostgresDeCondiciones(tx));
    });
  }
}
