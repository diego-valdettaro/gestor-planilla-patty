import * as XLSX from "xlsx";

import type { MarcaCruda } from "./importar-semana-por-sede";

export async function parsearArchivoHuellero(archivo: File): Promise<MarcaCruda[]> {
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array", cellDates: true });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  if (!hoja) throw new Error("El archivo fuente no contiene una hoja.");
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "" });

  return filas.map((fila, indice) => {
    const valores = Object.fromEntries(Object.entries(fila).map(([clave, valor]) => [normalizarClave(clave), valor]));
    const idHuellero = texto(valores, ["idhuellero", "id", "codigo", "codigoempleado"]);
    const fecha = fechaIso(valores.fecha);
    const instante = instanteIso(valores, fecha);
    if (!idHuellero || !fecha || !instante) {
      throw new Error(`La fila ${indice + 2} debe incluir ID de huellero, fecha y marca.`);
    }
    return { idHuellero, fecha, instante };
  });
}

function normalizarClave(valor: string): string {
  return valor.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function texto(valores: Record<string, unknown>, claves: string[]): string | undefined {
  const valor = claves.map((clave) => valores[clave]).find((candidato) => candidato !== undefined && candidato !== "");
  return typeof valor === "string" || typeof valor === "number" ? String(valor).trim() : undefined;
}

function fechaIso(valor: unknown): string | undefined {
  if (valor instanceof Date && !Number.isNaN(valor.valueOf())) return valor.toISOString().slice(0, 10);
  if (typeof valor !== "string") return undefined;
  const coincidencia = valor.match(/^(\d{4}-\d{2}-\d{2})/);
  return coincidencia?.[1];
}

function instanteIso(valores: Record<string, unknown>, fecha: string | undefined): string | undefined {
  const marca = valores.marca ?? valores.fechahora ?? valores.instante;
  if (marca instanceof Date && !Number.isNaN(marca.valueOf())) return marca.toISOString();
  if (typeof marca === "string" && /T/.test(marca)) return marca;
  const hora = typeof marca === "string" ? marca : valores.hora;
  if (!fecha || typeof hora !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(hora)) return undefined;
  return `${fecha}T${hora.length === 5 ? `${hora}:00` : hora}-05:00`;
}
