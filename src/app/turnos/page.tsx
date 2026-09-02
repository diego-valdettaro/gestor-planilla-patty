import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearConsultaSemanalPorEquipo } from "@/turnos/consulta-semanal-por-equipo";
import { diasDeLaSemana, inicioDeSemana } from "@/turnos/semana";
import { repositorioDeTurnos } from "@/turnos/servicio";

import { publicarTurnoDesdeGrilla } from "./actions";

export const dynamic = "force-dynamic";

interface PropiedadesDePagina {
  searchParams: Promise<{ semana?: string; equipo?: string; colaborador?: string }>;
}

const etiquetasDeEquipo = {
  tiendas: "Tiendas",
  taller: "Taller",
};

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
  const equipo = parametros.equipo === "tiendas" || parametros.equipo === "taller"
    ? parametros.equipo
    : equipos.includes("tiendas") ? "tiendas" : equipos[0];
  const semana = inicioDeSemana(parametros.semana ?? new Date().toISOString().slice(0, 10));
  const dias = diasDeLaSemana(semana);
  const [sedes, colaboradores] = await Promise.all([
    repositorioDeTurnos.listarSedesConColaboradoresActivos(),
    equipo ? repositorioDeTurnos.listarColaboradoresActivosPorEquipo(equipo) : [],
  ]);
  const turnos = await repositorioDeTurnos.listarPublicadosPorColaboradoresYSemana(
    colaboradores.map((colaborador) => colaborador.idHuellero),
    dias[0],
    dias.at(-1)!,
  );
  const grupos = crearConsultaSemanalPorEquipo({ dias, colaboradores, turnos });
  const colaborador = colaboradores.find((item) => item.idHuellero === parametros.colaborador);
  const turnosDelColaborador = new Map(turnos.filter((turno) => turno.idHuellero === colaborador?.idHuellero).map((turno) => [turno.fecha, turno]));
  const fechasAbiertas = colaborador ? await Promise.all(dias.map((fecha) => repositorioDeTurnos.perteneceAPeriodoAbierto(fecha))) : [];

  return <main className="contenido">
    <header className="encabezado"><div><p className="eyebrow">{actor.rol === "administracion" ? "Administración" : "Operaciones"}</p><h1>Horarios semanales</h1><p>Consulte los horarios publicados por equipo operativo.</p></div></header>
    <form className="filtros" method="get"><label>Semana<input defaultValue={semana} name="semana" type="date" /></label><label>Equipo operativo<select defaultValue={equipo} name="equipo">{equipos.map((opcion) => <option key={opcion} value={opcion}>{etiquetasDeEquipo[opcion]}</option>)}</select></label><label>Publicar para<select defaultValue={colaborador?.idHuellero ?? ""} name="colaborador"><option value="">Solo consultar</option>{colaboradores.map((opcion) => <option key={opcion.idHuellero} value={opcion.idHuellero}>{opcion.nombre} · {opcion.idHuellero}</option>)}</select></label><button type="submit">Ver semana</button></form>
    {!equipo ? <p>Asigne las sedes activas a un equipo operativo desde Configuración.</p> : grupos.length === 0 ? <p>No hay colaboradores activos en {etiquetasDeEquipo[equipo]}.</p> : <div className="grilla-consulta-semanal">
      {grupos.map((grupo) => <section className="tarjeta" key={grupo.sede}><h2>{grupo.sede}</h2><div className="tabla-semanal"><table><thead><tr><th>Colaborador</th>{dias.map((dia) => <th key={dia}><time>{dia}</time></th>)}</tr></thead><tbody>{grupo.colaboradores.map((colaborador) => <tr key={colaborador.idHuellero}><th>{colaborador.nombre}<small>{colaborador.idHuellero}</small></th>{colaborador.celdas.map((celda, indice) => <td key={dias[indice]} className={`celda-turno ${celda.estado}`}>{celda.estado === "sin-publicacion" ? "Sin publicación" : celda.estado === "descanso" ? <>Descanso<small>{celda.sede}</small></> : <>Publicado<small>{celda.sede} · {celda.entradaProgramada} a {celda.salidaProgramada}</small></>}</td>)}</tr>)}</tbody></table></div></section>)}
    </div>}
    {colaborador && <section className="tarjeta horario-semanal"><header><h2>Publicar horario individual</h2><span>{colaborador.nombre} · {colaborador.idHuellero} · sede base: {colaborador.sede}</span></header><div className="dias">{dias.map((fecha, indice) => {
      const turno = turnosDelColaborador.get(fecha);
      if (turno) return <article className="turno-publicado" key={fecha}><time>{fecha}</time><strong>{turno.descanso ? "Descanso" : "Publicado"}</strong><span>{turno.sede}</span><span>{turno.descanso ? "" : `${turno.entradaProgramada} a ${turno.salidaProgramada}`}</span></article>;
      if (!fechasAbiertas[indice]) return <article className="turno-publicado" key={fecha}><time>{fecha}</time><strong>No disponible</strong><span>La fecha no pertenece a un período de planilla abierto.</span></article>;
      return <form action={publicarTurnoDesdeGrilla} className="turno-borrador" key={fecha}><time>{fecha}</time><strong>Sin publicación</strong><input name="idHuellero" type="hidden" value={colaborador.idHuellero} /><input name="fecha" type="hidden" value={fecha} /><label>Sede<select name="sede" required defaultValue={colaborador.sede}>{sedes.map((sede) => <option key={sede} value={sede}>{sede}</option>)}</select></label><label>Horario<select name="horario" required defaultValue={opcionesDeHorario[0].valor}>{opcionesDeHorario.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}</select></label><button type="submit">Publicar</button></form>;
    })}</div></section>}
  </main>;
}
