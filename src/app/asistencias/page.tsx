import { redirect } from "next/navigation";
import React from "react";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { repositorioDeAsistencias } from "@/asistencias/servicio";
import { diasDeLaSemana, inicioDeSemana } from "@/turnos/semana";
import { repositorioDeGrupos, repositorioDeTurnos } from "@/turnos/servicio";

import { ESTADOS_DE_CELDA_ASISTENCIA, NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA } from "./estado-de-celda";
import { FiltrosDeAsistencia } from "./filtros-de-asistencia";
import { MatrizSemanalDeAsistencias } from "./matriz-semanal-de-asistencias";

export const dynamic = "force-dynamic";

interface PropiedadesDePagina { searchParams: Promise<{ grupo?: string; semana?: string }>; }

export default async function PaginaDeAsistencias({ searchParams }: PropiedadesDePagina) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") return <main className="centrado"><p>No tiene permiso para revisar asistencias.</p></main>;

  const parametros = await searchParams;
  const grupos = await repositorioDeGrupos.listar();
  const grupo = grupos.includes(parametros.grupo ?? "") ? parametros.grupo! : grupos[0];
  const semana = inicioDeSemana(parametros.semana ?? new Date().toISOString().slice(0, 10));
  const dias = diasDeLaSemana(semana);
  const colaboradores = grupo ? await repositorioDeTurnos.listarColaboradoresActivosPorEquipo(grupo) : [];
  const asistencias = await repositorioDeAsistencias.listarResumenSemanal(colaboradores.map(({ idHuellero }) => idHuellero), dias[0], dias.at(-1)!);

  return <main className="contenido">
    <header className="encabezado"><div><p className="eyebrow">Administración y Finanzas</p><h1>Asistencias</h1><p>Revise las jornadas semanales por grupo operativo.</p></div></header>
    {grupo ? <><FiltrosDeAsistencia grupo={grupo} grupos={grupos} semana={semana} /><section className="tarjeta"><header className="encabezado-seccion"><div><h2>{grupo}</h2><p>La matriz muestra las jornadas de los colaboradores del grupo.</p></div></header><ul aria-label="Estados de asistencia" className="leyenda-estados">{ESTADOS_DE_CELDA_ASISTENCIA.map((estadoDeCelda) => <li className={`estado-color-${estadoDeCelda}`} key={estadoDeCelda}>{NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA[estadoDeCelda]}</li>)}</ul><MatrizSemanalDeAsistencias asistencias={asistencias} colaboradores={colaboradores} dias={dias} /></section></> : <section className="estado-vacio"><h2>No hay grupos operativos</h2><p>Configure una sede activa dentro de un grupo operativo antes de revisar asistencias.</p></section>}
  </main>;
}
