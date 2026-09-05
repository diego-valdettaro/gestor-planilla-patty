import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { repositorioDeAsistencias } from "@/asistencias/servicio";
import { repositorioDeImportaciones } from "@/importaciones/servicio";
import { repositorioDeTurnos } from "@/turnos/servicio";

import { procesarHorarioSemanal } from "./actions";
import { CalendarioDeAsistencias } from "./calendario-de-asistencias";
import { FormularioDeImportacion } from "./formulario-de-importacion";

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

  return <main className="contenido">
    <header className="encabezado"><div><p className="eyebrow">Administración y Finanzas</p><h1>Asistencias</h1><p>Revise un colaborador y su mes de trabajo.</p></div></header>
    <FormularioDeImportacion sedes={sedes} />
    <form className="filtros selector-asistencia" method="get"><label>Colaborador<select defaultValue={colaborador?.idHuellero} name="colaborador">{colaboradores.map((item) => <option key={item.idHuellero} value={item.idHuellero}>{item.nombre} · {item.idHuellero}</option>)}</select></label><label>Mes<input defaultValue={mes} name="mes" type="month" /></label><button type="submit">Ver calendario</button></form>
    {colaborador ? <section className="tarjeta"><header className="encabezado-seccion"><div><h2>{colaborador.nombre}</h2><p>Haga clic en un día para registrar o ajustar su asistencia.</p></div></header><ul aria-label="Estados de asistencia" className="leyenda-estados"><li className="confirmada">Confirmada</li><li className="pendiente">Pendiente de revisión</li><li className="manual">Estado manual</li><li className="sin-programacion">Sin programación</li></ul>{actor.rol === "finanzas" ? <form action={procesarHorarioSemanal} className="filtros"><input name="idHuellero" type="hidden" value={colaborador.idHuellero} /><label>Semana a procesar<input defaultValue={inicioDeSemanaDelMes(mes)} name="semana" required type="date" /></label><button type="submit">Procesar horario semanal</button></form> : null}<CalendarioDeAsistencias asistencias={asistencias} desfase={desfaseLunes(inicio)} dias={dias} idHuellero={colaborador.idHuellero} /></section> : <section className="estado-vacio"><h2>No hay colaboradores activos</h2><p>Registre un colaborador activo desde Configuración antes de revisar asistencias.</p></section>}
  </main>;
}

function esMes(valor: string | undefined): valor is string { return Boolean(valor && /^\d{4}-\d{2}$/.test(valor)); }
function diasDelMes(mes: string) { const [anio, numeroMes] = mes.split("-").map(Number); const ultimoDia = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate(); const inicio = `${mes}-01`; return { inicio, fin: `${mes}-${String(ultimoDia).padStart(2, "0")}`, dias: Array.from({ length: ultimoDia }, (_, indice) => `${mes}-${String(indice + 1).padStart(2, "0")}`) }; }
function desfaseLunes(fecha: string) { return (new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7; }
function inicioDeSemanaDelMes(mes: string) { const fecha = new Date(`${mes}-01T00:00:00Z`); fecha.setUTCDate(fecha.getUTCDate() - ((fecha.getUTCDay() + 6) % 7)); return fecha.toISOString().slice(0, 10); }
