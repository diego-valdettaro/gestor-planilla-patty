import React from "react";

import { IconoCandado } from "@/app/icono-candado";

import { NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA } from "./estado-de-celda";
import { resumirAsistenciasSemanales, type AsistenciaSemanal } from "./resumen-semanal";

export function MatrizSemanalDeAsistencias({ asistencias, colaboradores, dias }: { asistencias: AsistenciaSemanal[]; colaboradores: Array<{ idHuellero: string; nombre: string }>; dias: string[] }) {
  const resumen = resumirAsistenciasSemanales(colaboradores, dias, asistencias);
  return <div className="tabla-plan-semanal"><table><thead><tr><th scope="col">Colaborador</th>{dias.map((fecha) => <th key={fecha} scope="col"><time dateTime={fecha}>{nombreDelDia(fecha)}<br />{fecha.slice(-2)}</time></th>)}</tr></thead><tbody>{resumen.map((colaborador) => <tr key={colaborador.idHuellero}><th scope="row"><span>{colaborador.nombre}</span><small>{colaborador.idHuellero}</small></th>{colaborador.jornadas.map((jornada) => <td className={`celda-plan-semanal estado-color-${jornada.estado}`} key={jornada.fecha}><div aria-label={`Asistencia de ${colaborador.nombre} para ${jornada.fecha}: ${NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA[jornada.estado]}`} className="chip-turno"><span className="etiqueta-estado-celda">{jornada.bloqueada && <IconoCandado />}{NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA[jornada.estado]}</span>{jornada.motivo ? <b>{jornada.motivo}</b> : <>{jornada.sede && <b>{jornada.sede}</b>}{jornada.entrada && jornada.salida && <small>{jornada.entrada}–{jornada.salida}</small>}{jornada.causa && <small>{jornada.causa}</small>}</>}</div></td>)}</tr>)}</tbody></table></div>;
}

function nombreDelDia(fecha: string): string {
  return ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][(new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7];
}
