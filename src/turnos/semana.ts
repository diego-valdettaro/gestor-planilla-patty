export function inicioDeSemana(fecha: string): string {
  const fechaUtc = new Date(`${fecha}T00:00:00.000Z`);
  const desplazamientoHastaLunes = (fechaUtc.getUTCDay() + 6) % 7;
  fechaUtc.setUTCDate(fechaUtc.getUTCDate() - desplazamientoHastaLunes);

  return fechaUtc.toISOString().slice(0, 10);
}

export function diasDeLaSemana(inicio: string): string[] {
  const primerDia = new Date(`${inicio}T00:00:00.000Z`);

  return Array.from({ length: 7 }, (_, indice) => {
    const fecha = new Date(primerDia);
    fecha.setUTCDate(fecha.getUTCDate() + indice);
    return fecha.toISOString().slice(0, 10);
  });
}

export function desplazarFecha(fecha: string, dias: number): string {
  const fechaDesplazada = new Date(`${fecha}T00:00:00.000Z`);
  fechaDesplazada.setUTCDate(fechaDesplazada.getUTCDate() + dias);
  return fechaDesplazada.toISOString().slice(0, 10);
}
