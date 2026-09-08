import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { BotonDeAccionConfirmada } from "@/app/boton-de-accion-confirmada";
import { repositorioDeColaboradores } from "@/colaboradores/servicio";
import { db } from "@/db/client";
import { politicasDePenalizacionPorTardanzas, sedes } from "@/db/schema";
import { repositorioDeModelosDeHorario } from "@/turnos/servicio";

import { asignarEquipoOperativoASede, crearModeloHorario, desactivarColaborador, desactivarModeloHorario, eliminarModeloHorario, eliminarSede, guardarColaborador, guardarModeloHorario, guardarPoliticaDeTardanzas, guardarSede, reactivarColaborador, reactivarModeloHorario } from "./actions";
import { FiltrosDeColaboradores } from "./filtros-de-colaboradores";
import { filtrarColaboradores } from "./visibilidad-de-colaboradores";
import { crearModeloHorario, desactivarColaborador, desactivarModeloHorario, eliminarModeloHorario, eliminarSede, guardarColaborador, guardarModeloHorario, guardarPoliticaDeTardanzas, guardarSede, reactivarColaborador, reactivarModeloHorario } from "./actions";
import { EditorDeGrupoDeSede } from "./editor-de-grupo-de-sede";

export const dynamic = "force-dynamic";

export default async function PaginaDeConfiguracion({ searchParams }: { searchParams: Promise<{ grupo?: string; inactivos?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "administracion" && actor.rol !== "operaciones") return <main className="centrado"><section className="estado-vacio"><h1>Sin permiso</h1><p>Su rol no permite cambiar la configuración.</p></section></main>;

  const { grupo: grupoParam, inactivos: inactivosParam } = await searchParams;
  const grupo = grupoParam === "tiendas" || grupoParam === "taller" ? grupoParam : undefined;
  const mostrarInactivos = inactivosParam === "1";

  const [listaDeSedes, colaboradores, politicas] = await Promise.all([
    db.select({ nombre: sedes.nombre, equipoOperativo: sedes.equipoOperativo }).from(sedes).where(eq(sedes.activa, true)).orderBy(sedes.nombre),
    actor.rol === "administracion" ? repositorioDeColaboradores.listar() : Promise.resolve([]),
    actor.rol === "administracion" ? db.select().from(politicasDePenalizacionPorTardanzas).orderBy(desc(politicasDePenalizacionPorTardanzas.vigenteDesde)) : Promise.resolve([]),
  ]);
  const grupoPorSede = new Map(listaDeSedes.map((sede) => [sede.nombre, sede.equipoOperativo]));
  const colaboradoresConGrupo = colaboradores.map((colaborador) => ({ ...colaborador, grupo: grupoPorSede.get(colaborador.sede) ?? null }));
  // El contador del encabezado refleja el grupo elegido pero ignora el toggle "Mostrar inactivos"; la tabla usa ambos filtros.
  const colaboradoresDelGrupo = filtrarColaboradores(colaboradoresConGrupo, { grupo, mostrarInactivos: true });
  const colaboradoresVisibles = filtrarColaboradores(colaboradoresConGrupo, { grupo, mostrarInactivos });
  const modelos = (await Promise.all(listaDeSedes.map((sede) => repositorioDeModelosDeHorario.listarPorSede(sede.nombre)))).flat();
  const politicaActual = politicas[0];
  const modelosActivos = modelos.filter((modelo) => modelo.activo).length;
  const colaboradoresActivos = colaboradoresDelGrupo.filter((colaborador) => colaborador.activo).length;
  const colaboradoresInactivos = colaboradoresDelGrupo.length - colaboradoresActivos;

  return <main className="contenido configuracion">
    <header className="encabezado encabezado-configuracion"><div><p className="eyebrow">{actor.rol === "administracion" ? "Administración" : "Operaciones"}</p><h1>Configuración</h1><p>Administre modelos de horario, sedes, colaboradores y la política de penalización por tardanzas.</p></div></header>

    <section className="tarjeta tarjeta-configuracion">
      <header className="encabezado-seccion-configuracion"><div><h2>Modelos de horario</h2><p>Plantillas de entrada y salida que se asignan a cada persona en el planificador.</p></div><span className="insignia neutro">{modelos.length} modelos · {modelos.length - modelosActivos} inactivos</span></header>
      <form action={crearModeloHorario} className="filtros filtros-configuracion"><label>Sede<select name="sede" required>{listaDeSedes.map((sede) => <option key={sede.nombre}>{sede.nombre}</option>)}</select></label><label>Nombre<input name="nombre" placeholder="Apertura" required /></label><label>Entrada<input name="entrada" type="time" required /></label><label>Salida<input name="salida" type="time" required /></label><button className="boton-principal" disabled={!listaDeSedes.length} type="submit">Crear modelo</button></form>
      {modelos.length ? <ul className="lista-configuracion lista-con-estado">{modelos.map((modelo) => <li key={modelo.id}><span className="principal-configuracion"><strong>{modelo.nombre} · {modelo.entrada} a {modelo.salida}</strong><small>{modelo.sede}</small></span><span className={modelo.activo ? "insignia ok" : "insignia neutro"}>{modelo.activo ? "Activo" : "Inactivo"}</span><span className="acciones-configuracion">{modelo.activo && <details className="edicion-configuracion"><summary>Editar</summary><form action={guardarModeloHorario} className="formulario-edicion"><input name="id" type="hidden" value={modelo.id} /><input name="activo" type="hidden" value="true" /><label>Sede<select defaultValue={modelo.sede} name="sede" required>{listaDeSedes.map((sede) => <option key={sede.nombre}>{sede.nombre}</option>)}</select></label><label>Nombre<input defaultValue={modelo.nombre} name="nombre" required /></label><label>Entrada<input defaultValue={modelo.entrada} name="entrada" type="time" required /></label><label>Salida<input defaultValue={modelo.salida} name="salida" type="time" required /></label><button className="boton-principal" type="submit">Guardar</button></form></details>}{modelo.activo ? <BotonDeAccionConfirmada accion={desactivarModeloHorario} confirmar="Desactivar modelo" descripcion="El modelo dejará de estar disponible para nuevas asignaciones. Los horarios existentes no cambian." etiqueta="Desactivar" titulo={`¿Desactivar ${modelo.nombre}?`}><input name="id" type="hidden" value={modelo.id} /></BotonDeAccionConfirmada> : <><BotonDeAccionConfirmada accion={reactivarModeloHorario} confirmar="Reactivar modelo" descripcion="El modelo volverá a estar disponible para nuevas asignaciones." etiqueta="Reactivar" titulo={`¿Reactivar ${modelo.nombre}?`}><input name="id" type="hidden" value={modelo.id} /></BotonDeAccionConfirmada><BotonDeAccionConfirmada accion={eliminarModeloHorario} confirmar="Eliminar definitivamente" descripcion="Esta acción elimina el modelo inactivo. No afectará horarios publicados." etiqueta="Eliminar" peligro titulo={`¿Eliminar ${modelo.nombre}?`}><input name="id" type="hidden" value={modelo.id} /></BotonDeAccionConfirmada></>}</span></li>)}</ul> : <p className="pista-configuracion">Todavía no hay modelos de horario.</p>}
    </section>

    {actor.rol === "administracion" && <><div className="grilla-configuracion">
      <section className="tarjeta tarjeta-configuracion"><header className="encabezado-seccion-configuracion"><div><h2>Sedes</h2><p>Cada sede pertenece a un grupo.</p></div></header><form action={guardarSede} className="filtros filtros-configuracion"><label>Nombre<input name="nombre" placeholder="Nueva sede" required /></label><label>Grupo<select defaultValue="" name="equipoOperativo" required><option disabled value="">Grupo…</option><option value="tiendas">Tiendas</option><option value="taller">Taller</option></select></label><button className="boton-principal" type="submit">Crear sede</button></form><ul className="lista-configuracion lista-sedes">{listaDeSedes.map((sede) => <li key={sede.nombre}><span className="principal-configuracion"><strong>{sede.nombre}</strong><small>Grupo: {etiquetaDeEquipo(sede.equipoOperativo)}</small></span><span className="acciones-configuracion"><EditorDeGrupoDeSede grupoActual={sede.equipoOperativo} nombre={sede.nombre} /><BotonDeAccionConfirmada accion={eliminarSede} confirmar="Eliminar sede" descripcion="Solo puede eliminar una sede sin colaboradores asignados." etiqueta="Eliminar" peligro titulo={`¿Eliminar ${sede.nombre}?`}><input name="nombre" type="hidden" value={sede.nombre} /></BotonDeAccionConfirmada></span></li>)}</ul></section>
      <section className="tarjeta tarjeta-configuracion"><header className="encabezado-seccion-configuracion"><div><h2>Política de penalización por tardanzas</h2><p>Convierte tardanzas acumuladas en horas penalizadas, por sede y fecha de vigencia.</p></div></header><form action={guardarPoliticaDeTardanzas} className="formulario-politica"><label>Sede<select defaultValue={politicaActual?.sede} name="sede" required>{listaDeSedes.map((sede) => <option key={sede.nombre}>{sede.nombre}</option>)}</select></label><div className="campos-politica"><label>Tolerancia (min)<input defaultValue={politicaActual?.toleranciaEnMinutos ?? 10} min="1" name="toleranciaEnMinutos" required type="number" /></label><label>Tardanzas acumuladas<input defaultValue={politicaActual?.tardanzasAcumuladas ?? 3} min="1" name="tardanzasAcumuladas" required type="number" /></label><label>Horas penalizadas<input defaultValue={politicaActual?.horasPenalizadas ?? 1} min="1" name="horasPenalizadas" required type="number" /></label><label>Vigente desde<input defaultValue={politicaActual?.vigenteDesde} name="vigenteDesde" required type="date" /></label></div><div className="pie-politica"><span className="pista-configuracion">{politicaActual ? `Versión activa: ${politicaActual.version} · desde ${politicaActual.vigenteDesde}` : "La primera versión se guardará como versión 1."}</span><button className="boton-principal" disabled={!listaDeSedes.length} type="submit">Guardar política</button></div></form></section>
    </div>
    <section className="tarjeta tarjeta-configuracion"><header className="encabezado-seccion-configuracion"><div><h2>Colaboradores</h2><p>Personas que aparecen en la planificación y en la revisión de asistencias.</p></div><span className="insignia neutro">{colaboradoresActivos} activos · {colaboradoresInactivos} inactivos</span></header><FiltrosDeColaboradores grupo={grupo} mostrarInactivos={mostrarInactivos} /><form action={guardarColaborador} className="filtros filtros-configuracion"><label>ID de huellero<input name="idHuellero" placeholder="H-1099" required /></label><label>Nombre<input name="nombre" placeholder="Nombre y apellidos" required /></label><label>Sede<select name="sede" required>{listaDeSedes.map((sede) => <option key={sede.nombre}>{sede.nombre}</option>)}</select></label><button className="boton-principal" disabled={!listaDeSedes.length} type="submit">Crear colaborador</button></form><div className="tabla-configuracion"><table><thead><tr><th>Colaborador</th><th>ID huellero</th><th>Sede</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{colaboradoresVisibles.map((colaborador) => <tr key={colaborador.idHuellero}><td>{colaborador.nombre}</td><td>{colaborador.idHuellero}</td><td>{colaborador.sede}</td><td><span className={colaborador.activo ? "insignia ok" : "insignia neutro"}>{colaborador.activo ? "Activo" : "Inactivo"}</span></td><td>{colaborador.activo ? <BotonDeAccionConfirmada accion={desactivarColaborador} confirmar="Desactivar colaborador" descripcion="La persona no aparecerá en nuevas programaciones. Sus registros anteriores se conservan." etiqueta="Desactivar" titulo={`¿Desactivar a ${colaborador.nombre}?`}><input name="idHuellero" type="hidden" value={colaborador.idHuellero} /></BotonDeAccionConfirmada> : <BotonDeAccionConfirmada accion={reactivarColaborador} confirmar="Reactivar colaborador" descripcion="La persona volverá a aparecer en nuevas programaciones." etiqueta="Reactivar" titulo={`¿Reactivar a ${colaborador.nombre}?`}><input name="idHuellero" type="hidden" value={colaborador.idHuellero} /></BotonDeAccionConfirmada>}</td></tr>)}</tbody></table></div></section></>}
  </main>;
}

function etiquetaDeEquipo(equipo: "tiendas" | "taller" | null): string {
  if (equipo === "tiendas") return "Tiendas";
  if (equipo === "taller") return "Taller";
  return "Sin asignar";
}
