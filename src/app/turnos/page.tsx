import { redirect } from "next/navigation";
import Link from "next/link";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDePlanesSemanales } from "@/turnos/casos-de-uso-planes-semanales";
import { diasDeLaSemana, inicioDeSemana } from "@/turnos/semana";
import { repositorioDeGrupos, repositorioDeModelosDeHorario, repositorioDeTurnos } from "@/turnos/servicio";

import { PlanificadorSemanal } from "./planificador-semanal";

export const dynamic = "force-dynamic";

export default async function PaginaDeTurnos({ searchParams }: { searchParams: Promise<{ semana?: string; equipo?: string; copiar?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "operaciones" && actor.rol !== "administracion") return <main className="centrado"><p>No tiene permiso para consultar horarios.</p></main>;
  const parametros = await searchParams;
  const semana = inicioDeSemana(parametros.semana ?? new Date().toISOString().slice(0, 10));
  const grupos = await repositorioDeGrupos.listar();
  const equiposProcesados = await repositorioDeTurnos.listarEquiposConProcesamientosDeSemana(semana);
  const equipos = [...new Set([...grupos, ...equiposProcesados])].sort();
  const equipo = equipos.includes(parametros.equipo ?? "") ? parametros.equipo! : equipos[0];
  if (!equipo) return <main className="contenido"><p>Asigne las sedes activas a un equipo operativo desde Configuración.</p></main>;
  const dias = diasDeLaSemana(semana);
  const colaboradoresActivos = await repositorioDeTurnos.listarColaboradoresActivosPorEquipo(equipo);
  const colaboradoresProcesados = await repositorioDeTurnos.listarColaboradoresProcesadosPorSemanaYEquipo(semana, equipo);
  const colaboradores = [...new Map([...colaboradoresActivos, ...colaboradoresProcesados].map((colaborador) => [colaborador.idHuellero, colaborador])).values()]
    .sort((a, b) => a.sede.localeCompare(b.sede) || a.nombre.localeCompare(b.nombre));
  const plan = await crearCasosDeUsoDePlanesSemanales(repositorioDeTurnos, { obtenerActorActual }).obtenerOCrear(semana, equipo);
  const publicados = await repositorioDeTurnos.listarPublicadosPorColaboradoresYSemana(colaboradores.map(({ idHuellero }) => idHuellero), dias[0], dias.at(-1)!);
  const procesados = await repositorioDeTurnos.listarProcesamientosDeSemana(semana, equipo);
  const sedes = [...new Set(colaboradores.map(({ sede }) => sede))];
  const modelos = (await Promise.all(sedes.map((sede) => repositorioDeModelosDeHorario.listarPorSede(sede)))).flat();
  return <main className="contenido contenido-turnos"><section className="plan-semanal"><header className="barra-plan-semanal"><div><p className="breadcrumb"><span>Operaciones</span> / Horarios</p><h1>Planificación de horarios</h1><p>Asigna sede y turno para cada persona del grupo.</p></div><Link className="crear-horario" href="/turnos"><span>＋</span> Crear horario</Link></header>
    <PlanificadorSemanal actualizadoEn={plan.actualizadoEn?.toISOString()} equipos={equipos} planId={plan.id} semana={semana} equipo={equipo} colaboradores={colaboradores} dias={dias} celdasIniciales={plan.celdas} publicados={publicados} procesados={procesados} modelos={modelos} />
  </section></main>;
}
