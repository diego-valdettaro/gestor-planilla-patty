export interface HoraExtraCalculada {
  minutosAl25: number;
  minutosAl35: number;
  estado: EstadoDeHoraExtra;
}

export type EstadoDeHoraExtra = "pendiente" | "aprobada" | "rechazada";

export function calcularHoraExtra(salidaProgramada: string, salidaReal: string): HoraExtraCalculada | undefined {
  const minutosTrabajadosDespuesDelTurno = minutosDelDia(salidaReal) - minutosDelDia(salidaProgramada);
  const minutosRedondeados = redondearMinutosDeHoraExtra(minutosTrabajadosDespuesDelTurno);
  if (minutosRedondeados === 0) return undefined;
  return {
    minutosAl25: Math.min(minutosRedondeados, 120),
    minutosAl35: Math.max(minutosRedondeados - 120, 0),
    estado: "pendiente",
  };
}

function redondearMinutosDeHoraExtra(minutos: number): number {
  if (minutos <= 20) return 0;
  if (minutos <= 50) return 30;
  if (minutos <= 80) return 60;
  if (minutos <= 110) return 90;
  return (Math.floor((minutos - 111) / 30) + 4) * 30;
}

function minutosDelDia(valor: string): number {
  const coincidencia = /T(\d{2}):(\d{2})/.exec(valor) ?? /^(\d{2}):(\d{2})$/.exec(valor);
  if (!coincidencia) throw new Error("La hora debe usar el formato HH:MM.");
  const horas = Number(coincidencia[1]);
  const minutos = Number(coincidencia[2]);
  if (horas > 23 || minutos > 59) throw new Error("La hora no es válida.");
  return horas * 60 + minutos;
}
