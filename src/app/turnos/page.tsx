import { redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeConfigurarGlobalmente, puedeConsultarHorarios, puedeOperarAsistenciaDelGrupo } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDePlanesSemanales } from "@/turnos/casos-de-uso-planes-semanales";
import { diasDeLaSemana, inicioDeSemana } from "@/turnos/semana";
import { repositorioDeGrupos, repositorioDeModelosDeHorario, repositorioDeTurnos } from "@/turnos/servicio";

import { PlanificadorMensual } from "./planificador-mensual";
import { PlanificadorSemanal } from "./planificador-semanal";
import { SinPermiso } from "../sin-permiso";

export const dynamic = "force-dynamic";

export default async function PaginaDeTurnos({ searchParams }: { searchParams: Promise<{ semana?: string; equipo?: string; copiar?: string; vista?: string; mes?: string; colaborador?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeConsultarHorarios(actor)) return <SinPermiso>Su rol no permite consultar Horarios. Pida al Administrador del sistema que revise su rol o los grupos que tiene asignados.</SinPermiso>;
  const parametros = await searchParams;
  const semana = inicioDeSemana(parametros.semana ?? new Date().toISOString().slice(0, 10));
  const grupos = await repositorioDeGrupos.listarOperablesPor(actor);
  const equiposProcesados = await repositorioDeTurnos.listarEquiposConProcesamientosDeSemana(semana);
  const equipos = [...new Set([...grupos, ...equiposProcesados.filter((equipo) => puedeOperarAsistenciaDelGrupo(actor, equipo))])].sort();
  const equipo = equipos.includes(parametros.equipo ?? "") ? parametros.equipo! : equipos[0];
  if (!equipo) return <main className="contenido pagina pagina-ajustes pagina-turnos"><header className="encabezado encabezado-pagina"><div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>Planificación de horarios</h1><p>Asigna sede y modelo de horario en el horario semanal de cada persona del grupo.</p></div></header><section className="tile panel"><div className="estado-vacio"><h3>No hay grupos operativos</h3>{puedeConfigurarGlobalmente(actor)
    ? <p>Todavía no hay una sede activa asignada a un grupo, así que no hay horarios que planificar. Asígnela en <a href="/configuracion">Configuración</a>.</p>
    : <p>Todavía no hay una sede activa asignada a un grupo que usted gestione, así que no hay horarios que planificar. Pida al Administrador del sistema que la asigne en Configuración.</p>}</div></section></main>;
  if (parametros.vista === "mensual") {
    const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(parametros.mes ?? "") ? parametros.mes! : (parametros.semana ?? new Date().toISOString().slice(0, 10)).slice(0, 7);
    const ultimoDia = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
    const dias = Array.from({ length: ultimoDia }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`);
    const colaboradores = await repositorioDeTurnos.listarColaboradoresActivosPorEquipo(equipo);
    const persona = colaboradores.find(c => c.dni === parametros.colaborador) ?? colaboradores[0];
    const [borradores, publicados, condiciones, vigencias, sedes] = await Promise.all([
      repositorioDeTurnos.listarBorradoresDelEquipoEnRango(equipo, dias[0], dias.at(-1)!),
      repositorioDeTurnos.listarPublicadosPorColaboradoresYSemana(persona ? [persona.dni] : [], dias[0], dias.at(-1)!),
      repositorioDeTurnos.consultarEstadoDeFechas(dias[0], dias.at(-1)!),
      persona ? repositorioDeTurnos.listarVigenciasConfirmadas(persona.dni) : Promise.resolve([]),
      repositorioDeTurnos.listarSedesActivasPorGrupo(equipo),
    ]);
    const modelos = (await Promise.all(sedes.map(sede => repositorioDeModelosDeHorario.listarPorSede(sede)))).flat();
    const semanas = [...new Set(dias.map(inicioDeSemana))];
    const procesamientos = persona ? await Promise.all(semanas.map(semanaDelMes => repositorioDeTurnos.listarProcesamientosDeSemana(semanaDelMes, equipo))) : [];
    const semanasProcesadas = semanas.filter((_, indice) => procesamientos[indice]?.includes(persona!.dni));
    return <main className="contenido pagina pagina-ajustes pagina-turnos"><header className="encabezado encabezado-pagina"><div><h1>Planificación de horarios</h1><p>Edite el día desde el mes. Publique los cambios desde su semana.</p></div></header><PlanificadorMensual key={`${mes}:${equipo}:${persona?.dni ?? ""}`} sedes={sedes} modelos={modelos} soloLectura={!puedeOperarAsistenciaDelGrupo(actor, equipo)} mes={mes} equipo={equipo} equipos={equipos} colaboradores={colaboradores} dni={persona?.dni} dias={dias} borradores={borradores} publicados={publicados} vigencias={vigencias} fechasCerradas={condiciones.cerradas} semanasProcesadas={semanasProcesadas} /></main>;
  }
  const dias = diasDeLaSemana(semana);
  const colaboradoresActivos = await repositorioDeTurnos.listarColaboradoresActivosPorEquipo(equipo);
  const colaboradoresProcesados = await repositorioDeTurnos.listarColaboradoresProcesadosPorSemanaYEquipo(semana, equipo);
  const colaboradores = [...new Map([...colaboradoresActivos, ...colaboradoresProcesados].map((colaborador) => [colaborador.dni, colaborador])).values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const plan = await crearCasosDeUsoDePlanesSemanales(repositorioDeTurnos, { obtenerActorActual }).obtenerOCrear(semana, equipo);
  const publicados = await repositorioDeTurnos.listarPublicadosPorColaboradoresYSemana(colaboradores.map(({ dni }) => dni), dias[0], dias.at(-1)!);
  const procesados = await repositorioDeTurnos.listarProcesamientosDeSemana(semana, equipo);
  const sedes = await repositorioDeTurnos.listarSedesActivasPorGrupo(equipo);
  const modelos = (await Promise.all(sedes.map((sede) => repositorioDeModelosDeHorario.listarPorSede(sede)))).flat();
  // Relaciones laborales confirmadas por Recursos Humanos: fuera de ellas no se publica (ADR 0012).
  const vigencias = Object.fromEntries(await Promise.all(colaboradores.map(async ({ dni }) => [dni, await repositorioDeTurnos.listarVigenciasConfirmadas(dni)] as const)));
  // Fechas sin período de asistencia: se avisan en la grilla pero no bloquean la publicación.
  const { sinPeriodo } = await repositorioDeTurnos.consultarEstadoDeFechas(dias[0], dias.at(-1)!);
  return <main className="contenido pagina pagina-ajustes pagina-turnos"><header className="encabezado encabezado-pagina"><div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>Planificación de horarios</h1><p>Asigna sede y modelo de horario en el horario semanal de cada persona del grupo.</p></div></header>
    <PlanificadorSemanal actualizadoEn={plan.actualizadoEn?.toISOString()} equipos={equipos} planId={plan.id} semana={semana} equipo={equipo} colaboradores={colaboradores} dias={dias} celdasIniciales={plan.celdas} publicados={publicados} procesados={procesados} modelos={modelos} sedes={sedes} vigencias={vigencias} fechasSinPeriodo={sinPeriodo} soloLectura={false} />
  </main>;
}
