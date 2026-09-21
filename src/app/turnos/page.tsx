import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDePlanesSemanales } from "@/turnos/casos-de-uso-planes-semanales";
import { diasDeLaSemana, inicioDeSemana } from "@/turnos/semana";
import { repositorioDeGrupos, repositorioDeModelosDeHorario, repositorioDeTurnos } from "@/turnos/servicio";

import { PlanificadorSemanal } from "./planificador-semanal";

export const dynamic = "force-dynamic";

export default async function PaginaDeTurnos({ searchParams }: { searchParams: Promise<{ semana?: string; equipo?: string; copiar?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "operaciones" && actor.rol !== "administracion" && actor.rol !== "finanzas") return <main className="centrado"><section className="estado-vacio"><h1>Sin permiso</h1><p>Su rol no permite consultar Horarios. Pida a Administración que revise su rol.</p></section></main>;
  const soloLectura = actor.rol === "finanzas";
  const parametros = await searchParams;
  const semana = inicioDeSemana(parametros.semana ?? new Date().toISOString().slice(0, 10));
  const grupos = await repositorioDeGrupos.listar();
  const equiposProcesados = await repositorioDeTurnos.listarEquiposConProcesamientosDeSemana(semana);
  const equipos = [...new Set([...grupos, ...equiposProcesados])].sort();
  const equipo = equipos.includes(parametros.equipo ?? "") ? parametros.equipo! : equipos[0];
  if (!equipo) return <main className="contenido"><section className="estado-vacio"><h1>No hay grupos operativos</h1>{actor.rol === "administracion"
    ? <p>Todavía no hay una sede activa asignada a un grupo, así que no hay horarios que planificar. Asígnela en <a href="/configuracion">Configuración</a>.</p>
    : <p>Todavía no hay una sede activa asignada a un grupo, así que no hay horarios que {actor.rol === "finanzas" ? "consultar" : "planificar"}. Pida a Administración que la asigne en Configuración.</p>}</section></main>;
  const dias = diasDeLaSemana(semana);
  const colaboradoresActivos = await repositorioDeTurnos.listarColaboradoresActivosPorEquipo(equipo);
  const colaboradoresProcesados = await repositorioDeTurnos.listarColaboradoresProcesadosPorSemanaYEquipo(semana, equipo);
  const colaboradores = [...new Map([...colaboradoresActivos, ...colaboradoresProcesados].map((colaborador) => [colaborador.idHuellero, colaborador])).values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const plan = await crearCasosDeUsoDePlanesSemanales(repositorioDeTurnos, { obtenerActorActual }).obtenerOCrear(semana, equipo);
  const publicados = await repositorioDeTurnos.listarPublicadosPorColaboradoresYSemana(colaboradores.map(({ idHuellero }) => idHuellero), dias[0], dias.at(-1)!);
  const procesados = await repositorioDeTurnos.listarProcesamientosDeSemana(semana, equipo);
  const sedes = await repositorioDeTurnos.listarSedesActivasPorGrupo(equipo);
  const modelos = (await Promise.all(sedes.map((sede) => repositorioDeModelosDeHorario.listarPorSede(sede)))).flat();
  return <main className="contenido contenido-turnos"><section className="plan-semanal"><header className="barra-plan-semanal"><div><p className="breadcrumb"><span>Operaciones</span> / Horarios</p><h1>Planificación de horarios</h1><p>{soloLectura ? "Consulta el horario semanal de cada persona del grupo. Su rol no permite editarlo ni publicarlo." : "Asigna sede y modelo de horario para cada persona del grupo."}</p></div></header>
    <PlanificadorSemanal actualizadoEn={plan.actualizadoEn?.toISOString()} equipos={equipos} planId={plan.id} semana={semana} equipo={equipo} colaboradores={colaboradores} dias={dias} celdasIniciales={plan.celdas} publicados={publicados} procesados={procesados} modelos={modelos} sedes={sedes} soloLectura={soloLectura} />
  </section></main>;
}
