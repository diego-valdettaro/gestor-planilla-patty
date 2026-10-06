import React from "react";
import { redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeAprobarAsistenciaDelGrupo, puedeConsultarPeriodos, puedeGestionarPeriodos } from "@/autenticacion/permisos";
import type { Actor } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { BotonDeAccionConfirmada } from "@/app/boton-de-accion-confirmada";
import { CAUSAS_DE_DESCARTE, NOMBRE_DE_CAUSA_DE_DESCARTE } from "@/asistencias/descarte-de-hora-extra";
import { TEXTO_DE_CAUSA_DE_BLOQUEO } from "@/periodos/aprobacion-de-asistencia";
import { aprobacionesVisiblesPara, calcularSugerenciaDePeriodo, crearResumenVacio } from "@/periodos/periodo-planilla";
import type { AprobacionDeGrupo, BloqueoDePeriodo, PeriodoPlanilla, DetalleDeJornada, FilaDeResumen, ResumenDePeriodo } from "@/periodos/periodo-planilla";
import { repositorioDePeriodos } from "@/periodos/servicio";

import { cerrarPeriodoDesdeFormulario, decidirHorasExtraDesdeFormulario, reabrirPeriodoDesdeFormulario } from "./actions";
import { AprobadorDeAsistencia } from "./aprobador-de-asistencia";
import { CreadorDePeriodo } from "./creador-de-periodo";

export const dynamic = "force-dynamic";

