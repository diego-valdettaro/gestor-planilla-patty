import React from "react";
import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { BotonDeAccionConfirmada } from "@/app/boton-de-accion-confirmada";
import { calcularSugerenciaDePeriodo } from "@/periodos/periodo-planilla";
import { repositorioDePeriodos } from "@/periodos/servicio";
import { repositorioDeTurnos } from "@/turnos/servicio";

import { cerrarPeriodoDesdeFormulario, reabrirPeriodoDesdeFormulario } from "./actions";
import { CreadorDePeriodo } from "./creador-de-periodo";

export const dynamic = "force-dynamic";

export default async function PaginaDePeriodos({ searchParams }: { searchParams: Promise<{ periodoId?: string; sede?: string; idHuellero?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") return <main className="centrado"><section className="estado-vacio"><h1>Sin permiso</h1><p>Su rol no permite consultar períodos de planilla.</p></section></main>;

  const query = await searchParams;
  const [periodos, sedes, colaboradores] = await Promise.all([
    repositorioDePeriodos.listar(),
    repositorioDeTurnos.listarSedesConColaboradoresActivos(),
    repositorioDeTurnos.listarColaboradoresActivos(),
  ]);
  const periodo = periodos.find((item) => item.id === query.periodoId) ?? periodos.find((item) => item.estado === "abierto") ?? periodos[0];
  const resumen = periodo ? await repositorioDePeriodos.listarResumen({ periodoId: periodo.id, sede: query.sede, idHuellero: query.idHuellero }) : [];
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
        <a className="boton-secundario" href={`/api/periodos/${periodo.id}/exportar?sede=${encodeURIComponent(query.sede ?? "")}&idHuellero=${encodeURIComponent(query.idHuellero ?? "")}`}>Exportar XLSX</a>
      </form>
      <section className="tarjeta panel">
        <header className="panel-cabecera"><div><h2>Período {periodo.inicio} a {periodo.fin}</h2><p>Estado actual: {periodo.estado === "abierto" ? <span className="insignia ok">Abierto</span> : <span className="insignia neutro">Cerrado</span>}</p></div>{periodo.estado === "abierto" && actor.rol === "finanzas" ? <BotonDeAccionConfirmada accion={cerrarPeriodoDesdeFormulario} confirmar="Cerrar período" descripcion="Ya no se podrán importar ni modificar asistencias de este período hasta que lo reabra con un motivo." etiqueta="Cerrar período" titulo="¿Cerrar este período de planilla?"><input type="hidden" name="periodoId" value={periodo.id} /></BotonDeAccionConfirmada> : null}</header>
        {periodo.estado === "cerrado" && actor.rol === "finanzas" ? <form action={reabrirPeriodoDesdeFormulario} className="filtros"><input type="hidden" name="periodoId" value={periodo.id} /><label>Motivo de reapertura<input name="motivo" required /></label><button type="submit">Reabrir período</button></form> : null}
        {resumen.length ? <div className="panel-tabla"><table><thead><tr><th>Colaborador</th><th>Sede</th><th>Horas trabajadas</th><th>Tardanzas</th><th>Saldo penalizado</th><th>Extras 25%</th><th>Extras 35%</th></tr></thead><tbody>{resumen.map((fila) => <tr key={fila.idHuellero}><td>{fila.nombre} ({fila.idHuellero})</td><td>{fila.sede}</td><td>{(fila.minutosTrabajados / 60).toFixed(2)}</td><td>{fila.cantidadTardanzas}</td><td>{(fila.minutosPenalizados / 60).toFixed(2)}</td><td>{(fila.minutosAl25 / 60).toFixed(2)}</td><td>{(fila.minutosAl35 / 60).toFixed(2)}</td></tr>)}</tbody></table></div> : <section className="estado-vacio"><h3>Sin resultados</h3><p>No hay asistencias que coincidan con los filtros elegidos.</p></section>}
      </section>
    </> : <section className="estado-vacio"><h2>No hay períodos de planilla</h2><p>Cuando haya un período abierto, aquí podrá revisar y exportar sus totales.</p></section>}
  </main>;
}
