"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { EquipoOperativo } from "@/turnos/configurar-equipos-operativos";
import type { ModeloDeHorario } from "@/turnos/gestionar-modelos-de-horario";
import type { CeldaDePlanSemanalEnBorrador, HorarioSemanalParaCopiar } from "@/turnos/plan-semanal-en-borrador";
import { inicioDeSemana } from "@/turnos/semana";

import { guardarBorradorDesdeGrilla, publicarPlanSemanalDesdeGrilla, reemplazarPlanificacionSemanalDesdeGrilla, republicarPlanSemanalDesdeGrilla } from "./actions";
import { ESTADOS_DE_HORARIO, type EstadoDeHorario, NOMBRE_DEL_ESTADO_DE_HORARIO, difiereDelPublicado, estadoDeCelda, estadoDeSemana } from "./estado-de-celda";
import { resumirPlanSemanal } from "./resumen-plan-semanal";

type Celda = Omit<CeldaDePlanSemanalEnBorrador, "planId">;
type Colaborador = { idHuellero: string; nombre: string; sede: string };
type Modelo = ModeloDeHorario;
type Publicado = HorarioSemanalParaCopiar;
type Confirmacion = { tipo: "cambiar-semana"; destino: string } | { tipo: "publicar" } | { tipo: "reemplazar-planificacion" } | { tipo: "republicar"; idHuellero: string; nombre: string };