export default async function PaginaDePeriodos({ searchParams }: { searchParams: Promise<{ periodoId?: string; sede?: string; dni?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeConsultarPeriodos(actor)) return <main className="centrado"><section className="estado-vacio"><h1>Sin permiso</h1><p>Su rol no permite consultar períodos de planilla.</p></section></main>;
  // Finanzas y el Administrador ven y operan todo; un gerente de área solo ve y aprueba la asistencia de sus grupos.
  const completo = puedeGestionarPeriodos(actor);

  const query = await searchParams;
  const periodos = await repositorioDePeriodos.listar();
  const periodo = periodos.find((item) => item.id === query.periodoId) ?? periodos.find((item) => item.estado === "abierto") ?? periodos[0];
  const aprobaciones = periodo ? aprobacionesVisiblesPara(actor, await repositorioDePeriodos.listarAprobaciones(periodo.id)) : [];
  if (!completo) return <VistaDeGerente actor={actor} periodos={periodos} periodo={periodo} aprobaciones={aprobaciones} />;

  const resumen = periodo ? await repositorioDePeriodos.listarResumen({ periodoId: periodo.id, sede: query.sede, dni: query.dni }) : crearResumenVacio();
  const sedes = [...new Set(resumen.filas.flatMap(({ jornadas }) => jornadas.map(({ sede }) => sede).filter((sede): sede is string => Boolean(sede))))].sort();
  const colaboradores = [...new Map(resumen.filas.map(({ dni, nombre }) => [dni, { dni, nombre }])).values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const sugerencia = calcularSugerenciaDePeriodo(periodos, new Date());
  const sinAprobar = aprobaciones.filter(({ estado }) => estado !== "aprobada").map(({ grupo }) => grupo);

  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina"><div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>Períodos de planilla</h1><p>Filtre, revise y exporte los totales de asistencia antes de cerrar el período de planilla.</p></div></header>
    <section className="tarjeta panel">
      <header className="panel-cabecera"><div><h2>Nuevo período</h2><p>Se sugiere continuar del día 26 al 25, pero puede indicar otras fechas.</p></div></header>
      <CreadorDePeriodo sugerencia={sugerencia} />
    </section>
    {periodo ? <>
      <form className="filtros panel-filtros periodos-filtros" method="get">
        <label>Período<select name="periodoId" defaultValue={periodo.id}>{periodos.map((item) => <option key={item.id} value={item.id}>{item.inicio} a {item.fin} ({item.estado})</option>)}</select></label>
        <label>Sede<select name="sede" defaultValue={query.sede ?? ""}><option value="">Todas las sedes</option>{sedes.map((sede) => <option key={sede} value={sede}>{sede}</option>)}</select></label>
        <label>Colaborador<select name="dni" defaultValue={query.dni ?? ""}><option value="">Todos los colaboradores</option>{colaboradores.map((item) => <option key={item.dni} value={item.dni}>{item.nombre} · {item.dni}</option>)}</select></label>
        <button type="submit">Filtrar</button>
        <a className="boton-secundario" href={`/api/periodos/${periodo.id}/exportar`}>Exportar XLSX completo</a>
      </form>
      <section className="tarjeta panel">
        <header className="panel-cabecera"><div><h2>Período {periodo.inicio} a {periodo.fin}</h2><p>Estado actual: {periodo.estado === "abierto" ? <span className="insignia ok">Abierto</span> : <span className="insignia neutro">Cerrado</span>}</p></div>{periodo.estado === "abierto" ? <CierreDelPeriodo periodoId={periodo.id} sinAprobar={sinAprobar} /> : null}</header>
        {periodo.estado === "cerrado" ? <BotonDeAccionConfirmada accion={reabrirPeriodoDesdeFormulario} confirmar="Reabrir período" descripcion={`El período de planilla del ${periodo.inicio} al ${periodo.fin} volverá a estar abierto: se podrán importar y modificar asistencias de esas fechas hasta que se cierre de nuevo. La reapertura queda registrada con el motivo indicado. Las aprobaciones de asistencia siguen vigentes salvo que una corrección invalide la de su grupo.`} etiqueta="Reabrir período" titulo="¿Reabrir este período de planilla?"><input type="hidden" name="periodoId" value={periodo.id} /><label>Motivo de reapertura<input name="motivo" required /></label></BotonDeAccionConfirmada> : null}
        <AprobacionDeAsistencia actor={actor} periodo={periodo} aprobaciones={aprobaciones} />
        {periodo.estado === "abierto" ? <DecisionesDeHorasExtra periodoId={periodo.id} filas={resumen.filas} /> : null}
        <TotalesGenerales resumen={resumen} />
        <Bloqueos bloqueos={resumen.bloqueos} />
        {resumen.filas.length ? <ResumenPorGrupos filas={resumen.filas} /> : <section className="estado-vacio"><h3>Sin resultados</h3><p>No hay colaboradores que coincidan con los filtros elegidos. Los totales y bloqueos siguen cubriendo el período completo.</p></section>}
      </section>
    </> : <section className="estado-vacio"><h2>No hay períodos de planilla</h2><p>Cree un período con el formulario «Nuevo período» de arriba para revisar y exportar sus totales.</p></section>}
  </main>;
}

/** Un gerente de área solo ve y aprueba la asistencia de sus grupos: sin totales, exportación, cierre, reapertura ni horas extra. */
function VistaDeGerente({ actor, periodos, periodo, aprobaciones }: { actor: Actor; periodos: PeriodoPlanilla[]; periodo: PeriodoPlanilla | undefined; aprobaciones: AprobacionDeGrupo[] }) {
  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina"><div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>Períodos de planilla</h1><p>Apruebe la asistencia de sus grupos para que Finanzas pueda cerrar el período.</p></div></header>
    {periodo ? <>
      <form className="filtros panel-filtros periodos-filtros" method="get">
        <label>Período<select name="periodoId" defaultValue={periodo.id}>{periodos.map((item) => <option key={item.id} value={item.id}>{item.inicio} a {item.fin} ({item.estado})</option>)}</select></label>
        <button type="submit">Filtrar</button>
      </form>
      <section className="tarjeta panel">
        <header className="panel-cabecera"><div><h2>Período {periodo.inicio} a {periodo.fin}</h2><p>Estado actual: {periodo.estado === "abierto" ? <span className="insignia ok">Abierto</span> : <span className="insignia neutro">Cerrado</span>}</p></div></header>
        <AprobacionDeAsistencia actor={actor} periodo={periodo} aprobaciones={aprobaciones} />
      </section>
    </> : <section className="estado-vacio"><h2>No hay períodos de planilla</h2><p>Finanzas crea los períodos. Cuando exista uno podrá aprobar aquí la asistencia de sus grupos.</p></section>}
  </main>;
}

/** Finanzas cierra solo con todos los grupos aprobados y no aprueba en nombre del gerente: sin aprobación, explica el siguiente paso. */
function CierreDelPeriodo({ periodoId, sinAprobar }: { periodoId: string; sinAprobar: string[] }) {
  if (sinAprobar.length) {
    return <div>
      <button className="boton-principal" disabled type="button">Cerrar período</button>
      <p className="mensaje-operacion advertencia" role="status">No se puede cerrar: falta la aprobación de asistencia {sinAprobar.length === 1 ? "del grupo" : "de los grupos"} {sinAprobar.join(", ")}. Pida al gerente de área {sinAprobar.length === 1 ? "del grupo" : "de cada grupo"} que apruebe; Finanzas no aprueba en su nombre.</p>
    </div>;
  }
  return <BotonDeAccionConfirmada accion={cerrarPeriodoDesdeFormulario} confirmar="Cerrar período" descripcion="Ya no se podrán importar ni modificar asistencias de este período hasta que lo reabra con un motivo." etiqueta="Cerrar período" titulo="¿Cerrar este período de planilla?"><input type="hidden" name="periodoId" value={periodoId} /></BotonDeAccionConfirmada>;
}

function AprobacionDeAsistencia({ actor, periodo, aprobaciones }: { actor: Actor; periodo: PeriodoPlanilla; aprobaciones: AprobacionDeGrupo[] }) {
  if (!aprobaciones.length) return <section className="estado-vacio"><h3>Sin grupos que aprobar</h3><p>No hay grupos que gestionen asistencia: el período no requiere la aprobación de ningún gerente.</p></section>;
  const conBloqueos = aprobaciones.filter(({ bloqueos }) => bloqueos.length);
  return <section>
    <h3>Aprobación de asistencia</h3>
    <p>Cada gerente de área aprueba la situación de todas las personas de su grupo con relación laboral vigente en el período, incluidas las que no tienen marcas. Una corrección posterior invalida la aprobación del grupo. Los grupos que no gestionan asistencia no requieren aprobación.</p>
    <TablaComparable titulo="Aprobación de asistencia por grupo">
      <Cabecera columnas={[{ nombre: "Grupo" }, { nombre: "Gerente de área" }, { nombre: "Estado" }, { nombre: "Personas que bloquean", numerica: true }, { nombre: "Detalle" }, { nombre: "Acción" }]} />
      <tbody>{aprobaciones.map((aprobacion) => <tr key={aprobacion.grupo}>
        <th scope="row">{aprobacion.grupo}</th>
        <td>{aprobacion.gerente ?? "Sin gerente asignado"}</td>
        <td>{insigniaDeAprobacion(aprobacion)}</td>
        <td className="numerico">{new Set(aprobacion.bloqueos.map(({ dni }) => dni)).size}</td>
        <td>{detalleDeAprobacion(aprobacion)}</td>
        <td>{periodo.estado === "abierto" && aprobacion.estado !== "aprobada" && puedeAprobarAsistenciaDelGrupo(actor, aprobacion.grupo)
          ? aprobacion.bloqueos.length ? "Resuelva primero a quienes bloquean" : <AprobadorDeAsistencia periodoId={periodo.id} grupo={aprobacion.grupo} renovar={aprobacion.estado === "invalidada"} />
          : aprobacion.estado === "aprobada" ? "Sin acción pendiente" : puedeAprobarAsistenciaDelGrupo(actor, aprobacion.grupo) ? "El período está cerrado" : `Solo ${aprobacion.gerente ? `el gerente ${aprobacion.gerente}` : "el Administrador del sistema"} puede aprobar`}</td>
      </tr>)}</tbody>
    </TablaComparable>
    {conBloqueos.map((aprobacion) => <section className="mensaje-operacion advertencia" key={aprobacion.grupo} role="status">
      <h4>Personas que bloquean la aprobación de {aprobacion.grupo}</h4>
      <ul>{aprobacion.bloqueos.map((bloqueo) => <li key={`${bloqueo.dni}-${bloqueo.causa}`}><a href={enlaceDeBloqueoDeAprobacion(aprobacion.grupo, bloqueo.dni, bloqueo.fechas[0])}>{bloqueo.nombre} ({bloqueo.dni}): {TEXTO_DE_CAUSA_DE_BLOQUEO[bloqueo.causa]}, {textoDeFechas(bloqueo.fechas)}</a></li>)}</ul>
    </section>)}
  </section>;
}

function insigniaDeAprobacion({ estado }: AprobacionDeGrupo) {
  if (estado === "aprobada") return <span className="insignia ok">Aprobada</span>;
  if (estado === "invalidada") return <span className="insignia advertencia">Invalidada por una corrección</span>;
  return <span className="insignia neutro">Pendiente de aprobación</span>;
}

function detalleDeAprobacion(aprobacion: AprobacionDeGrupo): string {
  if (aprobacion.estado === "aprobada") return `Aprobada por ${aprobacion.aprobadaPor} el ${formatearInstante(aprobacion.aprobadaEn)}.`;
  if (aprobacion.estado === "invalidada") return `${aprobacion.motivoDeInvalidacion} (${formatearInstante(aprobacion.invalidadaEn)}). Debe aprobarse de nuevo.`;
  return aprobacion.bloqueos.length ? "Hay personas que impiden aprobar: vea la lista debajo de la tabla." : "Lista para aprobar.";
}

function textoDeFechas(fechas: string[]): string {
  return fechas.length === 1 ? `el ${fechas[0]}` : `${fechas.length} días (entre el ${fechas[0]} y el ${fechas[fechas.length - 1]})`;
}

function enlaceDeBloqueoDeAprobacion(grupo: string, dni: string, fecha: string): string {
  return `/asistencias?vista=mensual&grupo=${encodeURIComponent(grupo)}&fecha=${fecha}&colaborador=${encodeURIComponent(dni)}`;
}

function formatearInstante(instante: Date | null): string {
  return instante ? instante.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "";
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
      <BotonDeAccionConfirmada accion={decidirHorasExtraDesdeFormulario} confirmar="Descartar selección" descripcion="Seleccione al menos una hora extra. Solo se descarta tiempo que fue una marca errónea o una permanencia sin trabajo efectivo, con su evidencia y motivo. No se descarta por falta de autorización previa: el trabajo acreditado se paga." etiqueta="Descartar horas extra" requiereSeleccion="horaExtraId" titulo="¿Descartar estas horas extra?" peligro>
        <input name="decision" type="hidden" value="descartada" />{campos}
        <label>Evidencia<select name="causa" required defaultValue=""><option value="" disabled>Elija la evidencia</option>{CAUSAS_DE_DESCARTE.map((causa) => <option key={causa} value={causa}>{NOMBRE_DE_CAUSA_DE_DESCARTE[causa]}</option>)}</select></label>
        <label>Motivo del descarte<input name="motivo" required /></label>
      </BotonDeAccionConfirmada>
    </div>
  </section>;
}

function TotalesGenerales({ resumen }: { resumen: ResumenDePeriodo }) {
  const totales = resumen.totales;
  return <section><h3>Totales del período completo</h3><TablaDeTotales totales={totales} titulo="Totales del período completo" /><TablaDeHorasExtra horasExtra={totales.horasExtra} titulo="Horas extra del período completo" /></section>;
}

function Bloqueos({ bloqueos }: { bloqueos: BloqueoDePeriodo[] }) {
  if (!bloqueos.length) return <p className="mensaje-operacion listo" role="status">El período no tiene asistencias ni horas extra pendientes.</p>;
  return <section className="mensaje-operacion advertencia" role="status"><h3>Bloqueos del período completo</h3><ul>{bloqueos.map((bloqueo) => <li key={`${bloqueo.tipo}-${bloqueo.dni}-${bloqueo.fecha}`}><a href={enlaceDelBloqueo(bloqueo)}>{bloqueo.tipo === "asistencia" ? "Asistencia pendiente" : "Hora extra pendiente"}: {bloqueo.nombre}, {bloqueo.fecha}</a></li>)}</ul></section>;
}

function ResumenPorGrupos({ filas }: { filas: FilaDeResumen[] }) {
  const grupos = new Map<string, FilaDeResumen[]>();
  for (const fila of filas) grupos.set(fila.grupo, [...(grupos.get(fila.grupo) ?? []), fila]);
  return <>{[...grupos].map(([grupo, colaboradores]) => <section key={grupo}><h3>{grupo}</h3>{colaboradores.map((fila) => <article className="tarjeta" key={`${grupo}-${fila.dni}`}><h4>{fila.nombre} ({fila.dni})</h4><TablaDeTotales totales={fila} titulo={`Totales de ${fila.nombre} (${fila.dni})`} /><TablaDeHorasExtra horasExtra={fila.horasExtra} titulo={`Horas extra de ${fila.nombre} (${fila.dni})`} /><DetalleDiario fila={fila} /></article>)}</section>)}</>;
}

function TablaComparable({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div className="panel-tabla" role="region" aria-label={titulo} tabIndex={0}><table><caption className="sr-only">{titulo}</caption>{children}</table></div>;
}

function Cabecera({ columnas }: { columnas: Array<{ nombre: string; numerica?: boolean }> }) {
  return <thead><tr>{columnas.map(({ nombre, numerica }) => <th key={nombre} scope="col" className={numerica ? "numerico" : undefined}>{nombre}</th>)}</tr></thead>;
}

function TablaDeTotales({ totales, titulo }: { totales: ResumenDePeriodo["totales"]; titulo: string }) {
  const cifras = [
    ["Jornadas trabajadas", totales.jornadasTrabajadas], ["Horas trabajadas", formatearDuracion(totales.minutosTrabajados)], ["Faltas", totales.noAsistencias.falta],
    ["Descansos", totales.noAsistencias.descanso], ["Feriados", totales.noAsistencias.feriado], ["Vacaciones", totales.noAsistencias.vacaciones],
    ["Permisos", totales.noAsistencias.permiso], ["Suspensiones", totales.noAsistencias.suspension], ["Tardanzas", totales.cantidadTardanzas],
    ["Horas penalizadas", formatearDuracion(totales.minutosPenalizados)],
  ] as const;
  return <TablaComparable titulo={titulo}><Cabecera columnas={cifras.map(([nombre]) => ({ nombre, numerica: true }))} /><tbody><tr>{cifras.map(([nombre, valor]) => <td key={nombre} className="numerico">{valor}</td>)}</tr></tbody></TablaComparable>;
}

function TablaDeHorasExtra({ horasExtra, titulo }: { horasExtra: FilaDeResumen["horasExtra"]; titulo: string }) {
  const cifras = [
    ["Pendientes 25%", horasExtra.pendiente.minutosAl25], ["Pendientes 35%", horasExtra.pendiente.minutosAl35],
    ["Aprobadas 25%", horasExtra.aprobada.minutosAl25], ["Aprobadas 35%", horasExtra.aprobada.minutosAl35],
    ["Descartadas 25%", horasExtra.descartada.minutosAl25], ["Descartadas 35%", horasExtra.descartada.minutosAl35],
  ] as const;
  return <TablaComparable titulo={titulo}><Cabecera columnas={cifras.map(([nombre]) => ({ nombre, numerica: true }))} /><tbody><tr>{cifras.map(([nombre, minutos]) => <td key={nombre} className="numerico">{formatearDuracion(minutos)}</td>)}</tr></tbody></TablaComparable>;
}

function DetalleDiario({ fila }: { fila: FilaDeResumen }) {
  return <details><summary>Ver detalle diario</summary><TablaComparable titulo={`Detalle diario de ${fila.nombre} (${fila.dni})`}>
    <Cabecera columnas={[{ nombre: "Fecha" }, { nombre: "Sede de la jornada" }, { nombre: "Resultado real" }, { nombre: "Horario real" }, { nombre: "Tiempo trabajado", numerica: true }, { nombre: "Tardanza", numerica: true }, { nombre: "Penalización", numerica: true }, { nombre: "Hora extra" }]} />
    <tbody>{fila.jornadas.map((jornada) => <tr id={`jornada-${fila.dni}-${jornada.fecha}`} key={jornada.fecha}><th scope="row">{jornada.fecha}</th><td>{jornada.sede ?? "Sin sede"}</td><td>{nombreDelResultado(jornada.resultado)}</td><td>{horarioReal(jornada)}</td><td className="numerico">{formatearDuracion(jornada.minutosTrabajados)}</td><td className="numerico">{formatearDuracion(jornada.tardanzaEnMinutos)}</td><td className="numerico">{formatearDuracion(jornada.minutosPenalizados)}</td><td>{jornada.horaExtra ? `${nombreDelEstadoExtra(jornada.horaExtra.estado)}: 25% ${formatearDuracion(jornada.horaExtra.minutosAl25)}, 35% ${formatearDuracion(jornada.horaExtra.minutosAl35)}` : "Sin hora extra"}</td></tr>)}</tbody>
  </TablaComparable></details>;
}

function enlaceDelBloqueo(bloqueo: BloqueoDePeriodo): string {
  if (bloqueo.tipo === "hora-extra") return `#jornada-${bloqueo.dni}-${bloqueo.fecha}`;
  return `/asistencias?vista=mensual&grupo=${encodeURIComponent(bloqueo.grupo)}&fecha=${bloqueo.fecha}&colaborador=${encodeURIComponent(bloqueo.dni)}`;
}

function nombreDelResultado(resultado: DetalleDeJornada["resultado"]): string {
  return { pendiente: "Pendiente de revisión", trabajada: "Trabajada", falta: "Falta", descanso: "Descanso", feriado: "Feriado", vacaciones: "Vacaciones", permiso: "Permiso", suspension: "Suspensión" }[resultado];
}

function nombreDelEstadoExtra(estado: NonNullable<DetalleDeJornada["horaExtra"]>["estado"]): string {
  return { pendiente: "Pendiente", aprobada: "Aprobada", descartada: "Descartada" }[estado];
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
