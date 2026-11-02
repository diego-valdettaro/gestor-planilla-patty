import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeAbrirConfiguracion, puedeAdministrarCuentas, puedeAdministrarPersonalDelGrupo, puedeConfigurarGlobalmente, puedeConsultarConfiguracion, puedeConsultarHorarios, puedeOperarAsistenciaDelGrupo } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { BotonDeAccionConfirmada } from "@/app/boton-de-accion-confirmada";
import { db } from "@/db/client";
import { politicasDePenalizacionPorTardanzas, sedes } from "@/db/schema";
import { repositorioDeGrupos, repositorioDeModelosDeHorario } from "@/turnos/servicio";
import { repositorioDeTardanzas } from "@/tardanzas/servicio";

import { asignarEquipoOperativoASede, crearModeloHorario, desactivarModeloHorario, eliminarModeloHorario, eliminarSede, guardarModeloHorario, guardarPoliticaDeTardanzas, guardarGestionDeAsistenciaDelGrupo, reactivarModeloHorario } from "./actions";
import { EditorDeGrupo } from "./editor-de-grupo";
import { BotonCancelar } from "./boton-cancelar";
import { FormularioDeSede } from "./formulario-de-sede";
import { InterruptorDeGestion } from "./interruptor-de-gestion";
import { MenuDeConfiguracion } from "./menu-de-configuracion";

export const dynamic = "force-dynamic";

