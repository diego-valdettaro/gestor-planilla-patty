import type { TurnoPublicado } from "./publicar-turno-semanal";

export interface ColaboradorDelEquipo {
  dni: string;
  nombre: string;
  sede: string;
}

export type CeldaDeConsultaSemanal =
  | { estado: "sin-publicacion" }
  | { estado: "descanso"; sede: string | null }
  | { estado: "publicado"; sede: string; entradaProgramada: string; salidaProgramada: string };

export interface GrupoDeSedeEnConsulta {
  sede: string;
  colaboradores: Array<{
    dni: string;
    nombre: string;
    celdas: CeldaDeConsultaSemanal[];
  }>;
}

export function crearConsultaSemanalPorEquipo({
  dias,
  colaboradores,
  turnos,
}: {
  dias: string[];
  colaboradores: ColaboradorDelEquipo[];
  turnos: TurnoPublicado[];
}): GrupoDeSedeEnConsulta[] {
  const turnosPorColaboradorYFecha = new Map(
    turnos.map((turno) => [`${turno.dni}:${turno.fecha}`, turno]),
  );
  const grupos = new Map<string, GrupoDeSedeEnConsulta>();

  for (const colaborador of colaboradores) {
    const grupo = grupos.get(colaborador.sede) ?? { sede: colaborador.sede, colaboradores: [] };
    grupos.set(colaborador.sede, grupo);
    grupo.colaboradores.push({
      dni: colaborador.dni,
      nombre: colaborador.nombre,
      celdas: dias.map((fecha) => convertirTurnoEnCelda(turnosPorColaboradorYFecha.get(`${colaborador.dni}:${fecha}`))),
    });
  }

  return [...grupos.values()].sort((a, b) => a.sede.localeCompare(b.sede));
}

function convertirTurnoEnCelda(turno: TurnoPublicado | undefined): CeldaDeConsultaSemanal {
  if (!turno) return { estado: "sin-publicacion" };
  if (turno.descanso) return { estado: "descanso", sede: turno.sede };
  if (!turno.sede || !turno.entradaProgramada || !turno.salidaProgramada) return { estado: "sin-publicacion" };
  return {
    estado: "publicado",
    sede: turno.sede,
    entradaProgramada: turno.entradaProgramada,
    salidaProgramada: turno.salidaProgramada,
  };
}
