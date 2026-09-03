import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDePlanesSemanales } from "@/turnos/casos-de-uso-planes-semanales";
import { crearConsultaSemanalPorEquipo } from "@/turnos/consulta-semanal-por-equipo";
import { revisarPlanSemanal } from "@/turnos/publicar-plan-semanal";
import { diasDeLaSemana, desplazarFecha, inicioDeSemana } from "@/turnos/semana";
import { repositorioDeModelosDeHorario, repositorioDeTurnos } from "@/turnos/servicio";

import {
  aplicarHorarioEnLoteAlBorrador,
  borrarCeldaDelBorrador,
  copiarSemanaAnteriorEnBorrador,
  guardarCeldaDelBorrador,
  publicarPlanSemanalDesdeGrilla,
} from "./actions";

export const dynamic = "force-dynamic";

interface PropiedadesDePagina {
  searchParams: Promise<{ semana?: string; equipo?: string }>;
}

const etiquetasDeEquipo = { tiendas: "Tiendas", taller: "Taller" };
const opcionesDeHorario = [
  { valor: "09:00|18:00", etiqueta: "09:00 a 18:00" },
  { valor: "10:00|19:00", etiqueta: "10:00 a 19:00" },
  { valor: "08:00|17:00", etiqueta: "08:00 a 17:00" },
  { valor: "descanso", etiqueta: "Descanso" },
];

