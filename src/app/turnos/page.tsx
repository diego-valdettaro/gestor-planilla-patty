import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDePlanesSemanales } from "@/turnos/casos-de-uso-planes-semanales";
import { diasDeLaSemana, inicioDeSemana } from "@/turnos/semana";
import { repositorioDeModelosDeHorario, repositorioDeTurnos } from "@/turnos/servicio";

import { PlanificadorSemanal } from "./planificador-semanal";

export const dynamic = "force-dynamic";

export default async function PaginaDeTurnos({ searchParams }: { searchParams: Promise<{ semana?: string; equipo?: string; copiar?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "operaciones" && actor.rol !== "administracion") return <main className="centrado"><p>No tiene permiso para consultar horarios.</p></main>;
  const parametros = await searchParams;
  const equipos = await repositorioDeTurnos.listarEquiposOperativos();
  const equipo = parametros.equipo === "tiendas" || parametros.equipo === "taller" ? parametros.equipo : equipos[0];
  const semana = inicioDeSemana(parametros.semana ?? new Date().toISOString().slice(0, 10));
  if (!equipo) return <main className="contenido"><p>Asigne las sedes activas a un equipo operativo desde Configuración.</p></main>;
  const dias = diasDeLaSemana(semana);
  const colaboradores = await repositorioDeTurnos.listarColaboradoresActivosPorEquipo(equipo);
  const plan = await crearCasosDeUsoDePlanesSemanales(repositorioDeTurnos, { obtenerActorActual }).obtenerOCrear(semana, equipo);
  const publicados = await repositorioDeTurnos.listarPublicadosPorColaboradoresYSemana(colaboradores.map(({ idHuellero }) => idHuellero), dias[0], dias.at(-1)!);
  const sedes = [...new Set(colaboradores.map(({ sede }) => sede))];
  const modelos = (await Promise.all(sedes.map((sede) => repositorioDeModelosDeHorario.listarPorSede(sede)))).flat();
  return <main className="contenido contenido-turnos"><section className="plan-semanal"><header className="barra-plan-semanal"><div><p className="eyebrow">{actor.rol === "administracion" ? "Administración" : "Operaciones"}</p><h1>Plan semanal</h1></div><p className="rango-semana">{dias[0]} al {dias.at(-1)}</p></header>
    <PlanificadorSemanal planId={plan.id} semana={semana} equipo={equipo} colaboradores={colaboradores} dias={dias} celdasIniciales={plan.celdas} publicados={publicados} modelos={modelos} />
  </section></main>;
}
