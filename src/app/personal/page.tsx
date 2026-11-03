import { redirect } from "next/navigation";

import { puedeAdministrarPersonalDelGrupo, puedeConfigurarGlobalmente, puedeConsultarColaboradores, puedeConsultarPersonal } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { BotonDeAccionConfirmada } from "@/app/boton-de-accion-confirmada";
import { LONGITUD_DNI } from "@/colaboradores/registrar-colaborador";
import { repositorioDeColaboradores } from "@/colaboradores/servicio";
import { repositorioDeGrupos } from "@/turnos/servicio";

import { cambiarGrupoDeColaboradorDeConfiguracion, desactivarColaborador, guardarColaborador, reactivarColaborador } from "../configuracion/actions";
import { BotonCancelar } from "../configuracion/boton-cancelar";
import { EditorDeGrupo } from "../configuracion/editor-de-grupo";
import { FiltrosDeColaboradores } from "./filtros-de-colaboradores";
import { PestanasDePersonal } from "./pestanas-de-personal";
import { filtrarColaboradores } from "./visibilidad-de-colaboradores";

export const dynamic = "force-dynamic";

export default async function PaginaDePersonal({ searchParams }: { searchParams: Promise<{ grupo?: string; inactivos?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeConsultarPersonal(actor)) return <main className="centrado"><section className="estado-vacio"><h1>Sin permiso</h1><p>Su rol no permite consultar al personal. Los gerentes de área necesitan tener al menos un grupo asignado.</p></section></main>;
  // Recursos Humanos y Finanzas solo consultan relaciones laborales: su pestaña es la única.
  if (!puedeConsultarColaboradores(actor)) redirect("/relaciones-laborales");

  const { grupo: grupoParam, inactivos: inactivosParam } = await searchParams;
  const grupo = grupoParam;
  const mostrarInactivos = inactivosParam === "1";

  const esAdministrador = puedeConfigurarGlobalmente(actor);
  const [gruposConAtributos, todosLosColaboradores] = await Promise.all([repositorioDeGrupos.listarConAtributos(), repositorioDeColaboradores.listar()]);
  // El Administrador ve todo; el gerente de área solo lo de sus grupos (el servidor también lo comprueba al guardar).
  const grupos = gruposConAtributos.map(({ nombre }) => nombre).filter((nombre) => puedeAdministrarPersonalDelGrupo(actor, nombre));
  const colaboradores = todosLosColaboradores.filter((colaborador) => puedeAdministrarPersonalDelGrupo(actor, colaborador.grupo));
  // El contador del encabezado refleja el grupo elegido pero ignora el toggle "Mostrar inactivos"; la tabla usa ambos filtros.
  const colaboradoresDelGrupo = filtrarColaboradores(colaboradores, { grupo, mostrarInactivos: true });
  const colaboradoresVisibles = filtrarColaboradores(colaboradores, { grupo, mostrarInactivos });
  const sinGrupos = !grupos.length;
  const colaboradoresActivos = colaboradoresDelGrupo.filter((colaborador) => colaborador.activo).length;
  const colaboradoresInactivos = colaboradoresDelGrupo.length - colaboradoresActivos;

  return <main className="contenido pagina pagina-ajustes">
    <header className="encabezado encabezado-pagina"><div><h1>Personal</h1><p>{esAdministrador ? "Colaboradores de todos los grupos y sus relaciones laborales." : "Colaboradores de sus grupos."}</p></div></header>
    <PestanasDePersonal actor={actor} activa="colaboradores" />
    <section className="tile panel"><header className="panel-cabecera"><div><h2>Colaboradores</h2><p>Personas que aparecen en la planificación y en la revisión de asistencias.</p></div><span className="insignia neutro">{colaboradoresActivos} activos · {colaboradoresInactivos} inactivos</span></header><FiltrosDeColaboradores grupo={grupo} grupos={grupos} mostrarInactivos={mostrarInactivos} /><details className="nuevo-configuracion"><summary>+ Nuevo colaborador</summary><form action={guardarColaborador} className="filtros panel-filtros"><p className="titulo-formulario">Nuevo colaborador</p><label>DNI<input inputMode="numeric" maxLength={LONGITUD_DNI} minLength={LONGITUD_DNI} name="dni" pattern={`[0-9]{${LONGITUD_DNI}}`} placeholder="12345678" required /></label><label>Nombre<input name="nombre" placeholder="Nombre y apellidos" required /></label><label>Grupo<select defaultValue={grupos.length === 1 ? grupos[0] : ""} name="grupo" required><option disabled value="">Grupo…</option>{grupos.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>{sinGrupos && <p className="pista-configuracion" id="motivo-crear-colaborador">Crear colaborador está deshabilitado porque no hay grupos. Cree un grupo primero.</p>}<div className="acciones-formulario"><button aria-describedby={sinGrupos ? "motivo-crear-colaborador" : undefined} className="boton-principal" disabled={sinGrupos} type="submit">Crear colaborador</button><BotonCancelar /></div></form></details>{colaboradoresVisibles.length ? <div className="panel-tabla tabla-personal"><table><thead><tr><th>Colaborador</th><th>DNI</th><th>Sede</th><th>Grupo</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{colaboradoresVisibles.map((colaborador) => <tr key={colaborador.dni}><td>{colaborador.nombre}</td><td>{colaborador.dni}</td><td>{colaborador.sede || <span className="texto-suave">Sin sede</span>}</td><td>{colaborador.grupo}</td><td><span className={colaborador.activo ? "insignia ok" : "insignia neutro"}>{colaborador.activo ? "Activo" : "Inactivo"}</span></td><td><span className="acciones-configuracion">{esAdministrador && <><EditorDeGrupo accion={cambiarGrupoDeColaboradorDeConfiguracion} campoOculto={{ nombre: "dni", valor: colaborador.dni }} etiqueta="Cambiar grupo" grupoActual={colaborador.grupo} grupos={grupos} />{colaborador.activo ? <BotonDeAccionConfirmada accion={desactivarColaborador} confirmar="Desactivar colaborador" descripcion="La persona no aparecerá en nuevas programaciones. Sus registros anteriores se conservan." etiqueta="Desactivar" peligro titulo={`¿Desactivar a ${colaborador.nombre}?`}><input name="dni" type="hidden" value={colaborador.dni} /></BotonDeAccionConfirmada> : <BotonDeAccionConfirmada accion={reactivarColaborador} confirmar="Reactivar colaborador" descripcion="La persona volverá a aparecer en nuevas programaciones." etiqueta="Reactivar" titulo={`¿Reactivar a ${colaborador.nombre}?`}><input name="dni" type="hidden" value={colaborador.dni} /></BotonDeAccionConfirmada>}</>}</span></td></tr>)}</tbody></table></div> : <section className="estado-vacio">{colaboradores.length ? <><h3>Ningún colaborador coincide con el filtro</h3><p>Cambie el grupo o active «Mostrar inactivos» para ver más colaboradores.</p></> : <><h3>No hay colaboradores</h3><p>{grupos.length ? "Registre el primero con el formulario de arriba." : esAdministrador ? "Para registrar uno necesita al menos un grupo: créelo en Configuración. La sede puede asignarse después." : "Para registrar uno necesita al menos uno de sus grupos. Pida al Administrador del sistema que lo cree."}</p></>}</section>}</section>
  </main>;
}
