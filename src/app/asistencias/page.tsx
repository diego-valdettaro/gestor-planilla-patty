import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { repositorioDeAsistencias } from "@/asistencias/servicio";
import { repositorioDeTurnos } from "@/turnos/servicio";

import { procesarHorarioSemanal } from "./actions";
import { CalendarioDeAsistencias } from "./calendario-de-asistencias";
import { ESTADOS_DE_CELDA_ASISTENCIA, NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA } from "./estado-de-celda";
import { FiltrosDeAsistencia } from "./filtros-de-asistencia";
import { resumirMes } from "./resumen-mensual";

export const dynamic = "force-dynamic";

interface PropiedadesDePagina { searchParams: Promise<{ colaborador?: string; mes?: string; fecha?: string }>; }

export default async function PaginaDeAsistencias({ searchParams }: PropiedadesDePagina) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") return <main className="centrado"><p>No tiene permiso para revisar asistencias.</p></main>;

  const parametros = await searchParams;
  const colaboradores = await repositorioDeTurnos.listarColaboradoresActivos();
  const colaborador = colaboradores.find((item) => item.idHuellero === parametros.colaborador) ?? colaboradores[0];
  const mes = esMes(parametros.mes) ? parametros.mes : new Date().toISOString().slice(0, 7);
  const { inicio, fin, dias } = diasDelMes(mes);
  const asistencias = colaborador ? await repositorioDeAsistencias.listarResumenMensual(colaborador.idHuellero, inicio, fin) : [];

  return <main className="contenido">
    <header className="encabezado"><div><p className="eyebrow">Administración y Finanzas</p><h1>Asistencias</h1><p>Revise un colaborador y su mes de trabajo.</p></div></header>
<FiltrosDeAsistencia colaborador={colaborador?.idHuellero} colaboradores={colaboradores} mes={mes} />
    {colaborador ? <ResumenDelMes dias={dias} asistencias={asistencias} /> : null}
    {colaborador ? <section className="tarjeta"><header className="encabezado-seccion"><div><h2>{colaborador.nombre}</h2><p>Haga clic en un día para registrar o ajustar su asistencia.</p></div></header><ul aria-label="Estados de asistencia" className="leyenda-estados">{ESTADOS_DE_CELDA_ASISTENCIA.map((estadoDeCelda) => <li className={`estado-color-${estadoDeCelda}`} key={estadoDeCelda}>{NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA[estadoDeCelda]}</li>)}</ul>{actor.rol === "finanzas" ? <form action={procesarHorarioSemanal} className="filtros"><input name="idHuellero" type="hidden" value={colaborador.idHuellero} /><label>Semana a procesar<input defaultValue={inicioDeSemanaDelMes(mes)} name="semana" required type="date" /></label><button type="submit">Procesar horario semanal</button></form> : null}<CalendarioDeAsistencias asistencias={asistencias} desfase={desfaseLunes(inicio)} dias={dias} idHuellero={colaborador.idHuellero} /></section> : <section className="estado-vacio"><h2>No hay colaboradores activos</h2><p>Registre un colaborador activo desde Configuración antes de revisar asistencias.</p></section>}
  </main>;
}

function esMes(valor: string | undefined): valor is string { return Boolean(valor && /^\d{4}-\d{2}$/.test(valor)); }
function diasDelMes(mes: string) { const [anio, numeroMes] = mes.split("-").map(Number); const ultimoDia = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate(); const inicio = `${mes}-01`; return { inicio, fin: `${mes}-${String(ultimoDia).padStart(2, "0")}`, dias: Array.from({ length: ultimoDia }, (_, indice) => `${mes}-${String(indice + 1).padStart(2, "0")}`) }; }
function desfaseLunes(fecha: string) { return (new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7; }
function inicioDeSemanaDelMes(mes: string) { const fecha = new Date(`${mes}-01T00:00:00Z`); fecha.setUTCDate(fecha.getUTCDate() - ((fecha.getUTCDay() + 6) % 7)); return fecha.toISOString().slice(0, 10); }

function ResumenDelMes({ dias, asistencias }: { dias: string[]; asistencias: Awaited<ReturnType<typeof repositorioDeAsistencias.listarResumenMensual>> }) {
  const resumen = resumirMes(dias, asistencias);
  return <section aria-label="Resumen del mes" className="resumen-mensual">
    <div><strong>{resumen.porEstado["sin-planificacion"]}</strong><span>Sin planificación</span></div><div><strong>{resumen.porEstado.registrada}</strong><span>Registradas</span></div><div><strong>{resumen.porEstado.esperada}</strong><span>Esperadas</span></div><div><strong>{resumen.porEstado["pendiente-de-revision"]}</strong><span>Pendientes de revisión</span></div><div><strong>{resumen.porEstado.liquidado}</strong><span>Liquidadas</span></div><div><strong>{horas(resumen.minutosTrabajados)}</strong><span>Horas trabajadas</span></div><div><strong>{resumen.minutosDeTardanza} min</strong><span>Tardanzas</span></div><div><strong>{resumen.minutosAl25} / {resumen.minutosAl35} min</strong><span>Extras 25% / 35%</span></div>
  </section>;
}

function horas(minutos: number): string { return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, "0")} min`; }