export default async function PaginaDeTurnos({ searchParams }: PropiedadesDePagina) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "operaciones" && actor.rol !== "administracion") return <main className="centrado"><p>No tiene permiso para consultar horarios.</p></main>;

  const parametros = await searchParams;
  const equipos = await repositorioDeTurnos.listarEquiposOperativos();
  const equipo = parametros.equipo === "tiendas" || parametros.equipo === "taller"
    ? parametros.equipo
    : equipos.includes("tiendas") ? "tiendas" : equipos[0];
  const semana = inicioDeSemana(parametros.semana ?? new Date().toISOString().slice(0, 10));
  const dias = diasDeLaSemana(semana);
  const colaboradores = equipo ? await repositorioDeTurnos.listarColaboradoresActivosPorEquipo(equipo) : [];
  const turnos = await repositorioDeTurnos.listarPublicadosPorColaboradoresYSemana(
    colaboradores.map((colaborador) => colaborador.idHuellero),
    dias[0],
    dias.at(-1)!,
  );
  const grupos = crearConsultaSemanalPorEquipo({ dias, colaboradores, turnos });
  const modelosPorSede = new Map(await Promise.all(grupos.map(async (grupo) => [
    grupo.sede,
    await repositorioDeModelosDeHorario.listarPorSede(grupo.sede),
  ] as const)));
  const plan = equipo
    ? await crearCasosDeUsoDePlanesSemanales(repositorioDeTurnos, { obtenerActorActual }).obtenerOCrear(semana, equipo)
    : undefined;
  const celdas = new Map(plan?.celdas.map((celda) => [`${celda.idHuellero}:${celda.fecha}`, celda]));
  const idsDeColaboradores = colaboradores.map((colaborador) => colaborador.idHuellero);
  const revision = plan ? await revisarPlanSemanal(repositorioDeTurnos, actor, plan.id, idsDeColaboradores) : { errores: [] };
  const erroresPorCelda = revision.errores.reduce((porCelda, error) => {
    const clave = `${error.idHuellero}:${error.fecha}`;
    porCelda.set(clave, [...(porCelda.get(clave) ?? []), error]);
    return porCelda;
  }, new Map<string, typeof revision.errores>());
  const personasConErrores = new Set(revision.errores.map((error) => error.idHuellero));
  const personasListas = idsDeColaboradores.length - personasConErrores.size;

  return <main className="contenido contenido-turnos">
    <section className="plan-semanal">
      <header className="barra-plan-semanal">
        <div><p className="eyebrow">{actor.rol === "administracion" ? "Administración" : "Operaciones"}</p><h1>Plan semanal</h1></div>
        <p className="rango-semana">{formatearRangoSemanal(dias)}</p>
        <nav aria-label="Cambiar semana" className="navegacion-semana">
          <a href={crearEnlaceSemanal(desplazarFecha(semana, -7), equipo)}>Semana anterior</a>
          <a href={crearEnlaceSemanal(desplazarFecha(semana, 7), equipo)}>Semana siguiente</a>
        </nav>
      </header>

      {!equipo ? <p className="aviso-sin-equipo">Asigne las sedes activas a un equipo operativo desde Configuración.</p> : grupos.length === 0 ? <p className="aviso-sin-equipo">No hay colaboradores activos en {etiquetasDeEquipo[equipo]}.</p> : <>
        <div className="herramientas-plan-semanal">
          <form className="selector-plan-semanal" method="get">
            <label>Semana<input defaultValue={semana} name="semana" type="date" /></label>
            <label>Equipo<select defaultValue={equipo} name="equipo">{equipos.map((opcion) => <option key={opcion} value={opcion}>{etiquetasDeEquipo[opcion]}</option>)}</select></label>
            <button type="submit">Ver semana</button>
          </form>
          <form action={copiarSemanaAnteriorEnBorrador}><input name="planId" type="hidden" value={plan!.id} /><button className="boton-secundario" type="submit">Copiar semana anterior</button></form>
          <form action={aplicarHorarioEnLoteAlBorrador} className="aplicar-horario" id="aplicar-horario-en-lote">
            <input name="planId" type="hidden" value={plan!.id} />
            <label className="sr-only" htmlFor="horario-lote">Horario para celdas seleccionadas</label>
            <select id="horario-lote" name="horario" required defaultValue=""><option value="">Aplicar horario…</option>{opcionesDeHorario.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}</select>
            <button className="boton-secundario" type="submit">Aplicar horario</button>
          </form>
          <p className="resumen-plan"><strong>{personasListas} personas listas</strong><span> · </span><b>{personasConErrores.size} por revisar</b></p>
        </div>

        <div className="tabla-plan-semanal">
          <table>
            <thead><tr><th>Persona · sede</th>{dias.map((fecha) => <th key={fecha}><time dateTime={fecha}>{formatearEncabezadoDia(fecha)}</time></th>)}</tr></thead>
            <tbody>{grupos.flatMap((grupo) => [
              <tr className="grupo-sede" key={`grupo-${grupo.sede}`}><th colSpan={dias.length + 1}>{grupo.sede}</th></tr>,
              ...grupo.colaboradores.map((colaborador) => <tr key={colaborador.idHuellero}>
                <th scope="row"><label className="selector-publicacion"><input defaultChecked={!personasConErrores.has(colaborador.idHuellero)} disabled={personasConErrores.has(colaborador.idHuellero)} form="publicar-plan-semanal" name="idHuellero" type="checkbox" value={colaborador.idHuellero} /><span><strong>{colaborador.nombre}</strong><small>{colaborador.idHuellero}</small></span></label></th>
                {dias.map((fecha) => {
                  const celdaDelBorrador = celdas.get(`${colaborador.idHuellero}:${fecha}`);
                  const turnoPublicado = turnos.find((turno) => turno.idHuellero === colaborador.idHuellero && turno.fecha === fecha);
                  const horario = celdaDelBorrador?.descanso ? "descanso" : celdaDelBorrador?.modeloHorarioId ? `modelo:${celdaDelBorrador.modeloHorarioId}` : celdaDelBorrador ? `${celdaDelBorrador.entradaProgramada}|${celdaDelBorrador.salidaProgramada}` : "";
                  const estado = turnoPublicado ? "publicado" : celdaDelBorrador?.descanso ? "descanso" : celdaDelBorrador ? "borrador" : "sin-definir";
                  const errores = erroresPorCelda.get(`${colaborador.idHuellero}:${fecha}`) ?? [];

                  if (turnoPublicado) return <td className={`celda-plan-semanal ${estado}`} key={fecha}><span className="horario-visible">{turnoPublicado.descanso ? "Descanso" : `${turnoPublicado.entradaProgramada}–${turnoPublicado.salidaProgramada}`}</span></td>;

                  return <td className={`celda-plan-semanal ${estado}`} key={fecha}>
                    <form action={guardarCeldaDelBorrador} className="editor-celda-plan">
                      <input name="planId" type="hidden" value={plan!.id} />
                      <input name="idHuellero" type="hidden" value={colaborador.idHuellero} />
                      <input name="fecha" type="hidden" value={fecha} />
                      <input name="sede" type="hidden" value={grupo.sede} />
                      <label className="seleccionar-celda"><input form="aplicar-horario-en-lote" name="celda" type="checkbox" value={JSON.stringify({ idHuellero: colaborador.idHuellero, fecha, sede: grupo.sede })} /><span className="sr-only">Seleccionar {colaborador.nombre}, {fecha}</span></label>
                      <select aria-label={`Horario de ${colaborador.nombre} para ${fecha}`} defaultValue={horario} name="horario"><option value="">Sin definir</option>{modelosPorSede.get(grupo.sede)?.filter((modelo) => modelo.activo).map((modelo) => <option key={modelo.id} value={`modelo:${modelo.id}`}>{modelo.nombre} · {modelo.entrada} a {modelo.salida}</option>)}{opcionesDeHorario.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}</select>
                      <button className="guardar-celda" type="submit">Guardar</button>
                      {celdaDelBorrador && <button className="borrar-celda" formAction={borrarCeldaDelBorrador} type="submit">Borrar</button>}
                      {errores.map(({ mensaje }) => <small key={mensaje} role="alert">{mensaje}</small>)}
                    </form>
                  </td>;
                })}
              </tr>),
            ])}</tbody>
          </table>
        </div>

        <footer className="pie-plan-semanal">
          <p>Los cambios quedan como borrador hasta publicar.</p>
          <form action={publicarPlanSemanalDesdeGrilla} id="publicar-plan-semanal"><input name="planId" type="hidden" value={plan!.id} /><button type="submit">Publicar {personasListas} personas listas</button></form>
        </footer>
      </>}
    </section>
  </main>;
}

function crearEnlaceSemanal(semana: string, equipo: string | undefined): string {
  return `/turnos?semana=${semana}${equipo ? `&equipo=${equipo}` : ""}`;
}

function formatearEncabezadoDia(fecha: string): string {
  return new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${fecha}T00:00:00.000Z`)).replace(".", "");
}

function formatearRangoSemanal(dias: string[]): string {
  const formato = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", timeZone: "UTC" });
  return `${formato.format(new Date(`${dias[0]}T00:00:00.000Z`))} al ${formato.format(new Date(`${dias.at(-1)}T00:00:00.000Z`))}`;
}
