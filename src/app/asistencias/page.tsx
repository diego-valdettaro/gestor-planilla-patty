import { redirect } from "next/navigation";
import React from "react";

import { NOMBRE_DE_ROL, puedeConfigurarGlobalmente, puedeConsultarAsistencias, puedeRevisarAsistencias } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { repositorioDeAsistencias } from "@/asistencias/servicio";
import { diasDeLaSemana, inicioDeSemana } from "@/turnos/semana";
import { repositorioDeGrupos, repositorioDeTurnos } from "@/turnos/servicio";

import { CalendarioDeAsistencias } from "./calendario-de-asistencias";
import { DialogoConfirmacionPorRango } from "./dialogo-confirmacion-por-rango";
import { ESTADOS_DE_CELDA_ASISTENCIA, NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA } from "./estado-de-celda";
import { FiltrosDeAsistencia } from "./filtros-de-asistencia";
import { MatrizSemanalDeAsistencias } from "./matriz-semanal-de-asistencias";

export const dynamic = "force-dynamic";

interface PropiedadesDePagina {
  searchParams: Promise<{ colaborador?: string; fecha?: string; grupo?: string; semana?: string; vista?: string }>;
}

export default async function PaginaDeAsistencias({ searchParams }: PropiedadesDePagina) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeConsultarAsistencias(actor)) return <main className="centrado"><section className="estado-vacio"><h1>Sin permiso</h1><p>Su rol no permite consultar asistencias. Pueden hacerlo los gerentes de área de grupos que gestionan asistencia, Finanzas y el Administrador del sistema.</p></section></main>;

  const soloLectura = !puedeRevisarAsistencias(actor);
  const parametros = await searchParams;
  const grupos = await repositorioDeGrupos.listarOperablesPor(actor);
  const grupo = grupos.includes(parametros.grupo ?? "") ? parametros.grupo! : grupos[0];
  const fecha = fechaValida(parametros.fecha) ? parametros.fecha : fechaValida(parametros.semana) ? parametros.semana : new Date().toISOString().slice(0, 10);
  const vista = parametros.vista === "mensual" ? "mensual" : "semanal";
  const semana = inicioDeSemana(fecha);
  const dias = diasDeLaSemana(semana);
  const colaboradores = grupo ? await repositorioDeTurnos.listarColaboradoresActivosPorEquipo(grupo) : [];
  const colaborador = colaboradores.find(({ dni }) => dni === parametros.colaborador) ?? colaboradores[0];
  const diasDelMes = vista === "mensual" ? fechasDelMes(fecha.slice(0, 7)) : [];
  const asistenciasSemanales = vista === "semanal"
    ? await repositorioDeAsistencias.listarResumenSemanal(colaboradores.map(({ dni }) => dni), dias[0], dias.at(-1)!)
    : [];
  const asistenciasMensuales = vista === "mensual" && colaborador
    ? await repositorioDeAsistencias.listarResumenMensual(colaborador.dni, diasDelMes[0], diasDelMes.at(-1)!)
    : [];
  const rangoVisible = vista === "mensual"
    ? { inicio: diasDelMes[0], fin: diasDelMes.at(-1)! }
    : { inicio: dias[0], fin: dias.at(-1)! };
  const colaboradoresDelRango = vista === "mensual" ? colaborador ? [colaborador] : [] : colaboradores;

  return <main className="contenido">
    <header className="encabezado"><div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>Asistencias</h1><p>{soloLectura ? "Consulte las jornadas por grupo operativo. Su rol no permite registrar ni confirmar asistencias: lo hace el gerente de área de cada grupo." : vista === "mensual" ? "Revise el mes completo de un colaborador." : "Revise las jornadas semanales por grupo operativo."}</p></div></header>
    {grupo ? <><FiltrosDeAsistencia colaborador={colaborador?.dni} colaboradores={colaboradores} fecha={fecha} grupo={grupo} grupos={grupos} vista={vista} />{vista === "mensual" && !colaborador ? <section className="estado-vacio"><h2>No hay colaboradores activos</h2><p>Registre un colaborador activo en este grupo antes de revisar sus asistencias mensuales.</p></section> : <section className="tarjeta"><header className="encabezado-seccion encabezado-confirmacion-rango"><div><h2>{vista === "mensual" ? colaborador?.nombre : grupo}</h2><p>{vista === "mensual" ? "El calendario muestra los resultados diarios del colaborador." : "La matriz muestra las jornadas de los colaboradores del grupo."}</p></div>{!soloLectura && <DialogoConfirmacionPorRango colaboradores={colaboradoresDelRango} finInicial={rangoVisible.fin} inicioInicial={rangoVisible.inicio} key={`${vista}-${rangoVisible.inicio}-${rangoVisible.fin}-${colaborador?.dni ?? grupo}`} />}</header><ul aria-label="Estados de asistencia" className="leyenda-estados">{ESTADOS_DE_CELDA_ASISTENCIA.map((estadoDeCelda) => <li className={`estado-color-${estadoDeCelda}`} key={estadoDeCelda}>{NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA[estadoDeCelda]}</li>)}</ul>{vista === "mensual" && colaborador ? <CalendarioDeAsistencias asistencias={asistenciasMensuales} desfase={desfaseLunes(diasDelMes[0])} dias={diasDelMes} dni={colaborador.dni} nombreColaborador={colaborador.nombre} soloLectura={soloLectura} /> : <MatrizSemanalDeAsistencias asistencias={asistenciasSemanales} colaboradores={colaboradores} dias={dias} />}</section>}</> : <section className="estado-vacio"><h2>No hay grupos operativos</h2>{puedeConfigurarGlobalmente(actor) ? <p>Asigne una sede activa a un grupo operativo en <a href="/configuracion">Configuración</a> antes de revisar asistencias.</p> : <p>Pida al Administrador del sistema que asigne una sede activa a un grupo operativo antes de revisar asistencias.</p>}</section>}
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
