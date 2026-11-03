"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ConAviso } from "@/app/aviso-flotante";
import { IconoCandado } from "@/app/icono-candado";
import { SelectorSemanal } from "@/app/selector-semanal";
import type { Grupo } from "@/turnos/configurar-equipos-operativos";
import type { ModeloDeHorario } from "@/turnos/gestionar-modelos-de-horario";
import { estaVigenteEn, type Vigencia } from "@/relaciones-laborales/vigencia";
import { MOTIVOS_ELEGIBLES_DE_NO_ASISTENCIA, esMotivoPlanificadoDeNoAsistencia, type MotivoPlanificadoDeNoAsistencia } from "@/turnos/jornada-planificada";
import type { CeldaDePlanSemanalEnBorrador, HorarioSemanalParaCopiar } from "@/turnos/plan-semanal-en-borrador";
import { inicioDeSemana } from "@/turnos/semana";
import { ajustarSemanaALaRelacionLaboral } from "@/turnos/semana-con-relacion-laboral";

import { MenuDeAcciones, type AccionDeMenu } from "./menu-de-acciones";
import { guardarBorradorDesdeGrilla, publicarPlanSemanalDesdeGrilla, republicarPlanSemanalDesdeGrilla } from "./actions";
import { ESTADOS_DE_HORARIO, type EstadoDeHorario, NOMBRE_DEL_ESTADO_DE_HORARIO, difiereDelPublicado, estadoDeCelda, estadoDeSemana } from "./estado-de-celda";
import { resumirPlanSemanal } from "./resumen-plan-semanal";
import { esElegibleParaPublicar, seleccionEfectiva } from "./seleccion-de-publicacion";

type Celda = Omit<CeldaDePlanSemanalEnBorrador, "planId">;
type Colaborador = { dni: string; nombre: string; sede: string | null };
type Modelo = ModeloDeHorario;
type Publicado = HorarioSemanalParaCopiar;
type Confirmacion = { tipo: "cambiar-semana"; destino: string } | { tipo: "publicar" } | { tipo: "republicar"; dni: string; nombre: string };
type ResultadoDeDia = "laboral" | MotivoPlanificadoDeNoAsistencia;

