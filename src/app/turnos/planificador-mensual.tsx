"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SelectorMensual } from "@/app/selector-mensual";
import { inicioDeSemana } from "@/turnos/semana";
import { type DatosDeJornadaPlanificada } from "@/turnos/jornada-planificada";
import { estaVigenteEn, type Vigencia } from "@/relaciones-laborales/vigencia";

import { estadoDeCelda, NOMBRE_DEL_ESTADO_DE_HORARIO } from "./estado-de-celda";

type Jornada = DatosDeJornadaPlanificada & { dni: string; fecha: string };

export function PlanificadorMensual({ mes, equipo, equipos, colaboradores, dni, dias, borradores, publicados, vigencias, fechasCerradas }: {
  mes: string; equipo: string; equipos: string[]; colaboradores: Array<{ dni: string; nombre: string }>; dni?: string; dias: string[];
  borradores: Jornada[]; publicados: Jornada[]; vigencias: Vigencia[]; fechasCerradas: string[];
}) {
  const router = useRouter();
  const persona = colaboradores.find(p => p.dni === dni);
  const porFecha = new Map(borradores.filter(c => c.dni === dni).map(c => [c.fecha, c]));
  const publicadosPorFecha = new Map(publicados.filter(c => c.dni === dni).map(c => [c.fecha, c]));
  const cerradas = new Set(fechasCerradas);
  function ruta(cambios: Record<string, string> = {}) {
    return `/turnos?${new URLSearchParams({ vista: "mensual", mes, equipo, ...(dni ? { colaborador: dni } : {}), ...cambios })}`;
  }
  const semanaHref = `/turnos?${new URLSearchParams({ semana: inicioDeSemana(dias[0]), equipo })}`;
  const desfase = (new Date(`${dias[0]}T00:00:00Z`).getUTCDay() + 6) % 7;
  return <>
    <nav aria-label="Vista" className="pestanas-personal"><Link href={semanaHref}>Vista semanal</Link><Link aria-current="page" className="activo" href={ruta()}>Vista mensual</Link></nav>
    <section className="tile panel">
      <div className="panel-filtros filtros-plan-mensual">
        <label>Grupo<select aria-label="Grupo" value={equipo} onChange={e => router.push(ruta({ equipo: e.target.value, colaborador: "" }))}>{equipos.map(g => <option key={g}>{g}</option>)}</select></label>
        <SelectorMensual mes={mes} alSeleccionar={nuevo => router.push(ruta({ mes: nuevo }))} />
        <label>Colaborador<select aria-label="Colaborador" value={dni ?? ""} onChange={e => router.push(ruta({ colaborador: e.target.value }))}>{colaboradores.map(p => <option key={p.dni} value={p.dni}>{p.nombre}</option>)}</select></label>
      </div>
      <h2>{persona?.nombre ?? "No hay colaboradores activos"}</h2>
      <p>Seleccione un día para editar sus jornadas en la vista semanal. La publicación es por semanas completas.</p>
      <div className="calendario calendario-plan"><div className="dias-semana">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => <span key={d}>{d}</span>)}</div>
        <div className="celdas-calendario">{Array.from({ length: desfase }, (_, i) => <span key={`vacio-${i}`} />)}{persona && dias.map(fecha => {
          const publicado = publicadosPorFecha.get(fecha);
          const vigente = estaVigenteEn(vigencias, fecha);
          const borrador = porFecha.get(fecha);
          const celdaEnVigencia = borrador?.motivoNoAsistencia === "sin_relacion_laboral" ? undefined : borrador;
          const celda = vigente ? (cerradas.has(fecha) && publicado ? publicado : celdaEnVigencia ?? publicado) : undefined;
          const estado = !vigente ? "Sin relación laboral" : NOMBRE_DEL_ESTADO_DE_HORARIO[estadoDeCelda(celdaEnVigencia, publicado, cerradas.has(fecha) && Boolean(publicado))];
          const clase = estado === "Publicado" ? "est-publicado" : estado === "Liquidado" ? "est-liquidado" : estado === "Cambios sin publicar" ? "est-cambiado" : "est-borrador";
          const motivo = celda?.motivoNoAsistencia ?? (celda?.descanso ? "descanso" : undefined);
          return <Link aria-label={`Horario del ${fecha}: ${estado}. Abrir semana`} className={`dia-calendario est ${clase}`} href={`/turnos?${new URLSearchParams({ semana: inicioDeSemana(fecha), equipo })}`} key={fecha}>
            <time dateTime={fecha}>{Number(fecha.slice(-2))}</time><em>{estado}</em>
            {vigente && (motivo ? <b>{motivo[0].toUpperCase() + motivo.slice(1)}</b> : celda ? <><b>{celda.sede}</b><small>{celda.entradaProgramada}–{celda.salidaProgramada}</small></> : <small>Sin asignar</small>)}
          </Link>;
        })}</div>
      </div>
    </section>
  </>;
}
