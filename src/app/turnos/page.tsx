import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDePlanesSemanales } from "@/turnos/casos-de-uso-planes-semanales";
import { crearConsultaSemanalPorEquipo } from "@/turnos/consulta-semanal-por-equipo";
import { revisarPlanSemanal } from "@/turnos/publicar-plan-semanal";
import { diasDeLaSemana, inicioDeSemana } from "@/turnos/semana";
import { repositorioDeTurnos } from "@/turnos/servicio";

import { borrarCeldaDelBorrador, guardarCeldaDelBorrador, publicarPlanSemanalDesdeGrilla } from "./actions";

export const dynamic = "force-dynamic";

interface PropiedadesDePagina {
  searchParams: Promise<{ semana?: string; equipo?: string }>;
}

const etiquetasDeEquipo = { tiendas: "Tiendas", taller: "Taller" };
const opcionesDeHorario = [
  { valor: "09:00|18:00|60", etiqueta: "09:00 a 18:00, 60 min de almuerzo" },
  { valor: "10:00|19:00|60", etiqueta: "10:00 a 19:00, 60 min de almuerzo" },
  { valor: "08:00|17:00|60", etiqueta: "08:00 a 17:00, 60 min de almuerzo" },
  { valor: "descanso", etiqueta: "Descanso" },
];

