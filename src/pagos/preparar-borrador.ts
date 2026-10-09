import type { RepositorioDeRelacionesLaborales } from "@/relaciones-laborales/gestionar-relaciones-laborales";
import type { RepositorioDeCondicionesLaborales } from "@/condiciones-laborales/gestionar-condiciones-laborales";
import type { RepositorioDeReglasLegales } from "@/reglas-legales/gestionar-reglas-legales";
import type { RepositorioDeFuentesExternas } from "@/fuentes-externas/gestionar-fuentes-externas";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";
import { corteDeIncidencias, obtenerHechosDelCorte, type LectorDeHechosDeAsistencia } from "@/periodos/hechos-para-pagos";

import { calcularBorrador } from "./calcular-borrador";

export interface FuentesDelBorrador {
  relaciones: Pick<RepositorioDeRelacionesLaborales, "listarConPersona">;
  condiciones: Pick<RepositorioDeCondicionesLaborales, "listarTodas">;
  reglas: Pick<RepositorioDeReglasLegales, "listarTodas">;
  asistencia: LectorDeHechosDeAsistencia;
  externas: Pick<RepositorioDeFuentesExternas, "listarImportesDelMes" | "listarConfirmacionesDelMes">;
}

/** Reúne todas las fuentes antes de entrar al cálculo puro. */
export async function prepararBorrador(fuentes: FuentesDelBorrador, mesDePago: string) {
  const corte = corteDeIncidencias(mesDePago);
  const [relaciones, condiciones, reglas, hechos, importes, confirmaciones] = await Promise.all([
    fuentes.relaciones.listarConPersona(), fuentes.condiciones.listarTodas(), fuentes.reglas.listarTodas(),
    obtenerHechosDelCorte(fuentes.asistencia, corte), fuentes.externas.listarImportesDelMes(mesDePago),
    fuentes.externas.listarConfirmacionesDelMes(mesDePago),
  ]);
  const confirmados = new Set(confirmaciones.map(({ tipoDeFuente }) => tipoDeFuente));
  const borrador = calcularBorrador({
    mesDePago, corte, relaciones, condiciones: condiciones.filter((dato) => dato.reemplazadaEn === null),
    reglas: reglas.filter((regla) => regla.reemplazadaEn === null),
    problemasDelCorte: hechos.problemas.map(({ mensaje }) => mensaje), revisiones: hechos.revisiones,
    hechosPorDni: hechos.hechosPorDni, importes,
    fuentesPendientes: TIPOS_DE_FUENTE.filter((tipo) => !confirmados.has(tipo.codigo)).map((tipo) => tipo.nombre),
  });
  return { ...borrador, fuentes: TIPOS_DE_FUENTE.map((tipo) => ({
    codigo: tipo.codigo, nombre: tipo.nombre,
    estado: confirmados.has(tipo.codigo) ? "Confirmada" : "Pendiente",
    filas: importes.filter((importe) => importe.tipoDeFuente === tipo.codigo).length,
  })) };
}

/** La lista nace de los ingresos confirmados; el último mes es el actual en Lima. */
export async function listarMesesDePago(fuentes: FuentesDelBorrador, hoy: string): Promise<string[]> {
  const relaciones = (await fuentes.relaciones.listarConPersona()).filter((relacion) => relacion.ingresoConfirmado);
  if (!relaciones.length) return [];
  const primero = relaciones.map((relacion) => relacion.ingreso.slice(0, 7)).sort()[0];
  const ultimo = hoy.slice(0, 7);
  const meses: string[] = [];
  let cursor = primero;
  while (cursor <= ultimo) {
    meses.push(cursor);
    const [anio, mes] = cursor.split("-").map(Number);
    cursor = new Date(Date.UTC(anio, mes, 1)).toISOString().slice(0, 7);
  }
  return meses.reverse();
}