export default async function PaginaDeConfiguracion({ searchParams }: { searchParams: Promise<{ grupo?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeAbrirConfiguracion(actor)) return <main className="centrado"><section className="estado-vacio"><h1>Sin permiso</h1><p>Su rol no permite cambiar la configuración. Los gerentes de área necesitan tener al menos un grupo asignado.</p></section></main>;

  if (!puedeConsultarConfiguracion(actor)) redirect("/cuentas");

  const { grupo: grupoParam } = await searchParams;

  const esAdministrador = puedeConfigurarGlobalmente(actor);
  const [todasLasSedes, sedesParaPoliticas, gruposConAtributos, politicas, politicasDeGrupo] = await Promise.all([
    db.select({ nombre: sedes.nombre, grupo: sedes.grupo }).from(sedes).where(eq(sedes.activa, true)).orderBy(sedes.nombre),
    esAdministrador ? db.select({ nombre: sedes.nombre, grupo: sedes.grupo, activa: sedes.activa }).from(sedes).orderBy(sedes.nombre) : Promise.resolve([]),
    repositorioDeGrupos.listarConAtributos(),
    esAdministrador ? db.select().from(politicasDePenalizacionPorTardanzas).orderBy(desc(politicasDePenalizacionPorTardanzas.vigenteDesde), desc(politicasDePenalizacionPorTardanzas.version)) : Promise.resolve([]),
    esAdministrador ? repositorioDeTardanzas.listarPoliticasDeGrupo() : Promise.resolve([]),
  ]);
  // El Administrador ve todo; el gerente de área solo lo de sus grupos (el servidor también lo comprueba al guardar).
  const grupos = gruposConAtributos.map(({ nombre }) => nombre).filter((nombre) => puedeAdministrarPersonalDelGrupo(actor, nombre));
  const listaDeSedes = todasLasSedes.filter((sede) => sede.grupo !== null && puedeOperarAsistenciaDelGrupo(actor, sede.grupo));
  const mostrarModelos = puedeConsultarHorarios(actor);
  const modelos = (await Promise.all(listaDeSedes.map((sede) => repositorioDeModelosDeHorario.listarPorSede(sede.nombre)))).flat();
  const hoy = new Date().toISOString().slice(0, 10);
  const politicasVigentesPorSede = politicas.filter((politica) => politica.vigenteDesde <= hoy);
  const politicaActualPorSede = new Map<string, typeof politicas[number]>();
  for (const politica of politicasVigentesPorSede) if (!politicaActualPorSede.has(politica.sede)) politicaActualPorSede.set(politica.sede, politica);
  const politicasFuturasPorSede = new Map<string, Array<typeof politicas[number]>>();
  for (const politica of politicas) {
    if (politica.vigenteDesde <= hoy) continue;
    const futuras = politicasFuturasPorSede.get(politica.sede) ?? [];
    futuras.push(politica);
    politicasFuturasPorSede.set(politica.sede, futuras);
  }
  const sedeActivaPorNombre = new Map(sedesParaPoliticas.map((sede) => [sede.nombre, sede.activa]));
  const grupoDeSede = new Map(sedesParaPoliticas.map((sede) => [sede.nombre, sede.grupo]));
  const politicasLegadasPorGrupo = new Map<string, Array<{ sedes: string[]; toleranciaEnMinutos: number; tardanzasAcumuladas: number; horasPenalizadas: number }>>();
  const candidatasPorSede = [
    ...[...politicaActualPorSede].map(([sede, politica]) => ({ sede, politica, futura: false })),
    ...[...politicasFuturasPorSede].flatMap(([sede, futuras]) => futuras
      .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde) || a.version - b.version)
      .map((politica) => ({ sede, politica, futura: true }))),
  ];
  for (const { sede, politica, futura } of candidatasPorSede) {
    const grupo = grupoDeSede.get(sede);
    if (!grupo) continue;
    const opciones = politicasLegadasPorGrupo.get(grupo) ?? [];
    const existente = opciones.find((opcion) => opcion.toleranciaEnMinutos === politica.toleranciaEnMinutos && opcion.tardanzasAcumuladas === politica.tardanzasAcumuladas && opcion.horasPenalizadas === politica.horasPenalizadas);
    const etiquetaSede = `${sede} · ${futura ? "futura" : "vigente"} desde ${politica.vigenteDesde} · sede ${sedeActivaPorNombre.get(sede) ? "activa" : "inactiva"}`;
    if (existente) existente.sedes.push(etiquetaSede);
    else opciones.push({ sedes: [etiquetaSede], toleranciaEnMinutos: politica.toleranciaEnMinutos, tardanzasAcumuladas: politica.tardanzasAcumuladas, horasPenalizadas: politica.horasPenalizadas });
    politicasLegadasPorGrupo.set(grupo, opciones);
  }
  const politicaDeGrupo = new Map(politicasDeGrupo.map((politica) => [politica.grupo, politica]));
  const gruposDelMenu = gruposConAtributos.filter(({ nombre }) => grupos.includes(nombre));
  const grupoElegido = gruposDelMenu.find(({ nombre }) => nombre === grupoParam) ?? gruposDelMenu[0];
  const nombreElegido = grupoElegido?.nombre;
  const sedesDelGrupo = listaDeSedes.filter((sede) => sede.grupo === nombreElegido);
  const sedesAdministrables = todasLasSedes.filter((sede) => sede.grupo === nombreElegido);
  const sinSedes = !sedesDelGrupo.length;
  const modelosPorSede = sedesDelGrupo.map((sede) => ({ sede, modelos: modelos.filter((modelo) => modelo.sede === sede.nombre) }));

  const seccionDeGestion = grupoElegido && <section className="tile">
    <header className="tile-cabecera"><div><h3>Asistencia y horarios</h3><p>{grupoElegido.gestionaAsistencia ? "Este grupo planifica horarios y registra asistencias; su gerente aprueba la asistencia." : "Este grupo entra en planilla sin horarios ni asistencias, por eso no tiene política de tardanzas ni modelos de horario."}</p></div>
      {esAdministrador ? <InterruptorDeGestion accion={guardarGestionDeAsistenciaDelGrupo} gestiona={grupoElegido.gestionaAsistencia} grupo={grupoElegido.nombre} /> : <span className={grupoElegido.gestionaAsistencia ? "insignia ok" : "insignia neutro"}>{grupoElegido.gestionaAsistencia ? "Gestiona asistencia y horarios" : "No gestiona asistencia ni horarios"}</span>}</header>
  </section>;

  const seccionDeSedes = grupoElegido && esAdministrador && <section className="tile">
    <header className="tile-cabecera"><div><h3>Sedes</h3><p>Cada sede pertenece a un grupo.</p></div></header>
    {sedesAdministrables.length ? <ul className="lista-configuracion lista-sedes">{sedesAdministrables.map((sede) => <li key={sede.nombre}><span className="principal-configuracion"><strong>{sede.nombre}</strong></span><span className="acciones-configuracion"><EditorDeGrupo accion={asignarEquipoOperativoASede} campoOculto={{ nombre: "nombre", valor: sede.nombre }} etiqueta="Editar" grupoActual={sede.grupo} grupos={grupos} permitirSinAsignar /><BotonDeAccionConfirmada accion={eliminarSede} confirmar="Eliminar sede" descripcion="Solo puede eliminar una sede sin colaboradores asignados." etiqueta="Eliminar" peligro titulo={`¿Eliminar ${sede.nombre}?`}><input name="nombre" type="hidden" value={sede.nombre} /></BotonDeAccionConfirmada></span></li>)}</ul> : <section className="estado-vacio"><h3>No hay sedes activas</h3><p>Cree la primera sede de {grupoElegido.nombre} con «+ Nueva sede».</p></section>}
    <details className="nuevo-configuracion"><summary>+ Nueva sede</summary><FormularioDeSede grupo={grupoElegido.nombre} /></details>
  </section>;

  const politica = grupoElegido ? politicaDeGrupo.get(grupoElegido.nombre) : undefined;
  const opcionesLegadas = grupoElegido ? politicasLegadasPorGrupo.get(grupoElegido.nombre) ?? [] : [];
  const seccionDePolitica = grupoElegido && esAdministrador && grupoElegido.gestionaAsistencia && <section className="tile">
    <header className="tile-cabecera"><div><h3>Política de tardanzas</h3><p>Una política única para todas las sedes del grupo.</p></div></header>
    {politica?.conflicto
      ? <form action={guardarPoliticaDeTardanzas} className="formulario-politica"><input name="grupo" type="hidden" value={grupoElegido.nombre} /><fieldset><legend>{grupoElegido.nombre} tiene políticas históricas en conflicto. Seleccione una política única.</legend>{opcionesLegadas.map((opcion) => <label key={`${opcion.toleranciaEnMinutos}-${opcion.tardanzasAcumuladas}-${opcion.horasPenalizadas}`}><input name="politicaSeleccionada" required type="radio" value={`${opcion.toleranciaEnMinutos},${opcion.tardanzasAcumuladas},${opcion.horasPenalizadas}`} />{opcion.sedes.join(", ")} · {opcion.toleranciaEnMinutos} min · {opcion.tardanzasAcumuladas} tardanzas · {opcion.horasPenalizadas} h</label>)}</fieldset>{opcionesLegadas.length ? <><p>Las políticas futuras se aplicarán al elegirlas desde ahora y recalcularán las asistencias de los períodos abiertos. Se incluyen fuentes inactivas porque originan este conflicto.</p><button className="boton-principal" type="submit">Usar política seleccionada</button></> : <p role="alert">No se encontraron políticas históricas para elegir; revise los datos antes de continuar.</p>}</form>
      : <form action={guardarPoliticaDeTardanzas} className="formulario-politica"><input name="grupo" type="hidden" value={grupoElegido.nombre} /><h4 className="sr-only">{grupoElegido.nombre}</h4><div className="campos-politica campos-politica-tres"><label>Tolerancia (min)<input defaultValue={politica?.toleranciaEnMinutos ?? 10} min="1" name="toleranciaEnMinutos" required type="number" /></label><label>Tardanzas acumuladas<input defaultValue={politica?.tardanzasAcumuladas ?? 3} min="1" name="tardanzasAcumuladas" required type="number" /></label><label>Horas penalizadas<input defaultValue={politica?.horasPenalizadas ?? 1} min="1" name="horasPenalizadas" required type="number" /></label></div><button className="boton-principal" type="submit">Guardar política de {grupoElegido.nombre}</button></form>}
  </section>;

  const seccionDeModelos = grupoElegido && mostrarModelos && grupoElegido.gestionaAsistencia && <section className="tile">
    <header className="tile-cabecera"><div><h3>Modelos de horario</h3><p>Plantillas de entrada y salida que se asignan a cada persona en el planificador. Cada modelo pertenece a una sede.</p></div></header>
    {sinSedes ? <section className="estado-vacio"><h3>No hay modelos de horario</h3>{esAdministrador ? <p>Un modelo pertenece a una sede. Cree una sede en este grupo y luego el primer modelo.</p> : <p>Un modelo pertenece a una sede y este grupo todavía no tiene sedes activas. Pida al Administrador del sistema que las cree.</p>}</section>
      : modelosPorSede.map(({ sede, modelos: delaSede }) => <div className="bloque-sede" key={sede.nombre}>
        <header className="bloque-sede-cabecera"><h4>{sede.nombre}</h4><span className="texto-suave">{delaSede.length} {delaSede.length === 1 ? "modelo" : "modelos"}</span></header>
        {delaSede.length ? <ul className="lista-configuracion lista-con-estado">{delaSede.map((modelo) => <li key={modelo.id}><span className="principal-configuracion"><strong>{modelo.nombre} · {modelo.entrada} a {modelo.salida}</strong></span><span className={modelo.activo ? "insignia ok" : "insignia neutro"}>{modelo.activo ? "Activo" : "Inactivo"}</span><span className="acciones-configuracion">{modelo.activo && <details className="edicion-configuracion"><summary>Editar</summary><form action={guardarModeloHorario} className="formulario-edicion"><input name="id" type="hidden" value={modelo.id} /><input name="activo" type="hidden" value="true" /><label>Sede<select defaultValue={modelo.sede} name="sede" required>{sedesDelGrupo.map((sede) => <option key={sede.nombre}>{sede.nombre}</option>)}</select></label><label>Nombre<input defaultValue={modelo.nombre} name="nombre" required /></label><label>Entrada<input defaultValue={modelo.entrada} name="entrada" type="time" required /></label><label>Salida<input defaultValue={modelo.salida} name="salida" type="time" required /></label><div className="acciones-formulario"><button className="boton-principal" type="submit">Guardar</button><BotonCancelar /></div></form></details>}{modelo.activo ? <BotonDeAccionConfirmada accion={desactivarModeloHorario} confirmar="Desactivar modelo" descripcion="El modelo dejará de estar disponible para nuevas asignaciones. Los horarios existentes no cambian." etiqueta="Desactivar" titulo={`¿Desactivar ${modelo.nombre}?`}><input name="id" type="hidden" value={modelo.id} /></BotonDeAccionConfirmada> : <><BotonDeAccionConfirmada accion={reactivarModeloHorario} confirmar="Reactivar modelo" descripcion="El modelo volverá a estar disponible para nuevas asignaciones." etiqueta="Reactivar" titulo={`¿Reactivar ${modelo.nombre}?`}><input name="id" type="hidden" value={modelo.id} /></BotonDeAccionConfirmada><BotonDeAccionConfirmada accion={eliminarModeloHorario} confirmar="Eliminar definitivamente" descripcion="Esta acción elimina el modelo inactivo. No afectará horarios publicados." etiqueta="Eliminar" peligro titulo={`¿Eliminar ${modelo.nombre}?`}><input name="id" type="hidden" value={modelo.id} /></BotonDeAccionConfirmada></>}</span></li>)}</ul> : <p className="pista-configuracion">Todavía no tiene modelos de horario.</p>}
        <details className="nuevo-configuracion"><summary>+ Nuevo modelo</summary><form action={crearModeloHorario} className="filtros panel-filtros"><input name="sede" type="hidden" value={sede.nombre} /><p className="titulo-formulario">Nuevo modelo para {sede.nombre}</p><label>Nombre<input name="nombre" placeholder="Apertura" required /></label><label>Entrada<input name="entrada" type="time" required /></label><label>Salida<input name="salida" type="time" required /></label><div className="acciones-formulario"><button className="boton-principal" type="submit">Crear modelo</button><BotonCancelar /></div></form></details>
      </div>)}
  </section>;

  const detalleDelGrupo = grupoElegido ? <div className="detalle-grupo"><h2 className="titulo-grupo">{grupoElegido.nombre}</h2>{seccionDeGestion}{seccionDeSedes}{seccionDePolitica}{seccionDeModelos}</div> : <section className="tile"><section className="estado-vacio"><h3>No hay grupos</h3><p>{esAdministrador ? "Cree el primer grupo con «+ Nuevo grupo»; después podrá agregarle sedes." : "Todavía no tiene grupos asignados."}</p></section></section>;

  return <main className="contenido pagina pagina-ajustes">
    <header className="encabezado encabezado-pagina"><div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>Configuración</h1><p>{esAdministrador ? "Administre grupos, sedes, la política de penalización por tardanzas, los modelos de horario y las cuentas de acceso." : "Administre los modelos de horario de sus grupos."}</p></div></header>
    <div className="disposicion-configuracion"><MenuDeConfiguracion cuentasActiva={false} grupoActivo={grupoElegido?.nombre} grupos={gruposDelMenu.map(({ nombre }) => nombre)} puedeCrearGrupos={esAdministrador} puedeVerCuentas={puedeAdministrarCuentas(actor)} /><div className="contenido-configuracion">{detalleDelGrupo}</div></div>
  </main>;
}
