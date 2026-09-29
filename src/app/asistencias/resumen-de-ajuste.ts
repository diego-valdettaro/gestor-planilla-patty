export interface DatosDeAjuste {
  fecha: string;
  colaborador: string;
  sede: string | null;
  entradaActual: string | null;
  salidaActual: string | null;
  entradaNueva: string;
  salidaNueva: string;
  motivo: string;
}

export interface ResumenDeAjuste {
  fecha: string;
  colaborador: string;
  cambios: string[];
  motivo: string;
  consecuencia: string;
}

export function crearResumenDeAjuste(datos: DatosDeAjuste): ResumenDeAjuste {
  const cambios = [
    cambio("Hora de ingreso", datos.entradaActual, datos.entradaNueva),
    cambio("Hora de salida", datos.salidaActual, datos.salidaNueva),
  ];
  if (datos.sede) cambios.push(`Sede: ${datos.sede} (sin cambios)`);
  return {
    fecha: datos.fecha,
    colaborador: datos.colaborador,
    cambios,
    motivo: datos.motivo,
    consecuencia: "Esta asistencia ya está confirmada. El ajuste reemplaza sus horas y queda registrado con el motivo indicado.",
  };
}

function cambio(etiqueta: string, actual: string | null, nueva: string): string {
  if ((actual ?? "") === nueva) return `${etiqueta}: ${nueva || "sin dato"} (sin cambios)`;
  return `${etiqueta}: ${actual ?? "sin dato"} → ${nueva || "sin dato"}`;
}
