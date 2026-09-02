export interface HoraExtraCalculada {
  minutosAl25: number;
  minutosAl35: number;
  estado: EstadoDeHoraExtra;
}

export type EstadoDeHoraExtra = "pendiente" | "aprobada" | "rechazada";

export function calcularHoraExtra(salidaProgramada: string, salidaReal: string): HoraExtraCalculada | undefined {
  const minutosTrabajadosDespuesDelTurno = (new Date(salidaReal).getTime() - horaDelDia(salidaReal, salidaProgramada).getTime()) / 60_000;
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

function horaDelDia(fecha: string, hora: string): Date {
  const zonaHoraria = fecha.slice(-6);
  return new Date(`${fecha.slice(0, 10)}T${hora}:00${zonaHoraria}`);
}
