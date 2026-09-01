import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { diasDeLaSemana, inicioDeSemana } from "@/turnos/semana";
import { repositorioDeTurnos } from "@/turnos/servicio";

import { publicarTurnoDesdeGrilla } from "./actions";

export const dynamic = "force-dynamic";

interface PropiedadesDePagina {
  searchParams: Promise<{ semana?: string; sede?: string }>;
}

export default async function PaginaDeTurnos({ searchParams }: PropiedadesDePagina) {
  const actor = await obtenerActorActual().catch(() => undefined);

  if (!actor) {
    redirect("/iniciar-sesion");
  }
  if (actor.rol !== "operaciones") {
    return <main className="centrado"><p>No tiene permiso para administrar turnos.</p></main>;
  }

  const parametros = await searchParams;
  const sedes = await repositorioDeTurnos.listarSedesConColaboradoresActivos();
  const sede = parametros.sede && sedes.includes(parametros.sede) ? parametros.sede : sedes[0];
  const semana = inicioDeSemana(parametros.semana ?? new Date().toISOString().slice(0, 10));
  const dias = diasDeLaSemana(semana);
  const colaboradores = sede ? await repositorioDeTurnos.listarColaboradoresActivosPorSede(sede) : [];
  const turnos = sede
    ? await repositorioDeTurnos.listarPublicadosPorSedeYSemana(sede, dias[0], dias.at(-1)!)
    : [];
  const turnosPorColaboradorYFecha = new Map(
    turnos.map((turno) => [`${turno.idHuellero}:${turno.fecha}`, turno]),
  );

  return (
    <main className="contenido">
      <header className="encabezado">
        <div>
          <p className="eyebrow">Operaciones</p>
          <h1>Turnos semanales</h1>
        </div>
      </header>
      <form className="filtros" method="get">
        <label>
          Semana
          <input defaultValue={semana} name="semana" type="date" />
        </label>
        <label>
          Sede
          <select defaultValue={sede} name="sede">
            {sedes.map((opcion) => <option key={opcion}>{opcion}</option>)}
          </select>
        </label>
        <button type="submit">Ver semana</button>
      </form>
      {sede ? (
        <section className="grilla">
          {colaboradores.map((colaborador) => (
            <article className="fila-colaborador" key={colaborador.idHuellero}>
              <header>
                <strong>{colaborador.nombre}</strong>
                <span>{colaborador.idHuellero} · {colaborador.centroDeCosto}</span>
              </header>
              <div className="dias">
                {dias.map((fecha) => {
                  const turno = turnosPorColaboradorYFecha.get(`${colaborador.idHuellero}:${fecha}`);

                  if (turno) {
                    return <div className="turno-publicado" key={fecha}><time>{fecha.slice(5)}</time><strong>Publicado</strong><span>{turno.entradaProgramada}–{turno.salidaProgramada}</span></div>;
                  }

                  return (
                    <form action={publicarTurnoDesdeGrilla} className="turno-borrador" key={fecha}>
                      <time>{fecha.slice(5)}</time>
                      <input name="idHuellero" type="hidden" value={colaborador.idHuellero} />
                      <input name="fecha" type="hidden" value={fecha} />
                      <input name="sede" type="hidden" value={sede} />
                      <label>Entrada<input defaultValue="09:00" name="entradaProgramada" required type="time" /></label>
                      <label>Salida<input defaultValue="18:00" name="salidaProgramada" required type="time" /></label>
                      <label>Almuerzo<input defaultValue="60" min="0" name="minutosDeAlmuerzo" required type="number" /></label>
                      <label className="checkbox"><input name="descanso" type="checkbox" />Descanso</label>
                      <button type="submit">Publicar</button>
                    </form>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      ) : <p>No hay colaboradores activos para mostrar.</p>}
    </main>
  );
}
