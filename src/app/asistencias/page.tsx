import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { repositorioDeAsistencias } from "@/asistencias/servicio";
import { repositorioDeImportaciones } from "@/importaciones/servicio";
import { repositorioDeTurnos } from "@/turnos/servicio";

import { ajustarAsistencia, confirmarAsistencia, importarAsistencia, registrarEstadoManual } from "./actions";

export const dynamic = "force-dynamic";

interface PropiedadesDePagina { searchParams: Promise<{ colaborador?: string; mes?: string; fecha?: string }>; }

export default async function PaginaDeAsistencias({ searchParams }: PropiedadesDePagina) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") return <main className="centrado"><p>No tiene permiso para revisar asistencias.</p></main>;

  const parametros = await searchParams;
  const [sedes, colaboradores] = await Promise.all([repositorioDeTurnos.listarSedesConColaboradoresActivos(), repositorioDeTurnos.listarColaboradoresActivos()]);
  const colaborador = colaboradores.find((item) => item.idHuellero === parametros.colaborador) ?? colaboradores[0];
  const mes = esMes(parametros.mes) ? parametros.mes : new Date().toISOString().slice(0, 7);
  const { inicio, fin, dias } = diasDelMes(mes);
  const asistencias = colaborador ? await repositorioDeAsistencias.listarResumenMensual(colaborador.idHuellero, inicio, fin) : [];
  const porFecha = new Map(asistencias.map((asistencia) => [asistencia.fecha, asistencia]));
  const fechaSeleccionada = parametros.fecha && porFecha.has(parametros.fecha) ? parametros.fecha : undefined;
  const detalle = fechaSeleccionada ? porFecha.get(fechaSeleccionada) : undefined;

  return <main className="contenido">
    <header className="encabezado"><div><p className="eyebrow">Administración y Finanzas</p><h1>Asistencias</h1><p>Revise un colaborador y su mes de trabajo.</p></div></header>
    <section className="tarjeta"><h2>Importar marcas</h2><form action={importarAsistencia} className="filtros"><label>Sede<select name="sede" required>{sedes.map((sede) => <option key={sede}>{sede}</option>)}</select></label><label>Semana<input name="semana" required type="date" /></label><label>Archivo del huellero<input accept=".xlsx,.xls,.csv" name="archivo" required type="file" /></label><button type="submit">Importar</button></form></section>
    <form className="filtros selector-asistencia" method="get"><label>Colaborador<select defaultValue={colaborador?.idHuellero} name="colaborador">{colaboradores.map((item) => <option key={item.idHuellero} value={item.idHuellero}>{item.nombre} · {item.idHuellero}</option>)}</select></label><label>Mes<input defaultValue={mes} name="mes" type="month" /></label><button type="submit">Ver calendario</button></form>
    {colaborador ? <section className="tarjeta"><header className="encabezado-seccion"><div><h2>{colaborador.nombre}</h2><p>{mes} · cada día muestra entrada, salida y estado.</p></div></header><div className="calendario"><div className="dias-semana">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((dia) => <span key={dia}>{dia}</span>)}</div><div className="celdas-calendario">{Array.from({ length: desfaseLunes(inicio) }).map((_, indice) => <span className="celda-vacia" key={`vacia-${indice}`} />)}{dias.map((fecha) => {
      const asistencia = porFecha.get(fecha);
      const enlace = `/asistencias?colaborador=${encodeURIComponent(colaborador.idHuellero)}&mes=${mes}&fecha=${fecha}`;
      return <Link className={`dia-calendario ${asistencia ? `estado-${asistencia.estado}` : "sin-asistencia"}`} href={enlace} key={fecha}><time>{Number(fecha.slice(-2))}</time>{asistencia ? <><strong>{etiquetaEstado(asistencia.estado, asistencia.estadoManual)}</strong><span>{asistencia.entrada ?? "sin entrada"}</span><span>{asistencia.salida ?? "sin salida"}</span></> : <span>Sin programación</span>}</Link>;
    })}</div></div></section> : <p>No hay colaboradores activos.</p>}
    {detalle && colaborador && fechaSeleccionada ? <section className="tarjeta detalle-asistencia"><h2>Detalle del {fechaSeleccionada}</h2><p>Estado: {etiquetaEstado(detalle.estado, detalle.estadoManual)}. Entrada: {detalle.entrada ?? "sin registro"}. Salida: {detalle.salida ?? "sin registro"}.</p>{detalle.estado === "pendiente" ? <><form action={confirmarAsistencia} className="filtros"><input name="idHuellero" type="hidden" value={colaborador.idHuellero} /><input name="fecha" type="hidden" value={fechaSeleccionada} /><label>Entrada real<input name="entradaReal" required defaultValue={detalle.entrada ?? ""} /></label><label>Salida real<input name="salidaReal" required defaultValue={detalle.salida ?? ""} /></label><button type="submit">Confirmar asistencia</button></form><form action={registrarEstadoManual} className="filtros"><input name="idHuellero" type="hidden" value={colaborador.idHuellero} /><input name="fecha" type="hidden" value={fechaSeleccionada} /><label>Estado manual<select name="tipo" required defaultValue=""><option disabled value="">Seleccionar</option><option value="falta">Falta</option><option value="descanso">Descanso</option><option value="feriado">Feriado</option><option value="vacaciones">Vacaciones</option><option value="permiso">Permiso</option><option value="suspension">Suspensión</option></select></label><label>Comentario<input name="comentario" required /></label><button type="submit">Registrar estado</button></form></> : null}{detalle.estado === "confirmada" ? <form action={ajustarAsistencia} className="filtros"><input name="idHuellero" type="hidden" value={colaborador.idHuellero} /><input name="fecha" type="hidden" value={fechaSeleccionada} /><label>Entrada real<input name="entradaReal" required defaultValue={detalle.entrada ?? ""} /></label><label>Salida real<input name="salidaReal" required defaultValue={detalle.salida ?? ""} /></label><label>Motivo<input name="motivo" required /></label><button type="submit">Guardar ajuste</button></form> : null}</section> : null}
  </main>;
}

function esMes(valor: string | undefined): valor is string { return Boolean(valor && /^\d{4}-\d{2}$/.test(valor)); }
function diasDelMes(mes: string) { const [anio, numeroMes] = mes.split("-").map(Number); const ultimoDia = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate(); const inicio = `${mes}-01`; return { inicio, fin: `${mes}-${String(ultimoDia).padStart(2, "0")}`, dias: Array.from({ length: ultimoDia }, (_, indice) => `${mes}-${String(indice + 1).padStart(2, "0")}`) }; }
function desfaseLunes(fecha: string) { return (new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7; }
function etiquetaEstado(estado: "pendiente" | "confirmada" | "manual", manual: string | null) { if (estado === "manual") return manual ?? "Estado manual"; return estado === "confirmada" ? "Confirmada" : "Pendiente"; }
