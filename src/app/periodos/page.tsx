import React from "react";
import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { BotonDeAccionConfirmada } from "@/app/boton-de-accion-confirmada";
import { calcularSugerenciaDePeriodo, crearResumenVacio } from "@/periodos/periodo-planilla";
import type { BloqueoDePeriodo, DetalleDeJornada, FilaDeResumen, ResumenDePeriodo } from "@/periodos/periodo-planilla";
import { repositorioDePeriodos } from "@/periodos/servicio";

import { cerrarPeriodoDesdeFormulario, decidirHorasExtraDesdeFormulario, reabrirPeriodoDesdeFormulario } from "./actions";
import { CreadorDePeriodo } from "./creador-de-periodo";

export const dynamic = "force-dynamic";

export default async function PaginaDePeriodos({ searchParams }: { searchParams: Promise<{ periodoId?: string; sede?: string; idHuellero?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") return <main className="centrado"><section className="estado-vacio"><h1>Sin permiso</h1><p>Su rol no permite consultar períodos de planilla.</p></section></main>;

  const query = await searchParams;
  const periodos = await repositorioDePeriodos.listar();
  const periodo = periodos.find((item) => item.id === query.periodoId) ?? periodos.find((item) => item.estado === "abierto") ?? periodos[0];
  const resumen = periodo ? await repositorioDePeriodos.listarResumen({ periodoId: periodo.id, sede: query.sede, idHuellero: query.idHuellero }) : crearResumenVacio();
  const sedes = [...new Set(resumen.filas.flatMap(({ jornadas }) => jornadas.map(({ sede }) => sede).filter((sede): sede is string => Boolean(sede))))].sort();
  const colaboradores = [...new Map(resumen.filas.map(({ idHuellero, nombre }) => [idHuellero, { idHuellero, nombre }])).values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const sugerencia = calcularSugerenciaDePeriodo(periodos, new Date());

  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina"><div><p className="eyebrow">Administración y Finanzas</p><h1>Liquidaciones</h1><p>Filtre, revise y exporte los totales antes de cerrar el período.</p></div></header>
    <section className="tarjeta panel">
      <header className="panel-cabecera"><div><h2>Nuevo período</h2><p>Se sugiere continuar del día 26 al 25, pero puede indicar otras fechas.</p></div></header>
      <CreadorDePeriodo sugerencia={sugerencia} />
    </section>
    {periodo ? <>
      <form className="filtros panel-filtros periodos-filtros" method="get">
        <label>Período<select name="periodoId" defaultValue={periodo.id}>{periodos.map((item) => <option key={item.id} value={item.id}>{item.inicio} a {item.fin} ({item.estado})</option>)}</select></label>
        <label>Sede<select name="sede" defaultValue={query.sede ?? ""}><option value="">Todas las sedes</option>{sedes.map((sede) => <option key={sede} value={sede}>{sede}</option>)}</select></label>
        <label>Colaborador<select name="idHuellero" defaultValue={query.idHuellero ?? ""}><option value="">Todos los colaboradores</option>{colaboradores.map((item) => <option key={item.idHuellero} value={item.idHuellero}>{item.nombre} · {item.idHuellero}</option>)}</select></label>
        <button type="submit">Filtrar</button>
        <a className="boton-secundario" href={`/api/periodos/${periodo.id}/exportar`}>Exportar XLSX completo</a>
      </form>
      <section className="tarjeta panel">
        <header className="panel-cabecera"><div><h2>Período {periodo.inicio} a {periodo.fin}</h2><p>Estado actual: {periodo.estado === "abierto" ? <span className="insignia ok">Abierto</span> : <span className="insignia neutro">Cerrado</span>}</p></div>{periodo.estado === "abierto" && actor.rol === "finanzas" ? <BotonDeAccionConfirmada accion={cerrarPeriodoDesdeFormulario} confirmar="Cerrar período" descripcion="Ya no se podrán importar ni modificar asistencias de este período hasta que lo reabra con un motivo." etiqueta="Cerrar período" titulo="¿Cerrar este período de planilla?"><input type="hidden" name="periodoId" value={periodo.id} /></BotonDeAccionConfirmada> : null}</header>
        {periodo.estado === "cerrado" && actor.rol === "finanzas" ? <form action={reabrirPeriodoDesdeFormulario} className="filtros"><input type="hidden" name="periodoId" value={periodo.id} /><label>Motivo de reapertura<input name="motivo" required /></label><button type="submit">Reabrir período</button></form> : null}
        {periodo.estado === "abierto" && actor.rol === "finanzas" ? <DecisionesDeHorasExtra periodoId={periodo.id} filas={resumen.filas} /> : null}
        <TotalesGenerales resumen={resumen} />
        <Bloqueos bloqueos={resumen.bloqueos} />
        {resumen.filas.length ? <ResumenPorGrupos filas={resumen.filas} /> : <section className="estado-vacio"><h3>Sin resultados</h3><p>No hay colaboradores que coincidan con los filtros elegidos. Los totales y bloqueos siguen cubriendo el período completo.</p></section>}
      </section>
    </> : <section className="estado-vacio"><h2>No hay períodos de planilla</h2><p>Cree un período con el formulario «Nuevo período» de arriba para revisar y exportar sus totales.</p></section>}
  </main>;
}

function DecisionesDeHorasExtra({ periodoId, filas }: { periodoId: string; filas: FilaDeResumen[] }) {
  const pendientes = filas.flatMap((fila) => fila.jornadas
    .filter((jornada) => jornada.horaExtra?.estado === "pendiente")
    .map((jornada) => ({ ...jornada.horaExtra!, nombre: fila.nombre, fecha: jornada.fecha })));
  if (!pendientes.length) return null;
  const campos = <>
    <input name="periodoId" type="hidden" value={periodoId} />
    <fieldset>
      <legend>Seleccione una o más horas extra pendientes</legend>
      {pendientes.map((horaExtra) => <label className="checkbox" key={horaExtra.id}>
        <input name="horaExtraId" type="checkbox" value={horaExtra.id} />
        {horaExtra.nombre}, {horaExtra.fecha}: 25% {formatearDuracion(horaExtra.minutosAl25)}, 35% {formatearDuracion(horaExtra.minutosAl35)}
      </label>)}
    </fieldset>
  </>;
  return <section>
    <h3>Decidir horas extra pendientes</h3>
    <div className="acciones">
      <BotonDeAccionConfirmada accion={decidirHorasExtraDesdeFormulario} confirmar="Aprobar selección" descripcion="Seleccione al menos una hora extra. La selección quedará aprobada en una sola operación." etiqueta="Aprobar horas extra" requiereSeleccion="horaExtraId" titulo="¿Aprobar estas horas extra?">
        <input name="decision" type="hidden" value="aprobada" />{campos}
      </BotonDeAccionConfirmada>
      <BotonDeAccionConfirmada accion={decidirHorasExtraDesdeFormulario} confirmar="Rechazar selección" descripcion="Seleccione al menos una hora extra. La selección quedará rechazada en una sola operación." etiqueta="Rechazar horas extra" requiereSeleccion="horaExtraId" titulo="¿Rechazar estas horas extra?" peligro>
        <input name="decision" type="hidden" value="rechazada" />{campos}
      </BotonDeAccionConfirmada>
    </div>
  </section>;
}

function TotalesGenerales({ resumen }: { resumen: ResumenDePeriodo }) {
  const totales = resumen.totales;
  return <section><h3>Totales del período completo</h3><TablaDeTotales totales={totales} /><TablaDeHorasExtra horasExtra={totales.horasExtra} /></section>;
}

function Bloqueos({ bloqueos }: { bloqueos: BloqueoDePeriodo[] }) {
  if (!bloqueos.length) return <p className="mensaje-operacion listo" role="status">El período no tiene asistencias ni horas extra pendientes.</p>;
  return <section className="mensaje-operacion advertencia" role="status"><h3>Bloqueos del período completo</h3><ul>{bloqueos.map((bloqueo) => <li key={`${bloqueo.tipo}-${bloqueo.idHuellero}-${bloqueo.fecha}`}><a href={enlaceDelBloqueo(bloqueo)}>{bloqueo.tipo === "asistencia" ? "Asistencia pendiente" : "Hora extra pendiente"}: {bloqueo.nombre}, {bloqueo.fecha}</a></li>)}</ul></section>;
}

function ResumenPorGrupos({ filas }: { filas: FilaDeResumen[] }) {
  const grupos = new Map<string, FilaDeResumen[]>();
  for (const fila of filas) grupos.set(fila.grupo, [...(grupos.get(fila.grupo) ?? []), fila]);
  return <>{[...grupos].map(([grupo, colaboradores]) => <section key={grupo}><h3>{grupo}</h3>{colaboradores.map((fila) => <article className="tarjeta" key={`${grupo}-${fila.idHuellero}`}><h4>{fila.nombre} ({fila.idHuellero})</h4><TablaDeTotales totales={fila} /><TablaDeHorasExtra horasExtra={fila.horasExtra} /><DetalleDiario fila={fila} /></article>)}</section>)}</>;
}

function TablaDeTotales({ totales }: { totales: ResumenDePeriodo["totales"] }) {
  return <div className="panel-tabla"><table><thead><tr><th>Jornadas trabajadas</th><th>Horas trabajadas</th><th>Faltas</th><th>Descansos</th><th>Feriados</th><th>Vacaciones</th><th>Permisos</th><th>Suspensiones</th><th>Tardanzas</th><th>Horas penalizadas</th></tr></thead><tbody><tr><td>{totales.jornadasTrabajadas}</td><td>{formatearDuracion(totales.minutosTrabajados)}</td><td>{totales.noAsistencias.falta}</td><td>{totales.noAsistencias.descanso}</td><td>{totales.noAsistencias.feriado}</td><td>{totales.noAsistencias.vacaciones}</td><td>{totales.noAsistencias.permiso}</td><td>{totales.noAsistencias.suspension}</td><td>{totales.cantidadTardanzas}</td><td>{formatearDuracion(totales.minutosPenalizados)}</td></tr></tbody></table></div>;
}

function TablaDeHorasExtra({ horasExtra }: { horasExtra: FilaDeResumen["horasExtra"] }) {
  return <div className="panel-tabla"><table><thead><tr><th>Pendientes 25%</th><th>Pendientes 35%</th><th>Aprobadas 25%</th><th>Aprobadas 35%</th><th>Rechazadas 25%</th><th>Rechazadas 35%</th></tr></thead><tbody><tr><td>{formatearDuracion(horasExtra.pendiente.minutosAl25)}</td><td>{formatearDuracion(horasExtra.pendiente.minutosAl35)}</td><td>{formatearDuracion(horasExtra.aprobada.minutosAl25)}</td><td>{formatearDuracion(horasExtra.aprobada.minutosAl35)}</td><td>{formatearDuracion(horasExtra.rechazada.minutosAl25)}</td><td>{formatearDuracion(horasExtra.rechazada.minutosAl35)}</td></tr></tbody></table></div>;
}

function DetalleDiario({ fila }: { fila: FilaDeResumen }) {
  return <details><summary>Ver detalle diario</summary><div className="panel-tabla"><table><thead><tr><th>Fecha</th><th>Sede de la jornada</th><th>Resultado real</th><th>Horario real</th><th>Tiempo trabajado</th><th>Tardanza</th><th>Penalización</th><th>Hora extra</th></tr></thead><tbody>{fila.jornadas.map((jornada) => <tr id={`jornada-${fila.idHuellero}-${jornada.fecha}`} key={jornada.fecha}><td>{jornada.fecha}</td><td>{jornada.sede ?? "Sin sede"}</td><td>{nombreDelResultado(jornada.resultado)}</td><td>{horarioReal(jornada)}</td><td>{formatearDuracion(jornada.minutosTrabajados)}</td><td>{formatearDuracion(jornada.tardanzaEnMinutos)}</td><td>{formatearDuracion(jornada.minutosPenalizados)}</td><td>{jornada.horaExtra ? `${nombreDelEstadoExtra(jornada.horaExtra.estado)}: 25% ${formatearDuracion(jornada.horaExtra.minutosAl25)}, 35% ${formatearDuracion(jornada.horaExtra.minutosAl35)}` : "Sin hora extra"}</td></tr>)}</tbody></table></div></details>;
}

function enlaceDelBloqueo(bloqueo: BloqueoDePeriodo): string {
  if (bloqueo.tipo === "hora-extra") return `#jornada-${bloqueo.idHuellero}-${bloqueo.fecha}`;
  return `/asistencias?vista=mensual&grupo=${encodeURIComponent(bloqueo.grupo)}&fecha=${bloqueo.fecha}&colaborador=${encodeURIComponent(bloqueo.idHuellero)}`;
}

function nombreDelResultado(resultado: DetalleDeJornada["resultado"]): string {
  return { pendiente: "Pendiente de revisión", trabajada: "Trabajada", falta: "Falta", descanso: "Descanso", feriado: "Feriado", vacaciones: "Vacaciones", permiso: "Permiso", suspension: "Suspensión" }[resultado];
}

function nombreDelEstadoExtra(estado: NonNullable<DetalleDeJornada["horaExtra"]>["estado"]): string {
  return { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada" }[estado];
}

function horarioReal(jornada: DetalleDeJornada): string {
  if (!jornada.entradaReal || !jornada.salidaReal) return "No aplica";
  return `${jornada.entradaReal.slice(11, 16)} a ${jornada.salidaReal.slice(11, 16)}`;
}

function formatearDuracion(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (!horas) return `${resto} min`;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}