export default async function PaginaDeTurnos({ searchParams }: PropiedadesDePagina) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "operaciones" && actor.rol !== "administracion") return <main className="centrado"><p>No tiene permiso para consultar horarios.</p></main>;

  const parametros = await searchParams;
  const equipos = await repositorioDeTurnos.listarEquiposOperativos();
  const equipo = parametros.equipo === "tiendas" || parametros.equipo === "taller" ? parametros.equipo : equipos.includes("tiendas") ? "tiendas" : equipos[0];
  const semana = inicioDeSemana(parametros.semana ?? new Date().toISOString().slice(0, 10));
  const dias = diasDeLaSemana(semana);
  const colaboradores = equipo ? await repositorioDeTurnos.listarColaboradoresActivosPorEquipo(equipo) : [];
  const turnos = await repositorioDeTurnos.listarPublicadosPorColaboradoresYSemana(colaboradores.map((colaborador) => colaborador.idHuellero), dias[0], dias.at(-1)!);
  const grupos = crearConsultaSemanalPorEquipo({ dias, colaboradores, turnos });
  const plan = equipo ? await crearCasosDeUsoDePlanesSemanales(repositorioDeTurnos, { obtenerActorActual }).obtenerOCrear(semana, equipo) : undefined;
  const celdas = new Map(plan?.celdas.map((celda) => [`${celda.idHuellero}:${celda.fecha}`, celda]));
  const idsDeColaboradores = colaboradores.map((colaborador) => colaborador.idHuellero);
  const revision = plan ? await revisarPlanSemanal(repositorioDeTurnos, actor, plan.id, idsDeColaboradores) : { errores: [] };
  const erroresPorCelda = revision.errores.reduce((porCelda, error) => {
    const clave = `${error.idHuellero}:${error.fecha}`;
    porCelda.set(clave, [...(porCelda.get(clave) ?? []), error]);
    return porCelda;
  }, new Map<string, typeof revision.errores>());
  const personasConErrores = new Set(revision.errores.map((error) => error.idHuellero));

  return <main className="contenido">
    <header className="encabezado"><div><p className="eyebrow">{actor.rol === "administracion" ? "Administración" : "Operaciones"}</p><h1>Plan semanal en borrador</h1><p>Defina los horarios del equipo antes de publicarlos.</p></div></header>
    <form className="filtros" method="get"><label>Semana<input defaultValue={semana} name="semana" type="date" /></label><label>Equipo operativo<select defaultValue={equipo} name="equipo">{equipos.map((opcion) => <option key={opcion} value={opcion}>{etiquetasDeEquipo[opcion]}</option>)}</select></label><button type="submit">Ver semana</button></form>
    {!equipo ? <p>Asigne las sedes activas a un equipo operativo desde Configuración.</p> : grupos.length === 0 ? <p>No hay colaboradores activos en {etiquetasDeEquipo[equipo]}.</p> : <div className="grilla-consulta-semanal">
      <section className="tarjeta"><h2>Revisión para publicar</h2><p>{idsDeColaboradores.length - personasConErrores.size} personas listas; {personasConErrores.size} requieren revisión.</p><form action={publicarPlanSemanalDesdeGrilla}><input name="planId" type="hidden" value={plan!.id} />{colaboradores.map((colaborador) => <label key={colaborador.idHuellero}><input defaultChecked={!personasConErrores.has(colaborador.idHuellero)} disabled={personasConErrores.has(colaborador.idHuellero)} name="idHuellero" type="checkbox" value={colaborador.idHuellero} /> {colaborador.nombre}</label>)}<button type="submit">Publicar personas seleccionadas</button></form></section>
      {grupos.map((grupo) => <section className="tarjeta" key={grupo.sede}><h2>{grupo.sede}</h2><div className="tabla-semanal"><table><thead><tr><th>Colaborador</th>{dias.map((dia) => <th key={dia}><time>{dia}</time></th>)}</tr></thead><tbody>{grupo.colaboradores.map((colaborador) => <tr key={colaborador.idHuellero}><th>{colaborador.nombre}<small>{colaborador.idHuellero}</small></th>{dias.map((fecha) => {
        const celdaDelBorrador = celdas.get(`${colaborador.idHuellero}:${fecha}`);
        const horario = celdaDelBorrador?.descanso ? "descanso" : celdaDelBorrador ? `${celdaDelBorrador.entradaProgramada}|${celdaDelBorrador.salidaProgramada}|${celdaDelBorrador.minutosDeAlmuerzo}` : "";
        const estado = celdaDelBorrador ? celdaDelBorrador.descanso ? "descanso" : "borrador" : "sin-definir";
        const errores = erroresPorCelda.get(`${colaborador.idHuellero}:${fecha}`) ?? [];
        return <td className={`celda-turno ${estado}`} key={fecha}>
          <form action={guardarCeldaDelBorrador}>
            <input name="planId" type="hidden" value={plan!.id} />
            <input name="idHuellero" type="hidden" value={colaborador.idHuellero} />
            <input name="fecha" type="hidden" value={fecha} />
            <input name="sede" type="hidden" value={grupo.sede} />
            <select aria-label={`Horario de ${colaborador.nombre} para ${fecha}`} defaultValue={horario} name="horario">
              <option value="">Sin definir</option>
              {opcionesDeHorario.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
            </select>
            <button type="submit">Guardar</button>
            {celdaDelBorrador && <button formAction={borrarCeldaDelBorrador} type="submit">Borrar</button>}
            {errores.map(({ mensaje }) => <small key={mensaje} role="alert">{mensaje}</small>)}
          </form>
        </td>;
      })}</tr>)}</tbody></table></div></section>)}
      <h2>Horarios publicados</h2>
      {grupos.map((grupo) => <section className="tarjeta" key={`publicados-${grupo.sede}`}><h3>{grupo.sede}</h3><div className="tabla-semanal"><table><thead><tr><th>Colaborador</th>{dias.map((dia) => <th key={dia}><time>{dia}</time></th>)}</tr></thead><tbody>{grupo.colaboradores.map((colaborador) => <tr key={colaborador.idHuellero}><th>{colaborador.nombre}<small>{colaborador.idHuellero}</small></th>{colaborador.celdas.map((celda, indice) => <td className={`celda-turno ${celda.estado}`} key={dias[indice]}>{celda.estado === "sin-publicacion" ? "Sin publicación" : celda.estado === "descanso" ? <>Descanso<small>{celda.sede}</small></> : <>Publicado<small>{celda.sede} · {celda.entradaProgramada} a {celda.salidaProgramada}</small></>}</td>)}</tr>)}</tbody></table></div></section>)}
    </div>}
  </main>;
}
