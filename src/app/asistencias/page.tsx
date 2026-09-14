import { redirect } from "next/navigation";
import React from "react";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { repositorioDeAsistencias } from "@/asistencias/servicio";
import { diasDeLaSemana, inicioDeSemana } from "@/turnos/semana";
import { repositorioDeGrupos, repositorioDeTurnos } from "@/turnos/servicio";

import { CalendarioDeAsistencias } from "./calendario-de-asistencias";
import { ESTADOS_DE_CELDA_ASISTENCIA, NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA } from "./estado-de-celda";
import { FiltrosDeAsistencia } from "./filtros-de-asistencia";
import { MatrizSemanalDeAsistencias } from "./matriz-semanal-de-asistencias";
import { SelectorConfirmacionPorRango } from "./selector-confirmacion-por-rango";
import type { AsistenciaSemanal } from "./resumen-semanal";

export const dynamic = "force-dynamic";

interface PropiedadesDePagina {
  searchParams: Promise<{ colaborador?: string; fecha?: string; grupo?: string; semana?: string; vista?: string; inicio?: string; fin?: string }>;
}

export default async function PaginaDeAsistencias({ searchParams }: PropiedadesDePagina) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") return <main className="centrado"><p>No tiene permiso para revisar asistencias.</p></main>;

  const parametros = await searchParams;
  const grupos = await repositorioDeGrupos.listar();
  const grupo = grupos.includes(parametros.grupo ?? "") ? parametros.grupo! : grupos[0];
  const fecha = fechaValida(parametros.fecha) ? parametros.fecha : fechaValida(parametros.semana) ? parametros.semana : new Date().toISOString().slice(0, 10);
  const vista = parametros.vista === "mensual" ? "mensual" : "semanal";
  const semana = inicioDeSemana(fecha);
  const dias = diasDeLaSemana(semana);
  const colaboradores = grupo ? await repositorioDeTurnos.listarColaboradoresActivosPorEquipo(grupo) : [];
  const colaborador = colaboradores.find(({ idHuellero }) => idHuellero === parametros.colaborador) ?? colaboradores[0];
  const diasDelMes = vista === "mensual" ? fechasDelMes(fecha.slice(0, 7)) : [];
  const asistenciasSemanales = vista === "semanal"
    ? await repositorioDeAsistencias.listarResumenSemanal(colaboradores.map(({ idHuellero }) => idHuellero), dias[0], dias.at(-1)!)
    : [];
  const asistenciasMensuales = vista === "mensual" && colaborador
    ? await repositorioDeAsistencias.listarResumenMensual(colaborador.idHuellero, diasDelMes[0], diasDelMes.at(-1)!)
    : [];
  const inicioRango = fechaValida(parametros.inicio) ? parametros.inicio : vista === "mensual" ? diasDelMes[0] : dias[0];
  const finRango = fechaValida(parametros.fin) && parametros.fin >= inicioRango ? parametros.fin : vista === "mensual" ? diasDelMes.at(-1)! : dias.at(-1)!;
  const asistenciasDelRango = grupo ? await repositorioDeAsistencias.listarResumenSemanal(colaboradores.map(({ idHuellero }) => idHuellero), inicioRango, finRango) : [];
  const opcionesDeConfirmacion = opcionesParaConfirmar(colaboradores, inicioRango, finRango, asistenciasDelRango);

  return <main className="contenido">
    <header className="encabezado"><div><p className="eyebrow">Administración y Finanzas</p><h1>Asistencias</h1><p>{vista === "mensual" ? "Revise el mes completo de un colaborador." : "Revise las jornadas semanales por grupo operativo."}</p></div></header>
    {grupo ? <><FiltrosDeAsistencia colaborador={colaborador?.idHuellero} colaboradores={colaboradores} fecha={fecha} grupo={grupo} grupos={grupos} vista={vista} /><section className="tarjeta"><form className="filtros" method="get"><input name="vista" type="hidden" value={vista} /><input name="grupo" type="hidden" value={grupo} /><input name="fecha" type="hidden" value={fecha} /><label>Desde<input defaultValue={inicioRango} name="inicio" type="date" /></label><label>Hasta<input defaultValue={finRango} name="fin" type="date" /></label><button type="submit">Definir rango</button></form><SelectorConfirmacionPorRango fin={finRango} inicio={inicioRango} opciones={opcionesDeConfirmacion} /></section>{vista === "mensual" && !colaborador ? <section className="estado-vacio"><h2>No hay colaboradores activos</h2><p>Registre un colaborador activo en este grupo antes de revisar sus asistencias mensuales.</p></section> : <section className="tarjeta"><header className="encabezado-seccion"><div><h2>{vista === "mensual" ? colaborador?.nombre : grupo}</h2><p>{vista === "mensual" ? "El calendario muestra los resultados diarios del colaborador." : "La matriz muestra las jornadas de los colaboradores del grupo."}</p></div></header><ul aria-label="Estados de asistencia" className="leyenda-estados">{ESTADOS_DE_CELDA_ASISTENCIA.map((estadoDeCelda) => <li className={`estado-color-${estadoDeCelda}`} key={estadoDeCelda}>{NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA[estadoDeCelda]}</li>)}</ul>{vista === "mensual" && colaborador ? <CalendarioDeAsistencias asistencias={asistenciasMensuales} desfase={desfaseLunes(diasDelMes[0])} dias={diasDelMes} idHuellero={colaborador.idHuellero} /> : <MatrizSemanalDeAsistencias asistencias={asistenciasSemanales} colaboradores={colaboradores} dias={dias} />}</section>}</> : <section className="estado-vacio"><h2>No hay grupos operativos</h2><p>Configure una sede activa dentro de un grupo operativo antes de revisar asistencias.</p></section>}
  </main>;
}

