import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { repositorioDeColaboradores } from "@/colaboradores/servicio";
import { db } from "@/db/client";
import { sedes } from "@/db/schema";
import { repositorioDeModelosDeHorario } from "@/turnos/servicio";

import { asignarEquipoOperativoASede, crearModeloHorario, desactivarColaborador, eliminarModeloHorario, eliminarSede, guardarColaborador, guardarModeloHorario, guardarPoliticaDeTardanzas, guardarSede } from "./actions";

export const dynamic = "force-dynamic";

export default async function PaginaDeConfiguracion() {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "administracion" && actor.rol !== "operaciones") return <main className="centrado"><p>No tiene permiso para cambiar la configuración.</p></main>;

  const [listaDeSedes, colaboradores] = await Promise.all([
    db.select({ nombre: sedes.nombre, equipoOperativo: sedes.equipoOperativo }).from(sedes).where(eq(sedes.activa, true)).orderBy(sedes.nombre),
    actor.rol === "administracion" ? repositorioDeColaboradores.listar() : Promise.resolve([]),
  ]);
  const modelos = (await Promise.all(listaDeSedes.map((sede) => repositorioDeModelosDeHorario.listarPorSede(sede.nombre)))).flat();

  return <main className="contenido configuracion">
    <header className="encabezado"><div><p className="eyebrow">{actor.rol === "administracion" ? "Administración" : "Operaciones"}</p><h1>Configuración</h1><p>Administre los modelos de horario por sede.</p></div></header>
    <section className="tarjeta"><h2>Modelos de horario</h2>
      <form action={crearModeloHorario} className="filtros"><label>Sede<select name="sede" required>{listaDeSedes.map((sede) => <option key={sede.nombre}>{sede.nombre}</option>)}</select></label><label>Nombre<input name="nombre" required /></label><label>Entrada<input name="entrada" type="time" required /></label><label>Salida<input name="salida" type="time" required /></label><button type="submit">Crear modelo</button></form>
      <ul className="lista-configuracion">{modelos.map((modelo) => <li key={modelo.id}><form action={guardarModeloHorario} className="fila-configuracion"><input name="id" type="hidden" value={modelo.id} /><label>Sede<select name="sede" defaultValue={modelo.sede} required>{listaDeSedes.map((sede) => <option key={sede.nombre}>{sede.nombre}</option>)}</select></label><label>Nombre<input name="nombre" defaultValue={modelo.nombre} required /></label><label>Entrada<input name="entrada" type="time" defaultValue={modelo.entrada} required /></label><label>Salida<input name="salida" type="time" defaultValue={modelo.salida} required /></label><label>Estado<select name="activo" defaultValue={String(modelo.activo)}><option value="true">Activo</option><option value="false">Inactivo</option></select></label><button type="submit">Guardar</button></form><form action={eliminarModeloHorario}><input name="id" type="hidden" value={modelo.id} /><button type="submit" className="peligro">{modelo.activo ? "Eliminar o desactivar" : "Eliminar"}</button></form></li>)}</ul>
    </section>
    {actor.rol === "administracion" && <>
      <section className="tarjeta"><h2>Sedes</h2>
        <form action={guardarSede} className="filtros"><label>Nombre<input name="nombre" required /></label><button type="submit">Crear sede</button></form>
        <ul className="lista-configuracion">{listaDeSedes.map((sede) => <li key={sede.nombre}><span>{sede.nombre}</span><form action={asignarEquipoOperativoASede} className="fila-configuracion"><input name="nombre" type="hidden" value={sede.nombre} /><label>Equipo operativo<select name="equipoOperativo" defaultValue={sede.equipoOperativo ?? ""} required><option value="" disabled>Sin asignar</option><option value="tiendas">Tiendas</option><option value="taller">Taller</option></select></label><button type="submit">Guardar</button></form><form action={eliminarSede}><input name="nombre" type="hidden" value={sede.nombre} /><button type="submit" className="peligro">Eliminar</button></form></li>)}</ul>
      </section>
      <section className="tarjeta"><h2>Colaboradores</h2>
        <form action={guardarColaborador} className="filtros"><label>ID de huellero<input name="idHuellero" required /></label><label>Nombre<input name="nombre" required /></label><label>Sede<select name="sede" required>{listaDeSedes.map((sede) => <option key={sede.nombre}>{sede.nombre}</option>)}</select></label><label>Centro de costo<input name="centroDeCosto" required /></label><button type="submit">Crear colaborador</button></form>
        <ul className="lista-configuracion">{colaboradores.map((colaborador) => <li key={colaborador.idHuellero}><span>{colaborador.nombre} · {colaborador.idHuellero} · {colaborador.sede}{!colaborador.activo && <small className="estado-inactivo">Inactivo</small>}</span>{colaborador.activo && <form action={desactivarColaborador}><input name="idHuellero" type="hidden" value={colaborador.idHuellero} /><button type="submit" className="peligro">Desactivar</button></form>}</li>)}</ul>
      </section>
      <section className="tarjeta"><h2>Política de penalización por tardanzas</h2>
        <form action={guardarPoliticaDeTardanzas} className="filtros"><label>Sede<select name="sede" required>{listaDeSedes.map((sede) => <option key={sede.nombre}>{sede.nombre}</option>)}</select></label><label>Tolerancia en minutos<input name="toleranciaEnMinutos" required min="1" type="number" defaultValue="10" /></label><label>Tardanzas acumuladas<input name="tardanzasAcumuladas" required min="1" type="number" defaultValue="3" /></label><label>Horas penalizadas<input name="horasPenalizadas" required min="1" type="number" defaultValue="1" /></label><label>Versión<input name="version" required min="1" type="number" /></label><label>Vigente desde<input name="vigenteDesde" required type="date" /></label><button type="submit">Guardar política</button></form>
      </section>
    </>}
  </main>;
}
