"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SelectorMensual } from "@/app/selector-mensual";
import type { ModeloDeHorario } from "@/turnos/gestionar-modelos-de-horario";
import { inicioDeSemana } from "@/turnos/semana";
import { type DatosDeJornadaPlanificada } from "@/turnos/jornada-planificada";
import { estaVigenteEn, type Vigencia } from "@/relaciones-laborales/vigencia";

import { estadoDeCelda, NOMBRE_DEL_ESTADO_DE_HORARIO } from "./estado-de-celda";

import { borrarCeldaDelBorrador, guardarCeldaDelBorrador } from "./actions";
import { opcionesDeHorario, valorDe } from "./planificador-semanal";

type Jornada = DatosDeJornadaPlanificada & { dni: string; fecha: string };

export function PlanificadorMensual({ mes, equipo, equipos, colaboradores, dni, dias, borradores, publicados, vigencias, fechasCerradas, semanasProcesadas = [], sedes = [], modelos = [], soloLectura = false }: {
  mes: string; equipo: string; equipos: string[]; colaboradores: Array<{ dni: string; nombre: string }>; dni?: string; dias: string[];
  borradores: Jornada[]; publicados: Jornada[]; vigencias: Vigencia[]; fechasCerradas: string[]; semanasProcesadas?: string[];
  sedes?: string[]; modelos?: ModeloDeHorario[]; soloLectura?: boolean;
}) {
  const router = useRouter();
  const [edicion, setEdicion] = React.useState<{ fecha: string; horario: string; guardando?: boolean; error?: string } | null>(null);
  const disparador = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (!edicion && disparador.current) {
      disparador.current.focus();
      disparador.current = null;
    }
  }, [edicion]);
  const persona = colaboradores.find(p => p.dni === dni);
  const porFecha = new Map(borradores.filter(c => c.dni === dni).map(c => [c.fecha, c]));
  const publicadosPorFecha = new Map(publicados.filter(c => c.dni === dni).map(c => [c.fecha, c]));
  const cerradas = new Set(fechasCerradas);
  const procesadas = new Set(semanasProcesadas);
  function editable(fecha: string) {
    return !soloLectura && estaVigenteEn(vigencias, fecha) && !cerradas.has(fecha) && !procesadas.has(inicioDeSemana(fecha));
  }

  async function guardar(formulario: FormData) {
    if (!edicion || !persona || edicion.guardando || !editable(edicion.fecha)) return;
    setEdicion({ ...edicion, guardando: true, error: undefined });
    const datos = new FormData();
    datos.set("dni", persona.dni);
    datos.set("fecha", edicion.fecha);
    datos.set("equipo", equipo);
    const horario = String(formulario.get("horario") ?? "");
    const modelo = modelos.find(item => `modelo:${item.id}` === horario);
    if (modelo) datos.set("sede", modelo.sede);
    if (horario === "personalizado") datos.set("sede", String(formulario.get("sede") ?? ""));
    datos.set("horario", horario === "personalizado"
      ? `${formulario.get("entrada")}|${formulario.get("salida")}`
      : horario.replace(/^motivo:/, ""));
    try {
      if (horario === "quitar") await borrarCeldaDelBorrador(datos);
      else await guardarCeldaDelBorrador(datos);
      setEdicion(null);
      router.refresh();
    } catch (error) {
      setEdicion({ ...edicion, error: error instanceof Error ? error.message : "No se pudo guardar el horario." });
    }
  }

  const fechaEditada = edicion?.fecha;
  const jornadaEditada = fechaEditada ? porFecha.get(fechaEditada) ?? publicadosPorFecha.get(fechaEditada) : undefined;
  const opciones = opcionesDeHorario(modelos).filter(opcion => opcion.value);
  const sePuedeQuitar = fechaEditada && jornadaEditada && !publicadosPorFecha.has(fechaEditada);
  function ruta(cambios: Record<string, string> = {}) {
    return `/turnos?${new URLSearchParams({ vista: "mensual", mes, equipo, ...(dni ? { colaborador: dni } : {}), ...cambios })}`;
  }
  const semanaHref = `/turnos?${new URLSearchParams({ semana: inicioDeSemana(dias[0]), equipo })}`;
  const desfase = (new Date(`${dias[0]}T00:00:00Z`).getUTCDay() + 6) % 7;
  return <>
    <nav aria-label="Vista" className="pestanas-personal"><Link href={semanaHref}>Vista semanal</Link><Link aria-current="page" className="activo" href={ruta()}>Vista mensual</Link></nav>
    <section className="tile panel">
      <div className="panel-filtros filtros-plan-mensual">
        <label>Grupo<select aria-label="Grupo" value={equipo} onChange={e => router.push(ruta({ equipo: e.target.value, colaborador: "" }))}>{equipos.map(g => <option key={g}>{g}</option>)}</select></label>
        <SelectorMensual mes={mes} alSeleccionar={nuevo => router.push(ruta({ mes: nuevo }))} />
        <label>Colaborador<select aria-label="Colaborador" value={dni ?? ""} onChange={e => router.push(ruta({ colaborador: e.target.value }))}>{colaboradores.map(p => <option key={p.dni} value={p.dni}>{p.nombre}</option>)}</select></label>
      </div>
      <h2>{persona?.nombre ?? "No hay colaboradores activos"}</h2>
      {edicion && persona && editable(edicion.fecha) && (
        <form action={guardar} aria-labelledby="titulo-edicion-mensual" className="formulario-dialogo" style={{ marginBlock: "1rem", maxWidth: "32rem" }} key={edicion.fecha}>
          <h3 id="titulo-edicion-mensual">Editar horario de {persona.nombre}</h3>
          <p><time dateTime={edicion.fecha}>{edicion.fecha}</time>{jornadaEditada?.entradaProgramada && <> · {jornadaEditada.sede} · {jornadaEditada.entradaProgramada}–{jornadaEditada.salidaProgramada}</>}</p>
          <label>Horario
            <select name="horario" autoFocus required value={edicion.horario} disabled={edicion.guardando} onChange={event => setEdicion({ ...edicion, horario: event.target.value, error: undefined })}>
              <option value="" disabled>Seleccione el horario</option>
              {opciones.map(opcion => <option key={opcion.value} value={opcion.value}>{opcion.label}</option>)}
              {sePuedeQuitar && <option value="quitar">Quitar asignación</option>}
            </select>
          </label>
          {edicion.horario === "personalizado" && <>
            <label>Sede<select name="sede" defaultValue={jornadaEditada?.sede ?? sedes[0]} required>{sedes.map(sede => <option key={sede}>{sede}</option>)}</select></label>
            <div className="campos-horario-personalizado">
              <label>Entrada<input name="entrada" type="time" defaultValue={jornadaEditada?.entradaProgramada ?? "09:00"} required /></label>
              <label>Salida<input name="salida" type="time" defaultValue={jornadaEditada?.salidaProgramada ?? "18:00"} required /></label>
            </div>
          </>}
          {edicion.error && <p className="mensaje-operacion error" role="alert">{edicion.error}</p>}
          <div className="acciones-dialogo">
            <button className="boton-secundario" type="button" disabled={edicion.guardando} onClick={() => setEdicion(null)}>Cancelar</button>
            <button className="boton-principal" type="submit" disabled={edicion.guardando}>{edicion.guardando ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
      )}
      <div className="calendario calendario-plan"><div className="dias-semana">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => <span key={d}>{d}</span>)}</div>
        <div className="celdas-calendario">{Array.from({ length: desfase }, (_, i) => <span key={`vacio-${i}`} />)}{persona && dias.map(fecha => {
          const publicado = publicadosPorFecha.get(fecha);
          const vigente = estaVigenteEn(vigencias, fecha);
          const borrador = porFecha.get(fecha);
          const celdaEnVigencia = borrador?.motivoNoAsistencia === "sin_relacion_laboral" ? undefined : borrador;
          const cerrada = cerradas.has(fecha);
          const celda = vigente ? (cerrada ? publicado : celdaEnVigencia ?? publicado) : undefined;
          const procesada = procesadas.has(inicioDeSemana(fecha));
          const estado = !vigente ? "Sin relación laboral" : cerrada && !publicado && !procesada ? "Sin publicar" : NOMBRE_DEL_ESTADO_DE_HORARIO[estadoDeCelda(cerrada ? undefined : celdaEnVigencia, publicado, procesada)];
          const clase = estado === "Publicado" ? "est-publicado" : estado === "Liquidado" ? "est-liquidado" : estado === "Cambios sin publicar" ? "est-cambiado" : "est-borrador";
          const motivo = celda?.motivoNoAsistencia ?? (celda?.descanso ? "descanso" : undefined);
          const destino = `/turnos?${new URLSearchParams({ semana: inicioDeSemana(fecha), equipo })}`;
          const etiqueta = `Horario del ${fecha}: ${estado}. ${cerrada ? "Período cerrado; requiere reapertura. " : ""}Abrir semana`;
          const claseDia = `dia-calendario est ${clase}`;
          const contenido = <>
            <time dateTime={fecha}>{Number(fecha.slice(-2))}</time><em>{estado}</em>{cerrada && <small>Período cerrado; requiere reapertura.</small>}
            {vigente && (motivo ? <b>{motivo[0].toUpperCase() + motivo.slice(1)}</b> : celda ? <><b>{celda.sede}</b><small>{celda.entradaProgramada}–{celda.salidaProgramada}</small></> : <small>Sin asignar</small>)}
          </>;
          if (!editable(fecha)) return <Link aria-label={etiqueta} className={claseDia} href={destino} key={fecha}>{contenido}</Link>;
          const horarioActual = valorDe(celda);
          return <div key={fecha}>
            <button aria-label={`Editar horario del ${fecha}: ${estado}`} className={claseDia} type="button" disabled={edicion?.guardando}
              onClick={event => {
                disparador.current = event.currentTarget;
                setEdicion({ fecha, horario: opciones.some(opcion => opcion.value === horarioActual) ? horarioActual : celda?.entradaProgramada ? "personalizado" : "" });
              }}>{contenido}</button>
            <Link aria-label={etiqueta} href={destino}><small>Abrir semana</small></Link>
          </div>;
        })}</div>
      </div>
    </section>
  </>;
}
