import * as XLSX from "xlsx";

export interface ErrorDeImportacion {
  fila: number;
  idHuellero: string;
  fecha: string;
  motivo: string;
}

export interface FilaDeAsistenciaImportada {
  fila: number;
  idHuellero: string;
  sede: string;
  fecha: string;
  entrada: string;
  salida: string;
}

export interface ResultadoDelParser {
  filas: FilaDeAsistenciaImportada[];
  errores: ErrorDeImportacion[];
}

const encabezadosRequeridos = ["ID de huellero", "Sede", "Fecha", "Entrada", "Salida"] as const;

export async function parsearArchivoHuellero(archivo: File): Promise<ResultadoDelParser> {
  if (!archivo.name.toLowerCase().endsWith(".xlsx")) return resultadoConError("El archivo debe tener extensión .xlsx.");

  let libro: XLSX.WorkBook;
  try {
    libro = XLSX.read(await archivo.arrayBuffer(), { type: "array", cellDates: false });
  } catch {
    return resultadoConError("No se pudo leer el archivo XLSX.");
  }

  const hoja = libro.Sheets.Asistencias;
  if (!hoja) return resultadoConError('Falta la hoja obligatoria "Asistencias".');

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: "", raw: true });
  const encabezados = matriz[0]?.map(texto) ?? [];
  const columnas = encabezadosRequeridos.map((encabezado) => encabezados.indexOf(encabezado));
  const faltantes = encabezadosRequeridos.filter((_, indice) => columnas[indice] === -1);
  if (faltantes.length) {
    return { filas: [], errores: faltantes.map((encabezado) => errorEstructural(`Falta el encabezado obligatorio "${encabezado}".`)) };
  }

  const filas: FilaDeAsistenciaImportada[] = [];
  const errores: ErrorDeImportacion[] = [];
  const primerasFilasPorJornada = new Map<string, number>();
  for (const [indice, valores] of matriz.slice(1).entries()) {
    if (valores.every((valor) => texto(valor) === "")) continue;
    const fila = indice + 2;
    const idHuellero = texto(valores[columnas[0]]);
    const sede = texto(valores[columnas[1]]);
    const fechaOriginal = texto(valores[columnas[2]]);
    const entradaOriginal = texto(valores[columnas[3]]);
    const salidaOriginal = texto(valores[columnas[4]]);
    const fecha = fechaIso(valores[columnas[2]]);
    const entrada = horaIso(valores[columnas[3]]);
    const salida = horaIso(valores[columnas[4]]);
    const contexto = { fila, idHuellero, fecha: fecha ?? fechaOriginal };

    if (!idHuellero) errores.push({ ...contexto, motivo: "ID de huellero es obligatorio." });
    if (!sede) errores.push({ ...contexto, motivo: "Sede es obligatoria." });
    if (!fecha) errores.push({ ...contexto, motivo: fechaOriginal ? "Fecha debe ser una fecha Excel o usar YYYY-MM-DD." : "Fecha es obligatoria." });
    if (!entrada) errores.push({ ...contexto, motivo: entradaOriginal ? "Entrada debe ser una hora Excel o usar HH:MM." : "Entrada es obligatoria." });
    if (!salida) errores.push({ ...contexto, motivo: salidaOriginal ? "Salida debe ser una hora Excel o usar HH:MM." : "Salida es obligatoria." });
    if (idHuellero && fecha) {
      const clave = `${idHuellero}\u0000${fecha}`;
      const primeraFila = primerasFilasPorJornada.get(clave);
      if (primeraFila) errores.push({ ...contexto, fecha, motivo: `La jornada duplica la fila ${primeraFila}.` });
      else primerasFilasPorJornada.set(clave, fila);
    }
    if (!idHuellero || !sede || !fecha || !entrada || !salida) continue;

    filas.push({ fila, idHuellero, sede, fecha, entrada, salida });
  }
  if (!filas.length && !errores.length) errores.push(errorEstructural("El libro no tiene jornadas para importar."));
  return { filas, errores };
}

function resultadoConError(motivo: string): ResultadoDelParser {
  return { filas: [], errores: [errorEstructural(motivo)] };
}

function errorEstructural(motivo: string): ErrorDeImportacion {
  return { fila: 1, idHuellero: "", fecha: "", motivo };
}

function texto(valor: unknown): string {
  return typeof valor === "string" || typeof valor === "number" ? String(valor).trim() : "";
}

function fechaIso(valor: unknown): string | undefined {
  if (valor instanceof Date && !Number.isNaN(valor.valueOf())) return desdePartes(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate());
  if (typeof valor === "number") {
    const fecha = XLSX.SSF.parse_date_code(valor);
    return fecha ? desdePartes(fecha.y, fecha.m, fecha.d) : undefined;
  }
  const fecha = texto(valor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return undefined;
  const comprobada = new Date(`${fecha}T00:00:00.000Z`);
  return Number.isNaN(comprobada.valueOf()) || comprobada.toISOString().slice(0, 10) !== fecha ? undefined : fecha;
}

function desdePartes(anio: number, mes: number, dia: number): string | undefined {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
    ? `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
    : undefined;
}

function horaIso(valor: unknown): string | undefined {
  if (valor instanceof Date && !Number.isNaN(valor.valueOf())) return `${String(valor.getUTCHours()).padStart(2, "0")}:${String(valor.getUTCMinutes()).padStart(2, "0")}`;
  if (typeof valor === "number" && valor >= 0 && valor < 1) {
    const minutos = Math.round(valor * 24 * 60);
    return minutos < 24 * 60 ? `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}` : undefined;
  }
  const hora = texto(valor);
  if (!/^\d{2}:\d{2}$/.test(hora)) return undefined;
  const [horas, minutos] = hora.split(":").map(Number);
  return horas < 24 && minutos < 60 ? hora : undefined;
}