export function PlanificadorSemanal({ actualizadoEn, equipos, planId, semana, equipo, colaboradores, dias, celdasIniciales, publicados, procesados, modelos, sedes, vigencias = {}, soloLectura = false }: {
  actualizadoEn?: string; equipos: Grupo[]; planId: string; semana: string; equipo: Grupo; colaboradores: Colaborador[]; dias: string[]; celdasIniciales: Celda[]; publicados: Publicado[]; procesados: string[]; modelos: Modelo[]; sedes: string[]; vigencias?: Record<string, Vigencia[]>; soloLectura?: boolean;
}) {
  const router = useRouter();
  const dialogoPersonalizado = useRef<HTMLDialogElement>(null);
  const dialogoConfirmacion = useRef<HTMLDialogElement>(null);
  const dialogoCelda = useRef<HTMLDialogElement>(null);
  const dialogoCompletarSemana = useRef<HTMLDialogElement>(null);
  const numeroDeAperturaPersonalizada = useRef(0);
  const numeroDeAperturaCompletarSemana = useRef(0);
  const [celdasEditadas, setCeldas] = useState(celdasIniciales);
  // Los días fuera de la relación laboral confirmada son «Sin relación laboral» y no se editan (ADR 0012).
  const celdas = useMemo(() => celdasAjustadasALaRelacion(celdasEditadas, colaboradores, dias, vigencias), [celdasEditadas, colaboradores, dias, vigencias]);
  const [cambios, setCambios] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState<string>();
  const [errorDeDialogo, setErrorDeDialogo] = useState<{ dialogo: "personalizado" | "completar"; mensaje: string }>();
  const [guardadoEn, setGuardadoEn] = useState(actualizadoEn);
  const [personalizado, setPersonalizado] = useState<{ colaborador: Colaborador; fecha: string; celda?: Celda | Publicado; apertura: number }>();
  const [confirmacion, setConfirmacion] = useState<Confirmacion>();
  const [celdaEnEdicion, setCeldaEnEdicion] = useState<{ colaborador: Colaborador; fecha: string }>();
  const [completarSemana, setCompletarSemana] = useState<{ colaborador: Colaborador; apertura: number }>();
  const [sedeCompletarSemana, setSedeCompletarSemana] = useState("");
  const [overridesDeSeleccion, setOverridesDeSeleccion] = useState<Map<string, boolean>>(new Map());
  // Al cambiar la clave del formulario de un diálogo React lo vuelve a montar y el foco inicial se pierde: se devuelve al primer control.
  useEffect(() => { if (completarSemana) dialogoCompletarSemana.current?.querySelector<HTMLElement>("select")?.focus(); }, [completarSemana]);
  useEffect(() => { if (personalizado) dialogoPersonalizado.current?.querySelector<HTMLElement>("select")?.focus(); }, [personalizado]);
  useEffect(() => { if (celdaEnEdicion) dialogoCelda.current?.querySelector<HTMLElement>("input:checked")?.focus(); }, [celdaEnEdicion]);
  useEffect(() => setGuardadoEn(actualizadoEn), [actualizadoEn]);
  // Las decisiones de selección son válidas solo mientras se planifica esta semana:
  // al cambiar de plan (semana o grupo) se descartan para no arrastrar una deselección
  // manual a un colaborador con el mismo id en otra semana.
  useEffect(() => setOverridesDeSeleccion(new Map()), [planId]);
  const porClave = useMemo(() => new Map(celdas.map((celda) => [`${celda.dni}:${celda.fecha}`, celda])), [celdas]);
  const publicadosPorClave = useMemo(() => new Map(publicados.map((celda) => [`${celda.dni}:${celda.fecha}`, celda])), [publicados]);
  const procesadosPorId = useMemo(() => new Set(procesados), [procesados]);
  const resumen = useMemo(() => resumirPlanSemanal(colaboradores, dias, celdas, publicados), [celdas, colaboradores, dias, publicados]);
  const publicadosCompletos = useMemo(() => colaboradores.filter(({ dni }) => estaPublicadaLaSemana(dni, dias, publicadosPorClave)).length, [colaboradores, dias, publicadosPorClave]);
  const planificacionPublicada = publicadosCompletos === colaboradores.length && colaboradores.length > 0;
  const resumenesPorColaborador = useMemo(
    () => new Map(colaboradores.map((colaborador) => [colaborador.dni, resumenSemanalDe(colaborador.dni, dias, porClave, publicadosPorClave, procesadosPorId, vigencias[colaborador.dni] ?? [])])),
    [colaboradores, dias, porClave, publicadosPorClave, procesadosPorId, vigencias],
  );
  const sinRelacionEnLaSemana = useMemo(() => colaboradores.filter(({ dni }) => { const semana = resumenesPorColaborador.get(dni)!; return semana.semanaSinRelacionLaboral && !semana.semanaPublicada; }), [colaboradores, resumenesPorColaborador]);
  const idsElegiblesParaPublicar = useMemo(() => colaboradores
    .filter(({ dni }) => esElegibleParaPublicar(resumenesPorColaborador.get(dni)!))
    .map(({ dni }) => dni), [colaboradores, resumenesPorColaborador]);
  const elegiblesParaPublicar = useMemo(() => new Set(idsElegiblesParaPublicar), [idsElegiblesParaPublicar]);
  const seleccionados = useMemo(() => seleccionEfectiva(idsElegiblesParaPublicar, overridesDeSeleccion), [idsElegiblesParaPublicar, overridesDeSeleccion]);
  const motivosDeAccionesDeshabilitadas = [!cambios && !guardando ? "Guardar borrador está deshabilitado porque no hay cambios sin guardar." : "", !seleccionados.size && !publicando ? `Publicar planificación está deshabilitado porque no hay colaboradores marcados para publicar.${sinRelacionEnLaSemana.length ? " Recursos Humanos debe confirmar la relación laboral de quienes no la tienen en esta semana." : ""}` : ""].filter(Boolean).join(" ");
  const estadoDeLaPlanificacion = useMemo<EstadoDeHorario>(() => {
    if (!colaboradores.length) return "borrador-editable";
    const estados = new Set([...resumenesPorColaborador.values()].map((item) => item.estado));
    return PRIORIDAD_ESTADO_PLANIFICACION.find((estado) => estados.has(estado)) ?? "liquidado";
  }, [colaboradores, resumenesPorColaborador]);
  function alternarSeleccion(dni: string, seleccionado: boolean) {
    setOverridesDeSeleccion((actuales) => new Map(actuales).set(dni, seleccionado));
  }

  function opcionesDeCelda() {
    return [
      ...MOTIVOS_ELEGIBLES_DE_NO_ASISTENCIA.map((motivo) => ({ value: `motivo:${motivo}`, label: ETIQUETA_DE_MOTIVO[motivo] })),
      ...modelos.filter((modelo) => modelo.activo).map((modelo) => ({ value: `modelo:${modelo.id}`, label: `${modelo.sede} · ${modelo.nombre} · ${modelo.entrada} a ${modelo.salida}` })),
      { value: "personalizado", label: "Horario personalizado…" },
      { value: "", label: "Quitar asignación" },
    ];
  }

  function cambiarSemana(destino: string) {
    if (cambios) return pedirConfirmacion({ tipo: "cambiar-semana", destino });
    navegarSemana(destino);
  }
  function actualizar(celda: Celda | Publicado | undefined, colaborador: Colaborador, fecha: string, valor: string) {
    if (valor === "personalizado") {
      numeroDeAperturaPersonalizada.current += 1;
      setErrorDeDialogo(undefined);
      setPersonalizado({ colaborador, fecha, celda, apertura: numeroDeAperturaPersonalizada.current });
      dialogoPersonalizado.current?.showModal();
      return;
    }
    const clave = `${colaborador.dni}:${fecha}`;
    setCambios(true);
    setCeldas((actuales) => valor === "" ? actuales.filter((item) => `${item.dni}:${item.fecha}` !== clave) : [
      ...actuales.filter((item) => `${item.dni}:${item.fecha}` !== clave),
      valor.startsWith("motivo:")
        ? crearNoAsistencia(colaborador.dni, fecha, valor.slice("motivo:".length) as MotivoPlanificadoDeNoAsistencia)
        : crearDesdeModelo(colaborador.dni, fecha, modelos.find((modelo) => `modelo:${modelo.id}` === valor)!),
    ]);
  }
  function abrirDialogoCelda(colaborador: Colaborador, fecha: string) {
    setCeldaEnEdicion({ colaborador, fecha });
    dialogoCelda.current?.showModal();
  }
  function elegirEnDialogoCelda(formData: FormData) {
    if (!celdaEnEdicion) return;
    const valor = String(formData.get("opcion") ?? "");
    const clave = `${celdaEnEdicion.colaborador.dni}:${celdaEnEdicion.fecha}`;
    dialogoCelda.current?.close();
    actualizar(porClave.get(clave) ?? publicadosPorClave.get(clave), celdaEnEdicion.colaborador, celdaEnEdicion.fecha, valor);
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
      for (const dni of seleccionados) datos.append("dni", dni);
      await publicarPlanSemanalDesdeGrilla(datos);
      router.refresh();
    }
    catch (causa) { setError(causa instanceof Error ? causa.message : "No se pudo publicar el horario semanal."); }
    finally { setPublicando(false); }
  }
  async function republicar(dni: string, motivo: string) {
    if (cambios) { setError("Guarde el borrador antes de republicar."); return; }
    setPublicando(true); setError(undefined);
    const datos = new FormData();
    datos.set("planId", planId); datos.set("dni", dni); datos.set("motivo", motivo);
    try { await republicarPlanSemanalDesdeGrilla(datos); router.refresh(); }
    catch (causa) { setError(causa instanceof Error ? causa.message : "No se pudo republicar el horario semanal."); }
    finally { setPublicando(false); }
  }
  function guardarPersonalizado(formData: FormData) {
    if (!personalizado) return;
    const sede = String(formData.get("sede") ?? ""); const entrada = String(formData.get("entrada") ?? ""); const salida = String(formData.get("salida") ?? "");
    if (!sedes.includes(sede)) { setErrorDeDialogo({ dialogo: "personalizado", mensaje: "Seleccione una sede activa del grupo." }); return; }
    if (!/^\d{2}:\d{2}$/.test(entrada) || !/^\d{2}:\d{2}$/.test(salida) || salida <= entrada) { setErrorDeDialogo({ dialogo: "personalizado", mensaje: "El horario personalizado debe tener entrada y salida válidas del mismo día." }); return; }
    const clave = `${personalizado.colaborador.dni}:${personalizado.fecha}`;
    setCeldas((actuales) => [
      ...actuales.filter((item) => `${item.dni}:${item.fecha}` !== clave),
      { dni: personalizado.colaborador.dni, fecha: personalizado.fecha, sede, modeloHorarioId: null, entradaProgramada: entrada, salidaProgramada: salida, descanso: false, motivoNoAsistencia: null },
    ]);
    setCambios(true); setError(undefined); cerrarPersonalizado();
  }
  function cerrarPersonalizado() {
    dialogoPersonalizado.current?.close();
    setErrorDeDialogo(undefined);
    setPersonalizado(undefined);
  }
  function abrirCompletarSemana(colaborador: Colaborador) {
    numeroDeAperturaCompletarSemana.current += 1;
    setErrorDeDialogo(undefined);
    setSedeCompletarSemana(sedes[0] ?? "");
    setCompletarSemana({ colaborador, apertura: numeroDeAperturaCompletarSemana.current });
    dialogoCompletarSemana.current?.showModal();
  }
  function cerrarCompletarSemana() {
    dialogoCompletarSemana.current?.close();
    setErrorDeDialogo(undefined);
    setCompletarSemana(undefined);
  }
  function confirmarCompletarSemana(formData: FormData) {
    if (!completarSemana) return;
    const modelo = modelos.find((item) => item.id === String(formData.get("modelo") ?? ""));
    const resultados: Record<string, ResultadoDeDia> = {};
    for (const fecha of dias) {
      const valor = String(formData.get(`dia-${fecha}`) ?? "laboral");
      resultados[fecha] = esMotivoPlanificadoDeNoAsistencia(valor) ? valor : "laboral";
    }
    let nuevas: Celda[];
    try {
      const vigenciasDeLaPersona = vigencias[completarSemana.colaborador.dni] ?? [];
      const diasDentro = dias.filter((fecha) => estaVigenteEn(vigenciasDeLaPersona, fecha));
      nuevas = celdasDeSemanaCompleta(completarSemana.colaborador.dni, diasDentro, resultados, modelo);
    } catch (causa) {
      setErrorDeDialogo({ dialogo: "completar", mensaje: causa instanceof Error ? causa.message : "No se pudo completar la semana." });
      return;
    }
    const { dni } = completarSemana.colaborador;
    setCeldas((actuales) => [...actuales.filter((item) => !(item.dni === dni && dias.includes(item.fecha))), ...nuevas]);
    setCambios(true);
    setError(undefined);
    cerrarCompletarSemana();
  }
  function pedirConfirmacion(siguiente: Confirmacion) {
    setConfirmacion(siguiente);
    dialogoConfirmacion.current?.showModal();
  }
  function navegarSemana(destino: string) { router.push(`/turnos?semana=${destino}&equipo=${equipo}`); }
  function solicitarPublicacion() {
    if (!seleccionados.size) { setError("Seleccione al menos un colaborador para publicar."); return; }
    pedirConfirmacion({ tipo: "publicar" });
  }
  function confirmarOperacion(formData: FormData) {
    const actual = confirmacion;
    dialogoConfirmacion.current?.close();
    setConfirmacion(undefined);
    if (!actual) return;
    if (actual.tipo === "cambiar-semana") navegarSemana(actual.destino);
    if (actual.tipo === "publicar") void publicarPlanificacion();
    if (actual.tipo === "republicar") void republicar(actual.dni, String(formData.get("motivo") ?? "").trim());
  }

  function contenidoDeChip(celda: Celda | Publicado | undefined, estado: EstadoDeHorario) {
    if (!celda) return <span className="chip-vacio">{soloLectura ? "Sin asignar" : "＋ Asignar"}</span>;
    const candado = estado === "liquidado" ? <IconoCandado /> : null;
    if (celda.motivoNoAsistencia) return <b>{candado} {ETIQUETA_DE_MOTIVO[celda.motivoNoAsistencia]}</b>;
    return <><b>{candado} {celda.sede}</b><small>{celda.entradaProgramada}–{celda.salidaProgramada}</small></>;
  }
  function descripcionDeCelda(celda: Celda | Publicado | undefined) {
    if (!celda) return "Sin asignación";
    if (celda.motivoNoAsistencia) return ETIQUETA_DE_MOTIVO[celda.motivoNoAsistencia];
    return `${celda.sede}, ${celda.entradaProgramada} a ${celda.salidaProgramada}`;
  }
  function renderCelda(colaborador: Colaborador, fecha: string, semanaProcesada: boolean) {
    const clave = `${colaborador.dni}:${fecha}`;
    const publicado = publicadosPorClave.get(clave);
    const celda = porClave.get(clave);
    const mostrado = celda ?? publicado;
    const estado = estadoDeCelda(celda, publicado, semanaProcesada);
    const clases = ["celda-plan-semanal"];
    if (publicado) clases.push("publicado");
    if (mostrado?.motivoNoAsistencia || mostrado?.descanso) clases.push("descanso");
    if (!mostrado) clases.push("vacia");
    const claseDeEstado = mostrado ? CLASE_DE_ESTADO_DE_HORARIO[estado] : "est-vacio";
    const descripcion = `Horario de ${colaborador.nombre} para ${fecha}: ${descripcionDeCelda(mostrado)}. ${NOMBRE_DEL_ESTADO_DE_HORARIO[estado]}`;
    // Fuera de la relación laboral confirmada la celda es fija: la fija el sistema, no el gerente.
    if (!estaVigenteEn(vigencias[colaborador.dni] ?? [], fecha)) return <td className={`${clases.join(" ")} fuera-de-relacion`} key={fecha}>
      <span className="chip-turno est est-fuera"><span className="sr-only">{`${descripcion}. Fuera de la relación laboral confirmada por Recursos Humanos; no se puede editar.`}</span><b>Sin relación laboral</b></span>
    </td>;
    if (soloLectura) return <td className={clases.join(" ")} key={fecha}>
      <span className={`chip-turno est ${claseDeEstado}`}><span className="sr-only">{descripcion}</span>{contenidoDeChip(mostrado, estado)}</span>
    </td>;
    return <td className={clases.join(" ")} key={fecha}>
      <button aria-haspopup="dialog" aria-label={`Horario de ${colaborador.nombre} para ${fecha}: ${descripcionDeCelda(mostrado)}. ${NOMBRE_DEL_ESTADO_DE_HORARIO[estado]}`} className={`chip-turno est ${claseDeEstado}`} disabled={estado === "liquidado"} onClick={() => abrirDialogoCelda(colaborador, fecha)} type="button">
        {contenidoDeChip(mostrado, estado)}
        {mostrado && !mostrado.descanso && estado !== "liquidado" && <span aria-hidden="true" className="marca-edit">✎</span>}
      </button>
    </td>;
  }
  function accionesDe(colaborador: Colaborador, semana: ReturnType<typeof resumenSemanalDe>): AccionDeMenu[] {
    const motivoDeLiquidacion = "La semana está liquidada y ya no admite cambios.";
    const motivoDeOperacion = "Espere a que termine la operación en curso.";
    const sinCompletar = semana.semanaLiquidada ? motivoDeLiquidacion : publicando ? motivoDeOperacion : undefined;
    const sinRepublicar = semana.semanaLiquidada ? motivoDeLiquidacion
      : !semana.semanaPublicada ? "La semana todavía no se publicó. Use «Publicar planificación»."
      : !semana.tieneCambiosSinPublicar ? "No hay cambios sin publicar en esta semana."
      : publicando ? motivoDeOperacion : undefined;
    return [
      { clave: "completar", etiqueta: "Completar semana", alElegir: () => abrirCompletarSemana(colaborador), deshabilitada: Boolean(sinCompletar), motivoSiNoAplica: sinCompletar },
      { clave: "republicar", etiqueta: "Republicar cambios", alElegir: () => pedirConfirmacion({ tipo: "republicar", dni: colaborador.dni, nombre: colaborador.nombre }), deshabilitada: Boolean(sinRepublicar), motivoSiNoAplica: sinRepublicar },
    ];
  }

  const publicarDeshabilitado = !seleccionados.size && !publicando;
  const guardarDeshabilitado = !cambios && !guardando;
  const detalleDePublicar = { causa: "no hay colaboradores marcados para publicar.", paso: `marque «Publicar» en al menos una fila elegible.${sinRelacionEnLaSemana.length ? " Quien no tiene relación laboral confirmada no se puede marcar." : ""}` };
  const bloqueos: DetalleDeAviso[] = soloLectura ? [] : [
    ...(publicarDeshabilitado ? [{ titulo: "Publicar planificación", ...detalleDePublicar }] : []),
    ...sinRelacionEnLaSemana.map(({ nombre }) => ({ titulo: nombre, ...DETALLE_SIN_RELACION })),
  ];
  const detalleDelError = error ? detalleDeError(error) : undefined;
  const textoDelResumen = [bloqueos.length ? `${bloqueos.length} ${bloqueos.length === 1 ? "bloqueo" : "bloqueos"}` : "", detalleDelError ? "1 error" : ""].filter(Boolean).join(" y ");
  const porcentajeDeCobertura = resumen.total ? Math.round((resumen.asignadas / resumen.total) * 100) : 0;

  return <>
    <section className="tile panel tile-barra-plan">
      <div className="barra-plan">
        <label className="campo-plan campo-grupo"><span>Grupo</span><select aria-label="Grupo" onChange={(evento) => router.push(`/turnos?semana=${semana}&equipo=${evento.target.value}`)} value={equipo}>{equipos.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <SelectorSemanal semana={semana} alSeleccionar={cambiarSemana} />
        {!soloLectura && <div className={`dato-plan ${cambios ? "sin-guardar" : ""}`}>
          <span>Borrador</span>
          <strong>{cambios ? "Sin guardar" : "Borrador guardado"}</strong>
          <small>{guardadoEn ? `Guardado ${formatearFecha(guardadoEn)}` : "Aún no guardado"}</small>
        </div>}
        <div className="dato-plan">
          <span>Planificación</span>
          <span className={`est ${CLASE_DE_ESTADO_DE_HORARIO[estadoDeLaPlanificacion]} est-etiqueta`}>
            <EtiquetaEstado estado={estadoDeLaPlanificacion} />
            {planificacionPublicada || estadoDeLaPlanificacion === "liquidado" ? "" : ` · ${publicadosCompletos}/${colaboradores.length}`}
          </span>
        </div>
        <div className="cobertura-plan">
          <span>Cobertura de la semana · {resumen.asignadas} / {resumen.total} días</span>
          <div aria-label={`${porcentajeDeCobertura}% de días asignados`} className="pista-cobertura" role="img"><i style={{ width: `${porcentajeDeCobertura}%` }} /></div>
        </div>
      </div>
    </section>
    <section className="tile panel tile-grilla-plan">
      <header className="panel-cabecera">
        <div><h2>Grupo {equipo}</h2><p>{colaboradores.length} colaboradores · {sedes.length} {sedes.length === 1 ? "sede" : "sedes"}</p></div>
        {!soloLectura && <div className="acciones-plan">
          {textoDelResumen && <ConAviso aviso={{ titulo: textoDelResumen, filas: [...bloqueos, ...(detalleDelError ? [detalleDelError] : [])].map(({ titulo, causa, paso }) => ({ rotulo: titulo, texto: `${causa} Siguiente paso: ${paso}` })) }}>{(descripcion) => <button aria-describedby={descripcion} aria-label={`Ver ${textoDelResumen} de la planificación`} className="aviso-btn aviso-resumen" type="button"><IconoDeAlerta />{textoDelResumen}</button>}</ConAviso>}
          <button aria-describedby={motivosDeAccionesDeshabilitadas ? "motivo-acciones-plan" : undefined} className="boton-secundario" disabled={!cambios || guardando} onClick={guardar} type="button">{guardando ? "Guardando…" : "Guardar borrador"}</button>
          {guardarDeshabilitado && <ConAviso aviso={{ titulo: "Guardar deshabilitado", filas: [{ rotulo: "Causa", texto: "no hay cambios sin guardar." }, { rotulo: "Siguiente paso", texto: "edite un día de la grilla; el botón se activa solo." }] }}>{(descripcion) => <button aria-describedby={descripcion} aria-label="Guardar borrador está deshabilitado: ver causa" className="aviso-btn aviso-info" type="button"><IconoDeInfo /></button>}</ConAviso>}
          <button aria-describedby={motivosDeAccionesDeshabilitadas ? "motivo-acciones-plan" : undefined} className="boton-principal" disabled={publicando || !seleccionados.size} onClick={solicitarPublicacion} type="button">{publicando ? "Publicando…" : "Publicar planificación"}</button>
          {publicarDeshabilitado && <ConAviso aviso={{ titulo: "Publicar deshabilitado", filas: [{ rotulo: "Causa", texto: detalleDePublicar.causa }, { rotulo: "Siguiente paso", texto: detalleDePublicar.paso }] }}>{(descripcion) => <button aria-describedby={descripcion} aria-label="Publicar planificación está deshabilitado: ver causa" className="aviso-btn" type="button"><IconoDeAlerta /></button>}</ConAviso>}
        </div>}
      </header>
      {!soloLectura && motivosDeAccionesDeshabilitadas && <p className="sr-only" id="motivo-acciones-plan">{motivosDeAccionesDeshabilitadas}</p>}
      {error && <p className="sr-only" role="alert">{error}</p>}
      <ul aria-label="Estados de la planificación" className="est-leyenda"><li className="est-titulo">Estados</li>{ESTADOS_DE_HORARIO.map((estado) => <li className={`est ${CLASE_DE_ESTADO_DE_HORARIO[estado]}`} key={estado}><EtiquetaEstado estado={estado} /></li>)}<li className="est est-fuera">Sin relación laboral</li></ul>
      <div aria-label="Horario semanal, desplazable horizontalmente" className="tabla-plan-semanal" role="region" tabIndex={0}><table><thead><tr><th scope="col">Colaborador</th>{dias.map((fecha) => <th key={fecha} scope="col">{new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${fecha}T00:00:00Z`))}</th>)}</tr></thead><tbody>
        {colaboradores.map((colaborador) => { const semana = resumenesPorColaborador.get(colaborador.dni)!; return <tr key={colaborador.dni}><th scope="row"><div className="persona-plan"><span aria-hidden="true" className="ini">{iniciales(colaborador.nombre)}</span><span className="datos-persona"><span className="nombre-persona"><strong>{colaborador.nombre}</strong>{semana.semanaSinRelacionLaboral && !semana.semanaPublicada && <ConAviso aviso={{ titulo: "No se puede publicar", filas: [{ rotulo: "Causa", texto: DETALLE_SIN_RELACION.causa }, { rotulo: "Siguiente paso", texto: DETALLE_SIN_RELACION.paso }] }}>{(descripcion) => <button aria-describedby={descripcion} aria-label={`No se puede publicar a ${colaborador.nombre}: ver causa y siguiente paso`} className="aviso-btn" type="button"><IconoDeAlerta /></button>}</ConAviso>}</span><span className={`est ${CLASE_DE_ESTADO_DE_HORARIO[semana.estado]} est-etiqueta`}><EtiquetaEstado estado={semana.estado} /></span>{!soloLectura && <span className="fila-persona"><MenuDeAcciones acciones={accionesDe(colaborador, semana)} nombre={colaborador.nombre} />{elegiblesParaPublicar.has(colaborador.dni) && <label className="checkbox-publicar-fila"><input checked={seleccionados.has(colaborador.dni)} disabled={publicando} onChange={(evento) => alternarSeleccion(colaborador.dni, evento.target.checked)} type="checkbox" />Publicar</label>}</span>}</span></div></th>{dias.map((fecha) => renderCelda(colaborador, fecha, semana.semanaLiquidada))}</tr>; })}
      </tbody></table></div>
      <p className="aviso-desplazamiento">Desplácese horizontalmente para ver la semana completa. La columna de colaboradores queda fija.</p>
      <footer className="pie-plan-semanal"><p><strong>{resumen.asignadas} de {resumen.total} días asignados</strong>{!soloLectura && <span>{textoDeCobertura(resumen.faltantesPorColaborador.length, seleccionados.size)}</span>}</p></footer>
    </section>
    {!soloLectura && <>
    <dialog aria-labelledby="titulo-dialogo-confirmacion" className="dialogo-confirmacion" ref={dialogoConfirmacion}><form action={confirmarOperacion} className="formulario-dialogo"><h2 id="titulo-dialogo-confirmacion">{tituloDeConfirmacion(confirmacion)}</h2><p>{descripcionDeConfirmacion(confirmacion)}</p>{confirmacion?.tipo === "publicar" && <ul className="resumen-publicacion"><li>{seleccionados.size} {seleccionados.size === 1 ? "colaborador se publica" : "colaboradores se publican"}</li></ul>}{confirmacion?.tipo === "republicar" && <label>Motivo de la republicación<input maxLength={250} name="motivo" placeholder="Ej.: cambio de turno por cobertura" required /></label>}<div className="acciones-dialogo"><button className="boton-secundario" onClick={() => dialogoConfirmacion.current?.close()} type="button">Cancelar</button><button className={confirmacion?.tipo === "cambiar-semana" ? "peligro" : "boton-principal"} type="submit">{etiquetaDeConfirmacion(confirmacion)}</button></div></form></dialog>
    <dialog aria-labelledby="titulo-dialogo-celda" className="dialogo-confirmacion" ref={dialogoCelda}><form action={elegirEnDialogoCelda} key={celdaEnEdicion ? `${celdaEnEdicion.colaborador.dni}:${celdaEnEdicion.fecha}` : "sin-celda"}><h2 id="titulo-dialogo-celda">Horario semanal de {celdaEnEdicion?.colaborador.nombre ?? ""}</h2><p>{celdaEnEdicion ? formatearDiaLargo(celdaEnEdicion.fecha) : ""}</p><div className="opciones-celda">{opcionesDeCelda().map((opcion) => <label key={opcion.value}><input defaultChecked={opcion.value === valorDe(celdaEnEdicion ? porClave.get(`${celdaEnEdicion.colaborador.dni}:${celdaEnEdicion.fecha}`) ?? publicadosPorClave.get(`${celdaEnEdicion.colaborador.dni}:${celdaEnEdicion.fecha}`) : undefined)} name="opcion" type="radio" value={opcion.value} />{opcion.label}</label>)}</div><div className="acciones-dialogo"><button className="boton-secundario" onClick={() => dialogoCelda.current?.close()} type="button">Cancelar</button><button className="boton-principal" type="submit">Usar</button></div></form></dialog>
    <dialog aria-labelledby="titulo-dialogo-personalizado" className="dialogo-confirmacion" ref={dialogoPersonalizado}><form action={guardarPersonalizado} className="formulario-dialogo" key={personalizado ? `${personalizado.colaborador.dni}:${personalizado.fecha}:${personalizado.apertura}` : "sin-personalizar"}><h2 id="titulo-dialogo-personalizado">Horario personalizado</h2><label>Sede<select defaultValue={personalizado?.celda?.sede ?? sedes[0]} name="sede" required>{sedes.map((sede) => <option key={sede} value={sede}>{sede}</option>)}</select></label><div className="campos-horario-personalizado"><label>Entrada<input defaultValue={personalizado?.celda?.entradaProgramada ?? "09:00"} name="entrada" type="time" required /></label><label>Salida<input defaultValue={personalizado?.celda?.salidaProgramada ?? "18:00"} name="salida" type="time" required /></label></div>{errorDeDialogo?.dialogo === "personalizado" && <p className="mensaje-operacion error" role="alert">{errorDeDialogo.mensaje}</p>}<div className="acciones-dialogo"><button className="boton-secundario" onClick={cerrarPersonalizado} type="button">Cancelar</button><button className="boton-principal" type="submit">Usar horario</button></div></form></dialog>
    <dialog aria-labelledby="titulo-dialogo-completar-semana" className="dialogo-confirmacion dialogo-completar-semana" ref={dialogoCompletarSemana}><form action={confirmarCompletarSemana} className="formulario-dialogo" key={completarSemana ? `${completarSemana.colaborador.dni}:${completarSemana.apertura}` : "sin-completar"}>
      <h2 id="titulo-dialogo-completar-semana">Completar semana de {completarSemana?.colaborador.nombre ?? ""}</h2>
      <p>Elija la sede y el modelo por defecto, y decida qué días son laborales o un motivo de no asistencia. Confirmar reemplaza los días editables de esta fila; los días fuera de la relación laboral confirmada quedan «Sin relación laboral».</p>
      <label>Sede por defecto<select defaultValue={sedes[0] ?? ""} name="sede" onChange={(evento) => setSedeCompletarSemana(evento.target.value)} required>{sedes.map((sede) => <option key={sede} value={sede}>{sede}</option>)}</select></label>
      <label>Modelo por defecto (solo necesario para los días laborales)<select key={sedeCompletarSemana} name="modelo">{modelos.filter((modelo) => modelo.activo && modelo.sede === sedeCompletarSemana).map((modelo) => <option key={modelo.id} value={modelo.id}>{modelo.nombre} · {modelo.entrada} a {modelo.salida}</option>)}</select></label>
      <div className="dias-completar-semana">{dias.map((fecha) => <label key={fecha}>{formatearDiaLargo(fecha)}{completarSemana && !estaVigenteEn(vigencias[completarSemana.colaborador.dni] ?? [], fecha) ? <select aria-label={`${formatearDiaLargo(fecha)}: Sin relación laboral`} defaultValue="sin_relacion_laboral" disabled><option value="sin_relacion_laboral">Sin relación laboral</option></select> : <select defaultValue="laboral" name={`dia-${fecha}`}><option value="laboral">Laboral</option>{MOTIVOS_ELEGIBLES_DE_NO_ASISTENCIA.map((motivo) => <option key={motivo} value={motivo}>{ETIQUETA_DE_MOTIVO[motivo]}</option>)}</select>}</label>)}</div>
      {errorDeDialogo?.dialogo === "completar" && <p className="mensaje-operacion error" role="alert">{errorDeDialogo.mensaje}</p>}
      <div className="acciones-dialogo"><button className="boton-secundario" onClick={cerrarCompletarSemana} type="button">Cancelar</button><button className="boton-principal" type="submit">Completar semana</button></div>
    </form></dialog>
    </>}
  </>;
}

type DetalleDeAviso = { titulo: string; causa: string; paso: string };
const DETALLE_SIN_RELACION = { causa: "no tiene una relación laboral confirmada en esta semana.", paso: "Recursos Humanos debe registrar y confirmar su ingreso." };
const PASO_GENERICO = "intente de nuevo; si el error continúa, avise al Administrador del sistema.";
// Cada mensaje del código conserva su texto como título del tooltip y suma causa y siguiente paso.
function detalleDeError(mensaje: string): DetalleDeAviso {
  const titulo = mensaje.replace(/\.$/, "");
  if (mensaje === "Guarde el borrador antes de republicar.") return { titulo, causa: "hay cambios sin guardar en la grilla.", paso: "pulse «Guardar borrador» y vuelva a «Republicar cambios»." };
  if (mensaje === "Seleccione al menos un colaborador para publicar.") return { titulo, causa: "no hay ninguna fila marcada.", paso: "marque «Publicar» en una fila elegible y pulse de nuevo." };
  if (mensaje === "No se pudo guardar el borrador.") return { titulo, causa: "el servidor no confirmó el guardado.", paso: PASO_GENERICO };
  return { titulo: "Error", causa: mensaje, paso: PASO_GENERICO };
}
const CLASE_DE_ESTADO_DE_HORARIO: Record<EstadoDeHorario, string> = {
  "borrador-editable": "est-borrador",
  publicado: "est-publicado",
  "cambios-sin-publicar": "est-cambios",
  liquidado: "est-liquidado",
};
function IconoDeAlerta() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 22.5 21H1.5z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" /><path d="M12 9.6v5M12 17.4v.1" stroke="#fff" strokeLinecap="round" strokeWidth="2.2" /></svg>; }
function IconoDeInfo() { return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor" /><path d="M12 11v5.4M12 7.7v.1" stroke="#fff" strokeLinecap="round" strokeWidth="2.2" /></svg>; }

const ETIQUETA_DE_MOTIVO: Record<MotivoPlanificadoDeNoAsistencia, string> = {
  descanso: "Descanso",
  feriado: "Feriado",
  vacaciones: "Vacaciones",
  permiso: "Permiso",
  suspension: "Suspensión",
  sin_relacion_laboral: "Sin relación laboral",
};
function crearDesdeModelo(dni: string, fecha: string, modelo: Modelo): Celda { return { dni, fecha, sede: modelo.sede, modeloHorarioId: modelo.id, entradaProgramada: modelo.entrada, salidaProgramada: modelo.salida, descanso: false, motivoNoAsistencia: null }; }
function crearNoAsistencia(dni: string, fecha: string, motivoNoAsistencia: MotivoPlanificadoDeNoAsistencia): Celda { return { dni, fecha, sede: null, modeloHorarioId: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia }; }
// Reemplaza los siete días editables mostrados para un colaborador desde el modal "Completar semana":
// los días laborales usan la sede y horas del modelo por defecto; el resto queda con su motivo elegido.
export function celdasDeSemanaCompleta(dni: string, dias: string[], resultados: Record<string, ResultadoDeDia>, modeloPorDefecto: Modelo | undefined): Celda[] {
  return dias.map((fecha) => {
    const resultado = resultados[fecha] ?? "laboral";
    if (resultado === "laboral") {
      if (!modeloPorDefecto) throw new Error("Seleccione un modelo de horario por defecto.");
      return crearDesdeModelo(dni, fecha, modeloPorDefecto);
    }
    return crearNoAsistencia(dni, fecha, resultado);
  });
}
export function valorDe(celda: Celda | Publicado | undefined) {
  if (celda?.motivoNoAsistencia) return `motivo:${celda.motivoNoAsistencia}`;
  if (celda?.modeloHorarioId) return `modelo:${celda.modeloHorarioId}`;
  return celda ? "personalizado" : "";
}
// Celdas del plan ajustadas a la relación laboral confirmada de cada persona: días fuera = «Sin relación laboral».
export function celdasAjustadasALaRelacion(celdas: Celda[], colaboradores: Colaborador[], dias: string[], vigencias: Record<string, Vigencia[]>): Celda[] {
  const conocidos = new Set(colaboradores.map(({ dni }) => dni));
  return [
    ...celdas.filter(({ dni }) => !conocidos.has(dni)),
    ...colaboradores.flatMap(({ dni }) => ajustarSemanaALaRelacionLaboral(vigencias[dni] ?? [], dni, dias, celdas.filter((celda) => celda.dni === dni)) as Celda[]),
  ];
}
function iniciales(nombre: string) { return nombre.split(/\s+/).map((parte) => parte[0]).join("").slice(0, 2).toUpperCase(); }
function formatearFecha(valor: string) { return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(valor)); }
function formatearDiaLargo(fecha: string) { return new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${fecha}T00:00:00Z`)); }
// El botón de publicar ahora depende de la selección, no de que la semana esté completa:
// el pie debe explicar por qué está deshabilitado en cada uno de los tres casos posibles.
function textoDeCobertura(faltantes: number, seleccionados: number): string {
  if (faltantes) return `Faltan asignaciones para ${faltantes} colaboradores.`;
  if (!seleccionados) return "La semana está completa. Marque al menos un colaborador para publicar.";
  return "La semana está completa y lista para publicar.";
}
function tituloDeConfirmacion(confirmacion: Confirmacion | undefined) {
  if (confirmacion?.tipo === "cambiar-semana") return "¿Descartar los cambios sin guardar?";
  if (confirmacion?.tipo === "publicar") return "¿Publicar la selección?";
  if (confirmacion?.tipo === "republicar") return `¿Republicar los cambios de ${confirmacion.nombre}?`;
  return "Confirmar acción";
}
function descripcionDeConfirmacion(confirmacion: Confirmacion | undefined) {
  if (confirmacion?.tipo === "cambiar-semana") return "Se perderán los cambios que aún no guardó.";
  if (confirmacion?.tipo === "publicar") return "El horario quedará disponible para la revisión de asistencias.";
  if (confirmacion?.tipo === "republicar") return "La republicación queda registrada con su motivo e invalida las asistencias pendientes de esa semana.";
  return "Revise esta acción antes de continuar.";
}
function etiquetaDeConfirmacion(confirmacion: Confirmacion | undefined) {
  if (confirmacion?.tipo === "cambiar-semana") return "Descartar y cambiar";
  if (confirmacion?.tipo === "publicar") return "Publicar planificación";
  if (confirmacion?.tipo === "republicar") return "Republicar cambios";
  return "Confirmar";
}
function estaPublicadaLaSemana(dni: string, dias: string[], publicados: Map<string, Publicado>) { return dias.every((fecha) => publicados.has(`${dni}:${fecha}`)); }
function filaCompletaDe(dni: string, dias: string[], celdas: Map<string, Celda>, publicados: Map<string, Publicado>) {
  return dias.every((fecha) => { const clave = `${dni}:${fecha}`; return celdas.has(clave) || publicados.has(clave); });
}
function hayCambiosSinPublicar(dni: string, dias: string[], celdas: Map<string, Celda>, publicados: Map<string, Publicado>) {
  return dias.some((fecha) => {
    const clave = `${dni}:${fecha}`; const celda = celdas.get(clave); const publicado = publicados.get(clave);
    return Boolean(celda && publicado && difiereDelPublicado(celda, publicado));
  });
}

// Estado de la semana de un colaborador, más los intermedios que la fila también necesita
// (incluida su elegibilidad para el checkbox de publicación selectiva).
function resumenSemanalDe(dni: string, dias: string[], celdas: Map<string, Celda>, publicados: Map<string, Publicado>, liquidadas: Set<string>, vigencias: Vigencia[]) {
  const semanaPublicada = estaPublicadaLaSemana(dni, dias, publicados);
  const semanaLiquidada = liquidadas.has(dni);
  const tieneCambiosSinPublicar = semanaPublicada && hayCambiosSinPublicar(dni, dias, celdas, publicados);
  const filaCompleta = filaCompletaDe(dni, dias, celdas, publicados);
  const semanaSinRelacionLaboral = !dias.some((fecha) => estaVigenteEn(vigencias, fecha));
  return {
    semanaPublicada, semanaLiquidada, tieneCambiosSinPublicar, filaCompleta, semanaSinRelacionLaboral,
    estado: estadoDeSemana({ semanaPublicada, semanaLiquidada, hayCambiosSinPublicar: tieneCambiosSinPublicar }),
  };
}

// Al resumir toda la grilla en un estado se muestra el más pendiente de acción.
const PRIORIDAD_ESTADO_PLANIFICACION: EstadoDeHorario[] = ["cambios-sin-publicar", "borrador-editable", "publicado", "liquidado"];

function EtiquetaEstado({ estado, className }: { estado: EstadoDeHorario; className?: string }) {
  const contenido = <>{estado === "liquidado" && <IconoCandado />}{NOMBRE_DEL_ESTADO_DE_HORARIO[estado]}</>;
  return className ? <span className={className}>{contenido}</span> : contenido;
}
