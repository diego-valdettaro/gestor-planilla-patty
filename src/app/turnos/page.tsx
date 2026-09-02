import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { diasDeLaSemana, inicioDeSemana } from "@/turnos/semana";
import { repositorioDeTurnos } from "@/turnos/servicio";

import { publicarTurnoDesdeGrilla } from "./actions";

export const dynamic = "force-dynamic";

interface PropiedadesDePagina { searchParams: Promise<{ semana?: string; colaborador?: string }>; }

const opcionesDeHorario = [
  { valor: "09:00|18:00|60", etiqueta: "09:00 a 18:00, 60 min de almuerzo" },
  { valor: "10:00|19:00|60", etiqueta: "10:00 a 19:00, 60 min de almuerzo" },
  { valor: "08:00|17:00|60", etiqueta: "08:00 a 17:00, 60 min de almuerzo" },
  { valor: "descanso", etiqueta: "Descanso" },
];

export default async function PaginaDeTurnos({ searchParams }: PropiedadesDePagina) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "operaciones" && actor.rol !== "administracion") return <main className="centrado"><p>No tiene permiso para administrar horarios.</p></main>;

  const parametros = await searchParams;
  const [sedes, colaboradores] = await Promise.all([repositorioDeTurnos.listarSedesConColaboradoresActivos(), repositorioDeTurnos.listarColaboradoresActivos()]);
  const colaborador = colaboradores.find((item) => item.idHuellero === parametros.colaborador) ?? colaboradores[0];
  const semana = inicioDeSemana(parametros.semana ?? new Date().toISOString().slice(0, 10));
  const dias = diasDeLaSemana(semana);
  const [turnos, fechasAbiertas] = await Promise.all([
    colaborador
      ? repositorioDeTurnos.listarPublicadosPorColaboradorYSemana(colaborador.idHuellero, dias[0], dias.at(-1)!)
      : [],
    Promise.all(dias.map((fecha) => repositorioDeTurnos.perteneceAPeriodoAbierto(fecha))),
  ]);
  const fechasHabilitadas = new Set(dias.filter((_, indice) => fechasAbiertas[indice]));
  const turnosPorFecha = new Map(turnos.map((turno) => [turno.fecha, turno]));

  return <main className="contenido">
    <header className="encabezado"><div><p className="eyebrow">{actor.rol === "administracion" ? "Administración" : "Operaciones"}</p><h1>Horarios semanales</h1><p>Programe una semana para cada colaborador.</p></div></header>
    <form className="filtros" method="get"><label>Semana<input defaultValue={semana} name="semana" type="date" /></label><label>Colaborador<select defaultValue={colaborador?.idHuellero} name="colaborador">{colaboradores.map((opcion) => <option key={opcion.idHuellero} value={opcion.idHuellero}>{opcion.nombre} · {opcion.idHuellero}</option>)}</select></label><button type="submit">Ver semana</button></form>
    {colaborador ? <section className="tarjeta horario-semanal">
      <header><strong>{colaborador.nombre}</strong><span>{colaborador.idHuellero} · sede base: {colaborador.sede}</span></header>
      <div className="dias">{dias.map((fecha) => {
        const turno = turnosPorFecha.get(fecha);
        if (turno) return <article className="turno-publicado" key={fecha}><time>{fecha}</time><strong>{turno.descanso ? "Descanso" : "Publicado"}</strong><span>{turno.sede}</span><span>{turno.descanso ? "" : `${turno.entradaProgramada} a ${turno.salidaProgramada}`}</span></article>;
        if (!fechasHabilitadas.has(fecha)) return <article className="turno-publicado" key={fecha}><time>{fecha}</time><strong>No disponible</strong><span>La fecha no pertenece a un período de planilla abierto.</span></article>;
        return <form action={publicarTurnoDesdeGrilla} className="turno-borrador" key={fecha}><time>{fecha}</time><input name="idHuellero" type="hidden" value={colaborador.idHuellero} /><input name="fecha" type="hidden" value={fecha} /><label>Sede<select name="sede" required defaultValue={colaborador.sede}>{sedes.map((sede) => <option key={sede}>{sede}</option>)}</select></label><label>Horario<select name="horario" required defaultValue={opcionesDeHorario[0].valor}>{opcionesDeHorario.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}</select></label><button type="submit">Publicar</button></form>;
      })}</div>
    </section> : <p>No hay colaboradores activos para programar.</p>}
  </main>;
}
