import type { CeldaDePlanSemanalEnBorrador, HorarioSemanalParaCopiar } from "@/turnos/plan-semanal-en-borrador";

type Celda = Omit<CeldaDePlanSemanalEnBorrador, "planId">;

export function resumirPlanSemanal(colaboradores: Array<{ idHuellero: string }>, dias: string[], celdas: Celda[], publicados: HorarioSemanalParaCopiar[]) {
  const asignadas = new Set([...publicados, ...celdas].map((celda) => `${celda.idHuellero}:${celda.fecha}`));
  const faltantesPorColaborador = colaboradores.filter((colaborador) => dias.some((fecha) => !asignadas.has(`${colaborador.idHuellero}:${fecha}`)));
  const total = colaboradores.length * dias.length;
  return { total, asignadas: total - faltantesPorColaborador.reduce((cantidad, colaborador) => cantidad + dias.filter((fecha) => !asignadas.has(`${colaborador.idHuellero}:${fecha}`)).length, 0), faltantesPorColaborador };
}