function fechaValida(valor: string | undefined): valor is string {
  return Boolean(valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(new Date(`${valor}T00:00:00Z`).getTime()));
}

function fechasDelMes(mes: string): string[] {
  const [anio, numeroMes] = mes.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
  return Array.from({ length: ultimoDia }, (_, indice) => `${mes}-${String(indice + 1).padStart(2, "0")}`);
}

function desfaseLunes(fecha: string): number {
  return (new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function opcionesParaConfirmar(colaboradores: Array<{ idHuellero: string; nombre: string }>, inicio: string, fin: string, asistencias: AsistenciaSemanal[]) {
  const dias = fechasEntre(inicio, fin);
  const porClave = new Map(asistencias.map((asistencia) => [`${asistencia.idHuellero}:${asistencia.fecha}`, asistencia]));
  return colaboradores.map((colaborador) => {
    const causas = dias.flatMap((dia) => {
      const asistencia = porClave.get(`${colaborador.idHuellero}:${dia}`);
      if (!asistencia) return [`${dia}: sin jornada publicada`];
      if (asistencia.enPeriodoCerrado) return [`${dia}: periodo cerrado`];
      if (asistencia.estado !== "pendiente") return [`${dia}: jornada ya registrada`];
      if (asistencia.motivoPlanificado) return [];
      if (!asistencia.entradaPropuesta || !asistencia.salidaPropuesta) return [`${dia}: marcas incompletas`];
      if (asistencia.salidaPropuesta <= asistencia.entradaPropuesta) return [`${dia}: horas inconsistentes`];
      return [];
    });
    return { ...colaborador, seleccionable: !causas.length, causa: causas[0] };
  });
}

function fechasEntre(inicio: string, fin: string): string[] {
  const resultado: string[] = [];
  const fecha = new Date(`${inicio}T00:00:00Z`);
  while (fecha.toISOString().slice(0, 10) <= fin) { resultado.push(fecha.toISOString().slice(0, 10)); fecha.setUTCDate(fecha.getUTCDate() + 1); }
  return resultado;
}