export function PlanificadorSemanal({ actualizadoEn, equipos, planId, semana, equipo, colaboradores, dias, celdasIniciales, publicados, procesados, modelos }: {
  actualizadoEn?: string; equipos: EquipoOperativo[]; planId: string; semana: string; equipo: EquipoOperativo; colaboradores: Colaborador[]; dias: string[]; celdasIniciales: Celda[]; publicados: Publicado[]; procesados: string[]; modelos: Modelo[];
}) {
  const router = useRouter();
  const dialogoPersonalizado = useRef<HTMLDialogElement>(null);
  const dialogoConfirmacion = useRef<HTMLDialogElement>(null);
  const dialogoCelda = useRef<HTMLDialogElement>(null);
  const [celdas, setCeldas] = useState(celdasIniciales);
  const [cambios, setCambios] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState<string>();
  const [guardadoEn, setGuardadoEn] = useState(actualizadoEn);
  const [personalizado, setPersonalizado] = useState<{ colaborador: Colaborador; fecha: string }>();
  const [confirmacion, setConfirmacion] = useState<Confirmacion>();
  const [celdaEnEdicion, setCeldaEnEdicion] = useState<{ colaborador: Colaborador; fecha: string }>();
  useEffect(() => setGuardadoEn(actualizadoEn), [actualizadoEn]);
  const porClave = useMemo(() => new Map(celdas.map((celda) => [`${celda.idHuellero}:${celda.fecha}`, celda])), [celdas]);
  const publicadosPorClave = useMemo(() => new Map(publicados.map((celda) => [`${celda.idHuellero}:${celda.fecha}`, celda])), [publicados]);
  const procesadosPorId = useMemo(() => new Set(procesados), [procesados]);
  const sedes = useMemo(() => [...new Set(colaboradores.map(({ sede }) => sede))], [colaboradores]);
  const resumen = useMemo(() => resumirPlanSemanal(colaboradores, dias, celdas, publicados), [celdas, colaboradores, dias, publicados]);
  const publicadosCompletos = useMemo(() => colaboradores.filter(({ idHuellero }) => estaPublicadaLaSemana(idHuellero, dias, publicadosPorClave)).length, [colaboradores, dias, publicadosPorClave]);
  const planificacionPublicada = publicadosCompletos === colaboradores.length && colaboradores.length > 0;
  const nuevosAlPublicar = colaboradores.length - publicadosCompletos;
  const estadoDeLaPlanificacion = useMemo<EstadoDeHorario>(() => {
    if (!colaboradores.length) return "borrador-editable";
    const estados = new Set(colaboradores.map(({ idHuellero }) => resumenSemanalDe(idHuellero, dias, porClave, publicadosPorClave, procesadosPorId).estado));
    return PRIORIDAD_ESTADO_PLANIFICACION.find((estado) => estados.has(estado)) ?? "liquidado";
  }, [colaboradores, dias, publicadosPorClave, procesadosPorId, porClave]);

  const modelosDeSede = (sede: string) => modelos.filter((modelo) => modelo.activo && modelo.sede === sede);
  function opcionesDeCelda(colaborador: Colaborador) {
    return [
      { value: "descanso", label: "Descanso libre" },
      ...modelosDeSede(colaborador.sede).map((modelo) => ({ value: modelo.id, label: `${modelo.nombre} · ${modelo.entrada} a ${modelo.salida}` })),
      { value: "personalizado", label: "Horario personalizado…" },
      { value: "", label: "Quitar asignación" },
    ];
  }

  function cambiarSemana(destino: string) {
    if (cambios) return pedirConfirmacion({ tipo: "cambiar-semana", destino });
    navegarSemana(destino);
  }
  function actualizar(celda: Celda | undefined, colaborador: Colaborador, fecha: string, valor: string) {
    if (valor === "personalizado") {
      setPersonalizado({ colaborador, fecha });
      dialogoPersonalizado.current?.showModal();
      return;
    }
    const clave = `${colaborador.idHuellero}:${fecha}`;
    setCambios(true);
    setCeldas((actuales) => valor === "" ? actuales.filter((item) => `${item.idHuellero}:${item.fecha}` !== clave) : [
      ...actuales.filter((item) => `${item.idHuellero}:${item.fecha}` !== clave),
      valor === "descanso"
        ? { idHuellero: colaborador.idHuellero, fecha, sede: colaborador.sede, entradaProgramada: null, salidaProgramada: null, descanso: true }
        : crearDesdeModelo(colaborador, fecha, modelos.find((modelo) => modelo.id === valor)!),
    ]);
  }
  function abrirDialogoCelda(colaborador: Colaborador, fecha: string) {
    setCeldaEnEdicion({ colaborador, fecha });
    dialogoCelda.current?.showModal();
  }
  function elegirEnDialogoCelda(formData: FormData) {
    if (!celdaEnEdicion) return;
    const valor = String(formData.get("opcion") ?? "");
    const clave = `${celdaEnEdicion.colaborador.idHuellero}:${celdaEnEdicion.fecha}`;
    dialogoCelda.current?.close();
    actualizar(porClave.get(clave), celdaEnEdicion.colaborador, celdaEnEdicion.fecha, valor);
  }
  async function guardar() {
    setGuardando(true); setError(undefined);
    try { await guardarBorradorDesdeGrilla(planId, JSON.stringify(celdas)); setCambios(false); setGuardadoEn(new Date().toISOString()); router.refresh(); }
    catch (causa) { setError(causa instanceof Error ? causa.message : "No se pudo guardar el borrador."); }
    finally { setGuardando(false); }
  }
  async function publicarPlanificacion() {
    setPublicando(true); setError(undefined);
    try {
      if (cambios) {
        await guardarBorradorDesdeGrilla(planId, JSON.stringify(celdas));
        setCambios(false);
        setGuardadoEn(new Date().toISOString());
      }
      const datos = new FormData();
      datos.set("planId", planId);
      await publicarPlanSemanalDesdeGrilla(datos);
      router.refresh();
    }
    catch (causa) { setError(causa instanceof Error ? causa.message : "No se pudo publicar el horario semanal."); }
    finally { setPublicando(false); }
  }
  async function reemplazarPlanificacion() {
    setPublicando(true); setError(undefined);
    try {
      if (cambios) {
        await guardarBorradorDesdeGrilla(planId, JSON.stringify(celdas));
        setCambios(false);
        setGuardadoEn(new Date().toISOString());
      }
      const datos = new FormData();
      datos.set("planId", planId);
      await reemplazarPlanificacionSemanalDesdeGrilla(datos);
      router.refresh();
    }
    catch (causa) { setError(causa instanceof Error ? causa.message : "No se pudo reemplazar la planificación semanal."); }
    finally { setPublicando(false); }
  }
  async function republicar(idHuellero: string, motivo: string) {
    if (cambios) { setError("Guarde el borrador antes de republicar."); return; }
    setPublicando(true); setError(undefined);
    const datos = new FormData();
    datos.set("planId", planId); datos.set("idHuellero", idHuellero); datos.set("motivo", motivo);
    try { await republicarPlanSemanalDesdeGrilla(datos); router.refresh(); }
    catch (causa) { setError(causa instanceof Error ? causa.message : "No se pudo republicar el horario semanal."); }
    finally { setPublicando(false); }
  }
  function guardarPersonalizado(formData: FormData) {
    if (!personalizado) return;
    const entrada = String(formData.get("entrada") ?? ""); const salida = String(formData.get("salida") ?? "");
    if (!/^\d{2}:\d{2}$/.test(entrada) || !/^\d{2}:\d{2}$/.test(salida) || salida <= entrada) { setError("El horario personalizado debe tener entrada y salida válidas del mismo día."); return; }
    actualizar(undefined, personalizado.colaborador, personalizado.fecha, "");
    setCeldas((actuales) => [...actuales, { idHuellero: personalizado.colaborador.idHuellero, fecha: personalizado.fecha, sede: personalizado.colaborador.sede, entradaProgramada: entrada, salidaProgramada: salida, descanso: false }]);
    setCambios(true); dialogoPersonalizado.current?.close();
  }
  function pedirConfirmacion(siguiente: Confirmacion) {
    setConfirmacion(siguiente);
    dialogoConfirmacion.current?.showModal();
  }
  function navegarSemana(destino: string) { router.push(`/turnos?semana=${destino}&equipo=${equipo}`); }
  function solicitarPublicacion() {
    if (resumen.faltantesPorColaborador.length) { setError(`Faltan asignaciones para ${resumen.faltantesPorColaborador.length} colaboradores.`); return; }
    pedirConfirmacion({ tipo: planificacionPublicada ? "reemplazar-planificacion" : "publicar" });
  }
  function confirmarOperacion(formData: FormData) {
    const actual = confirmacion;
    dialogoConfirmacion.current?.close();
    setConfirmacion(undefined);
    if (!actual) return;
    if (actual.tipo === "cambiar-semana") navegarSemana(actual.destino);
    if (actual.tipo === "publicar") void publicarPlanificacion();
    if (actual.tipo === "reemplazar-planificacion") void reemplazarPlanificacion();
    if (actual.tipo === "republicar") void republicar(actual.idHuellero, String(formData.get("motivo") ?? "").trim());
  }

  function contenidoDeChip(celda: Celda | Publicado | undefined) {
    if (!celda) return <span className="chip-vacio">＋ Asignar</span>;
    if (celda.descanso) return <b>Descanso</b>;
    const nombre = modelos.find((modelo) => modelo.id === celda.modeloHorarioId)?.nombre ?? "Personalizado";
    return <><b>{celda.entradaProgramada}–{celda.salidaProgramada}</b><small>{nombre}</small></>;
  }
  function renderCelda(colaborador: Colaborador, fecha: string, semanaProcesada: boolean) {
    const clave = `${colaborador.idHuellero}:${fecha}`;
    const publicado = publicadosPorClave.get(clave);
    const celda = porClave.get(clave);
    const mostrado = celda ?? publicado;
    const estado = estadoDeCelda(celda, publicado, semanaProcesada);
    const clases = ["celda-plan-semanal"];
    if (publicado) clases.push("publicado");
    if (mostrado?.descanso) clases.push("descanso");
    if (!mostrado) clases.push("vacia");
    return <td className={clases.join(" ")} key={fecha}>
      <button aria-haspopup="dialog" aria-label={`Horario de ${colaborador.nombre} para ${fecha}: ${NOMBRE_DEL_ESTADO_DE_HORARIO[estado]}`} className={`chip-turno estado-color-${estado}`} disabled={estado === "liquidado"} onClick={() => abrirDialogoCelda(colaborador, fecha)} type="button">
        <EtiquetaEstado className="etiqueta-estado-celda" estado={estado} />
        {contenidoDeChip(mostrado)}
        {mostrado && !mostrado.descanso && estado !== "liquidado" && <span aria-hidden="true" className="marca-edit">✎</span>}
      </button>
    </td>;
  }

  return <>
    <div className="herramientas-plan-semanal plan-barra">
      <div className="contexto-plan">
        <label className="selector-equipo"><span>Grupo</span><select aria-label="Equipo" onChange={(evento) => router.push(`/turnos?semana=${semana}&equipo=${evento.target.value}`)} value={equipo}>{equipos.map((item) => <option key={item} value={item}>{item === "tiendas" ? "Tiendas" : "Taller"}</option>)}</select></label>
        <SelectorSemanal semana={semana} alSeleccionar={cambiarSemana} />
      </div>
      <div className={`estado-doble ${cambios ? "sin-guardar" : ""}`}>
        <strong>{cambios ? "Sin guardar" : "Borrador guardado"}</strong>
        <span>{guardadoEn ? `Guardado ${formatearFecha(guardadoEn)}` : "Aún no guardado"}</span>
      </div>
      <div className="estado-doble">
        <strong>Planificación</strong>
        <span className={`chip-estado-plan estado-color-${estadoDeLaPlanificacion}`}>
          <EtiquetaEstado estado={estadoDeLaPlanificacion} />
          {planificacionPublicada || estadoDeLaPlanificacion === "liquidado" ? "" : ` · ${publicadosCompletos}/${colaboradores.length}`}
        </span>
      </div>
      <div className="medidor">
        <div className="cabeza"><span>Cobertura de la semana</span><span>{resumen.asignadas} / {resumen.total} días</span></div>
        <div className="pista-barra"><i style={{ width: `${resumen.total ? Math.round((resumen.asignadas / resumen.total) * 100) : 0}%` }} /></div>
      </div>
      <div className="acciones-plan"><button className="boton-secundario" disabled={!cambios || guardando} onClick={guardar} type="button">{guardando ? "Guardando…" : "Guardar borrador"}</button><button className="boton-principal" disabled={publicando || Boolean(resumen.faltantesPorColaborador.length)} onClick={solicitarPublicacion} type="button">{publicando ? "Publicando…" : "Publicar planificación"}</button></div>
      {error && <p role="alert">{error}</p>}
    </div>
    <div className="titulo-grilla"><h2>Grupo {equipo === "tiendas" ? "Tiendas" : "Taller"}</h2><span>{colaboradores.length} colaboradores · {sedes.length} {sedes.length === 1 ? "sede" : "sedes"}</span><span className="aviso-desplazamiento">Desplácese horizontalmente para ver la semana completa.</span></div><ul aria-label="Estados de la planificación" className="leyenda-estados leyenda-plan">{ESTADOS_DE_HORARIO.map((estado) => <li className={`estado-color-${estado}`} key={estado}><EtiquetaEstado estado={estado} /></li>)}</ul><div className="tabla-plan-semanal"><table><thead><tr><th>Colaborador</th>{dias.map((fecha) => <th key={fecha}>{new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${fecha}T00:00:00Z`))}</th>)}</tr></thead><tbody>
      {colaboradores.map((colaborador, indice) => { const semana = resumenSemanalDe(colaborador.idHuellero, dias, porClave, publicadosPorClave, procesadosPorId); return <Fragment key={colaborador.idHuellero}>
        {colaborador.sede !== colaboradores[indice - 1]?.sede && <tr className="grupo-sede"><th colSpan={dias.length + 1}>{colaborador.sede}</th></tr>}
        <tr><th scope="row"><div className="persona"><span className="ini">{iniciales(colaborador.nombre)}</span><span>{colaborador.nombre}<small>{colaborador.sede} · <EtiquetaEstado estado={semana.estado} /></small>{semana.tieneCambiosSinPublicar && !semana.semanaLiquidada && <button disabled={publicando} onClick={() => pedirConfirmacion({ tipo: "republicar", idHuellero: colaborador.idHuellero, nombre: colaborador.nombre })} type="button">Republicar cambios</button>}</span></div></th>{dias.map((fecha) => renderCelda(colaborador, fecha, semana.semanaLiquidada))}</tr>
      </Fragment>; })}
    </tbody></table></div>
    <footer className="pie-plan-semanal"><p><strong>{resumen.asignadas} de {resumen.total} días asignados</strong><span>{resumen.faltantesPorColaborador.length ? `Faltan asignaciones para ${resumen.faltantesPorColaborador.length} colaboradores.` : "La semana está completa y lista para publicar."}</span></p><div><button className="boton-secundario" disabled={!cambios || guardando} onClick={guardar} type="button">Guardar borrador</button><button className="boton-principal" disabled={publicando || Boolean(resumen.faltantesPorColaborador.length)} onClick={solicitarPublicacion} type="button">Publicar planificación</button></div></footer>
    <dialog className="dialogo-confirmacion" ref={dialogoConfirmacion}><form action={confirmarOperacion}><h2>{tituloDeConfirmacion(confirmacion)}</h2><p>{descripcionDeConfirmacion(confirmacion, resumen.faltantesPorColaborador.length)}</p>{(confirmacion?.tipo === "publicar" || confirmacion?.tipo === "reemplazar-planificacion") && <ul className="resumen-publicacion">{publicadosCompletos > 0 && <li>{publicadosCompletos} {publicadosCompletos === 1 ? "colaborador se republica" : "colaboradores se republican"}</li>}{nuevosAlPublicar > 0 && <li>{nuevosAlPublicar} {nuevosAlPublicar === 1 ? "colaborador se publica por primera vez" : "colaboradores se publican por primera vez"}</li>}</ul>}{confirmacion?.tipo === "republicar" && <label>Motivo de la republicación<input name="motivo" maxLength={250} required /></label>}<div className="acciones-dialogo"><button className="boton-secundario" onClick={() => dialogoConfirmacion.current?.close()} type="button">Cancelar</button><button className={confirmacion?.tipo === "publicar" || confirmacion?.tipo === "reemplazar-planificacion" ? "boton-principal" : "boton-secundario"} type="submit">{etiquetaDeConfirmacion(confirmacion)}</button></div></form></dialog>
    <dialog className="dialogo-confirmacion" ref={dialogoCelda}><form action={elegirEnDialogoCelda} key={celdaEnEdicion ? `${celdaEnEdicion.colaborador.idHuellero}:${celdaEnEdicion.fecha}` : "sin-celda"}><h2>Turno de {celdaEnEdicion?.colaborador.nombre ?? ""}</h2><p>{celdaEnEdicion ? formatearDiaLargo(celdaEnEdicion.fecha) : ""}</p><div className="opciones-celda">{celdaEnEdicion && opcionesDeCelda(celdaEnEdicion.colaborador).map((opcion) => <label key={opcion.value}><input defaultChecked={opcion.value === valorDe(porClave.get(`${celdaEnEdicion.colaborador.idHuellero}:${celdaEnEdicion.fecha}`) ?? publicadosPorClave.get(`${celdaEnEdicion.colaborador.idHuellero}:${celdaEnEdicion.fecha}`))} name="opcion" type="radio" value={opcion.value} />{opcion.label}</label>)}</div><div className="acciones-dialogo"><button className="boton-secundario" onClick={() => dialogoCelda.current?.close()} type="button">Cancelar</button><button className="boton-principal" type="submit">Usar</button></div></form></dialog>
    <dialog ref={dialogoPersonalizado}><form action={guardarPersonalizado}><h2>Horario personalizado</h2><label>Entrada<input defaultValue="09:00" name="entrada" type="time" required /></label><label>Salida<input defaultValue="18:00" name="salida" type="time" required /></label><button type="submit">Usar horario</button><button className="boton-secundario" onClick={() => dialogoPersonalizado.current?.close()} type="button">Cancelar</button></form></dialog>
  </>;
}

function SelectorSemanal({ semana, alSeleccionar }: { semana: string; alSeleccionar: (semana: string) => void }) {
  const [mes, setMes] = useState(semana.slice(0, 7));
  const [semanaEnHover, setSemanaEnHover] = useState<string>();
  const [calendarioAbierto, setCalendarioAbierto] = useState(false);
  const inicioSemana = new Date(`${semana}T00:00:00Z`);
  const finSemana = new Date(inicioSemana); finSemana.setUTCDate(finSemana.getUTCDate() + 6);
  const formato = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  useEffect(() => setMes(semana.slice(0, 7)), [semana]);

  function seleccionar(fecha: string) {
    setCalendarioAbierto(false);
    alSeleccionar(inicio(fecha));
  }

  return <section aria-label="Selector semanal" className="selector-semanal"><button aria-label="Semana anterior" className="boton-secundario" onClick={() => alSeleccionar(desplazarSemana(semana, -7))} type="button">‹</button><div className="selector-fecha-semanal"><span>Semana</span><button aria-expanded={calendarioAbierto} aria-haspopup="dialog" className="boton-fecha-semanal" onClick={() => setCalendarioAbierto((abierto) => !abierto)} type="button"><strong>{formato.format(inicioSemana)} al {formato.format(finSemana)}</strong></button></div><button aria-label="Semana siguiente" className="boton-secundario" onClick={() => alSeleccionar(desplazarSemana(semana, 7))} type="button">›</button>{calendarioAbierto && <div aria-label="Elegir semana" className="calendario-semanal" role="dialog"><div className="encabezado-calendario-semanal"><button aria-label="Mes anterior" className="boton-secundario" onClick={() => setMes(desplazarMes(mes, -1))} type="button">‹</button><strong>{nombreDelMes(mes)}</strong><button aria-label="Mes siguiente" className="boton-secundario" onClick={() => setMes(desplazarMes(mes, 1))} type="button">›</button></div><div aria-hidden="true" className="dias-calendario-semanal">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((dia) => <span key={dia}>{dia}</span>)}</div><div className="dias-calendario-semanal fechas-calendario-semanal">{diasDelCalendario(mes).map((fecha) => { const semanaDeFecha = inicio(fecha); const esSemanaActiva = (semanaEnHover ?? semana) === semanaDeFecha; return <button aria-label={`Elegir la semana del ${fecha}`} className={`${fecha.slice(0, 7) === mes ? "" : "fuera-de-mes "}${esSemanaActiva ? "semana-activa" : ""}`} key={fecha} onClick={() => seleccionar(fecha)} onMouseEnter={() => setSemanaEnHover(semanaDeFecha)} onMouseLeave={() => setSemanaEnHover(undefined)} type="button">{Number(fecha.slice(-2))}</button>; })}</div><p>Seleccione cualquier día para ver su semana completa.</p><div className="acciones-calendario-semanal"><button className="boton-secundario" onClick={() => seleccionar(new Date().toISOString().slice(0, 10))} type="button">Hoy</button><button className="boton-secundario" onClick={() => setCalendarioAbierto(false)} type="button">Cancelar</button></div></div>}</section>;
}
function crearDesdeModelo(colaborador: Colaborador, fecha: string, modelo: Modelo): Celda { return { idHuellero: colaborador.idHuellero, fecha, sede: colaborador.sede, modeloHorarioId: modelo.id, entradaProgramada: modelo.entrada, salidaProgramada: modelo.salida, descanso: false }; }
function valorDe(celda: Celda | Publicado | undefined) { return celda?.descanso ? "descanso" : celda?.modeloHorarioId ?? ""; }
function iniciales(nombre: string) { return nombre.split(/\s+/).map((parte) => parte[0]).join("").slice(0, 2).toUpperCase(); }
function formatearFecha(valor: string) { return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(valor)); }
function formatearDiaLargo(fecha: string) { return new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${fecha}T00:00:00Z`)); }
function tituloDeConfirmacion(confirmacion: Confirmacion | undefined) {
  if (confirmacion?.tipo === "cambiar-semana") return "¿Descartar los cambios sin guardar?";
  if (confirmacion?.tipo === "publicar") return "¿Publicar esta planificación?";
  if (confirmacion?.tipo === "reemplazar-planificacion") return "Esta semana ya está publicada";
  if (confirmacion?.tipo === "republicar") return `¿Republicar los cambios de ${confirmacion.nombre}?`;
  return "Confirmar acción";
}
function descripcionDeConfirmacion(confirmacion: Confirmacion | undefined, faltantes: number) {
  if (confirmacion?.tipo === "cambiar-semana") return "Se perderán los cambios que aún no guardó.";
  if (confirmacion?.tipo === "publicar") return faltantes ? `Aún faltan ${faltantes} colaboradores por completar.` : "El horario quedará disponible para la revisión de asistencias.";
  if (confirmacion?.tipo === "reemplazar-planificacion") return "Al publicar, se reemplazará toda la planificación vigente de esta semana. La versión anterior quedará guardada en el historial.";
  if (confirmacion?.tipo === "republicar") return "La republicación queda registrada con su motivo e invalida las asistencias pendientes de esa semana.";
  return "Revise esta acción antes de continuar.";
}
function etiquetaDeConfirmacion(confirmacion: Confirmacion | undefined) {
  if (confirmacion?.tipo === "cambiar-semana") return "Descartar y cambiar";
  if (confirmacion?.tipo === "publicar") return "Publicar planificación";
  if (confirmacion?.tipo === "reemplazar-planificacion") return "Reemplazar y publicar";
  if (confirmacion?.tipo === "republicar") return "Republicar cambios";
  return "Confirmar";
}
function inicio(fecha: string) { return inicioDeSemana(fecha); }
function desplazarMes(mes: string, cantidad: number) { const fecha = new Date(`${mes}-01T00:00:00Z`); fecha.setUTCMonth(fecha.getUTCMonth() + cantidad); return fecha.toISOString().slice(0, 7); }
function nombreDelMes(mes: string) { return new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mes}-01T00:00:00Z`)); }
function diasDelCalendario(mes: string) { const primero = new Date(`${mes}-01T00:00:00Z`); const inicioCalendario = new Date(primero); inicioCalendario.setUTCDate(inicioCalendario.getUTCDate() - ((inicioCalendario.getUTCDay() + 6) % 7)); return Array.from({ length: 42 }, (_, indice) => { const fecha = new Date(inicioCalendario); fecha.setUTCDate(fecha.getUTCDate() + indice); return fecha.toISOString().slice(0, 10); }); }
function desplazarSemana(semana: string, dias: number) { const fecha = new Date(`${semana}T00:00:00Z`); fecha.setUTCDate(fecha.getUTCDate() + dias); return fecha.toISOString().slice(0, 10); }
function estaPublicadaLaSemana(idHuellero: string, dias: string[], publicados: Map<string, Publicado>) { return dias.every((fecha) => publicados.has(`${idHuellero}:${fecha}`)); }
function hayCambiosSinPublicar(idHuellero: string, dias: string[], celdas: Map<string, Celda>, publicados: Map<string, Publicado>) {
  return dias.some((fecha) => {
    const clave = `${idHuellero}:${fecha}`; const celda = celdas.get(clave); const publicado = publicados.get(clave);
    return Boolean(celda && publicado && difiereDelPublicado(celda, publicado));
  });
}

// Estado de la semana de un colaborador, más los intermedios que la fila también necesita.
function resumenSemanalDe(idHuellero: string, dias: string[], celdas: Map<string, Celda>, publicados: Map<string, Publicado>, liquidadas: Set<string>) {
  const semanaPublicada = estaPublicadaLaSemana(idHuellero, dias, publicados);
  const semanaLiquidada = liquidadas.has(idHuellero);
  const tieneCambiosSinPublicar = semanaPublicada && hayCambiosSinPublicar(idHuellero, dias, celdas, publicados);
  return { semanaPublicada, semanaLiquidada, tieneCambiosSinPublicar, estado: estadoDeSemana({ semanaPublicada, semanaLiquidada, hayCambiosSinPublicar: tieneCambiosSinPublicar }) };
}

// Al resumir toda la grilla en un estado se muestra el más pendiente de acción.
const PRIORIDAD_ESTADO_PLANIFICACION: EstadoDeHorario[] = ["cambios-sin-publicar", "borrador-editable", "publicado", "liquidado"];

function EtiquetaEstado({ estado, className }: { estado: EstadoDeHorario; className?: string }) {
  const contenido = <>{estado === "liquidado" && <IconoCandado />}{NOMBRE_DEL_ESTADO_DE_HORARIO[estado]}</>;
  return className ? <span className={className}>{contenido}</span> : contenido;
}

function IconoCandado() {
  return <svg aria-hidden="true" className="icono-candado" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><rect x="3.25" y="7" width="9.5" height="6.5" rx="1.4" fill="currentColor" /><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}
