"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { EquipoOperativo } from "@/turnos/configurar-equipos-operativos";
import type { ModeloDeHorario } from "@/turnos/gestionar-modelos-de-horario";
import type { CeldaDePlanSemanalEnBorrador, HorarioSemanalParaCopiar } from "@/turnos/plan-semanal-en-borrador";
import { inicioDeSemana } from "@/turnos/semana";

import { copiarSemanaAnteriorEnBorrador, guardarBorradorDesdeGrilla, publicarPlanSemanalDesdeGrilla, republicarPlanSemanalDesdeGrilla } from "./actions";

type Celda = Omit<CeldaDePlanSemanalEnBorrador, "planId">;
type Colaborador = { idHuellero: string; nombre: string; sede: string };
type Modelo = ModeloDeHorario;
type Publicado = HorarioSemanalParaCopiar;

export function PlanificadorSemanal({ actualizadoEn, equipos, planId, semana, equipo, colaboradores, dias, celdasIniciales, publicados, procesados, modelos }: {
  actualizadoEn?: string; equipos: EquipoOperativo[]; planId: string; semana: string; equipo: EquipoOperativo; colaboradores: Colaborador[]; dias: string[]; celdasIniciales: Celda[]; publicados: Publicado[]; procesados: string[]; modelos: Modelo[];
}) {
  const router = useRouter();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [celdas, setCeldas] = useState(celdasIniciales);
  const [cambios, setCambios] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState<string>();
  const [guardadoEn, setGuardadoEn] = useState(actualizadoEn);
  const [personalizado, setPersonalizado] = useState<{ colaborador: Colaborador; fecha: string }>();
  useEffect(() => setGuardadoEn(actualizadoEn), [actualizadoEn]);
  const porClave = useMemo(() => new Map(celdas.map((celda) => [`${celda.idHuellero}:${celda.fecha}`, celda])), [celdas]);
  const publicadosPorClave = useMemo(() => new Map(publicados.map((celda) => [`${celda.idHuellero}:${celda.fecha}`, celda])), [publicados]);
  const procesadosPorId = useMemo(() => new Set(procesados), [procesados]);

  function cambiarSemana(destino: string) {
    if (cambios && !window.confirm("Hay cambios sin guardar. ¿Descartar los cambios y cambiar de semana?")) return;
    router.push(`/turnos?semana=${destino}&equipo=${equipo}`);
  }
  function actualizar(celda: Celda | undefined, colaborador: Colaborador, fecha: string, valor: string) {
    if (valor === "personalizado") {
      setPersonalizado({ colaborador, fecha });
      dialogo.current?.showModal();
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
  async function guardar() {
    setGuardando(true); setError(undefined);
    try { await guardarBorradorDesdeGrilla(planId, JSON.stringify(celdas)); setCambios(false); router.refresh(); }
    catch (causa) { setError(causa instanceof Error ? causa.message : "No se pudo guardar el borrador."); }
    finally { setGuardando(false); }
  }
  async function copiarAnterior() {
    if (celdas.some((celda) => !procesadosPorId.has(celda.idHuellero)) && !window.confirm("Copiar la semana anterior reemplazará las asignaciones editables. ¿Continuar?")) return;
    const datos = new FormData(); datos.set("planId", planId);
    try { await copiarSemanaAnteriorEnBorrador(datos); router.refresh(); }
    catch (causa) { setError(causa instanceof Error ? causa.message : "No se pudo copiar la semana anterior."); }
  }
  async function publicarPlanificacion() {
    if (cambios) { setError("Guarde el borrador antes de publicar."); return; }
    setPublicando(true); setError(undefined);
    const datos = new FormData();
    datos.set("planId", planId);
    try { await publicarPlanSemanalDesdeGrilla(datos); router.refresh(); }
    catch (causa) { setError(causa instanceof Error ? causa.message : "No se pudo publicar el horario semanal."); }
    finally { setPublicando(false); }
  }
  async function republicar(idHuellero: string) {
    if (cambios) { setError("Guarde el borrador antes de republicar."); return; }
    const motivo = window.prompt("Motivo breve de la republicación:");
    if (!motivo?.trim()) return;
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
    setCambios(true); dialogo.current?.close();
  }
  return <>
    <div className="herramientas-plan-semanal">
      <label>Equipo<select aria-label="Equipo" onChange={(evento) => router.push(`/turnos?semana=${semana}&equipo=${evento.target.value}`)} value={equipo}>{equipos.map((item) => <option key={item} value={item}>{item === "tiendas" ? "Tiendas" : "Taller"}</option>)}</select></label>
      <SelectorSemanal semana={semana} alSeleccionar={cambiarSemana} />
      <button className="boton-secundario" onClick={copiarAnterior} type="button">Copiar semana anterior</button>
      <button disabled={!cambios || guardando} onClick={guardar} type="button">{guardando ? "Guardando…" : "Guardar borrador"}</button>
      <button disabled={cambios || publicando} onClick={publicarPlanificacion} type="button">{publicando ? "Publicando…" : "Publicar planificación"}</button>
      {error && <p role="alert">{error}</p>}
    </div>
    <div className="tabla-plan-semanal"><table><thead><tr><th>Colaborador</th>{dias.map((fecha) => <th key={fecha}>{new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${fecha}T00:00:00Z`))}</th>)}</tr></thead><tbody>
      {colaboradores.map((colaborador) => { const semanaProcesada = procesadosPorId.has(colaborador.idHuellero); const semanaPublicada = estaPublicadaLaSemana(colaborador.idHuellero, dias, publicadosPorClave); const tieneCambiosSinPublicar = semanaPublicada && hayCambiosSinPublicar(colaborador.idHuellero, dias, porClave, publicadosPorClave); return <tr key={colaborador.idHuellero}><th scope="row"><strong>{iniciales(colaborador.nombre)}</strong><span>{colaborador.nombre}</span><small>{colaborador.sede}{semanaProcesada ? " · Procesado" : semanaPublicada ? tieneCambiosSinPublicar ? " · Cambios sin publicar" : " · Publicado" : ""}</small>{tieneCambiosSinPublicar && !semanaProcesada && <button disabled={publicando} onClick={() => republicar(colaborador.idHuellero)} type="button">Republicar cambios</button>}</th>{dias.map((fecha) => {
        const clave = `${colaborador.idHuellero}:${fecha}`; const publicado = publicadosPorClave.get(clave); const celda = porClave.get(clave);
        if (publicado) return <td className="celda-plan-semanal publicado" key={fecha}><select aria-label={`Horario de ${colaborador.nombre} para ${fecha}`} disabled={semanaProcesada} onChange={(evento) => actualizar(celda, colaborador, fecha, evento.target.value)} value={valorDe(celda ?? publicado)}>
          <option value="">+ Asignar</option><option value="descanso">Descanso libre</option>
          {modelos.filter((modelo) => modelo.activo && modelo.sede === colaborador.sede).map((modelo) => <option key={modelo.id} value={modelo.id}>{modelo.nombre} · {modelo.entrada} a {modelo.salida}</option>)}
          <option value="personalizado">Horario personalizado…</option>
        </select><span className="horario-visible">{etiqueta(celda ?? publicado)}</span></td>;
        return <td className="celda-plan-semanal" key={fecha}><select aria-label={`Horario de ${colaborador.nombre} para ${fecha}`} disabled={semanaProcesada} onChange={(evento) => actualizar(celda, colaborador, fecha, evento.target.value)} value={valorDe(celda)}>
          <option value="">+ Asignar</option><option value="descanso">Descanso libre</option>
          {modelos.filter((modelo) => modelo.activo && modelo.sede === colaborador.sede).map((modelo) => <option key={modelo.id} value={modelo.id}>{modelo.nombre} · {modelo.entrada} a {modelo.salida}</option>)}
          <option value="personalizado">Horario personalizado…</option>
        </select><span className="horario-visible">{celda && etiqueta(celda)}</span></td>;
      })}</tr>; })}
    </tbody></table></div>
    <footer className="pie-plan-semanal"><p>{rangoDeSemana(dias)} · {colaboradores.length} colaboradores · {guardadoEn ? `Borrador guardado el ${new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(guardadoEn))}` : "El borrador todavía no fue guardado."}</p><div><button disabled={!cambios || guardando} onClick={guardar} type="button">Guardar borrador</button><button disabled={cambios || publicando} onClick={publicarPlanificacion} type="button">Publicar planificación</button></div></footer>
    <dialog ref={dialogo}><form action={guardarPersonalizado}><h2>Horario personalizado</h2><label>Entrada<input defaultValue="09:00" name="entrada" type="time" required /></label><label>Salida<input defaultValue="18:00" name="salida" type="time" required /></label><button type="submit">Usar horario</button><button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button></form></dialog>
  </>;
}

function SelectorSemanal({ semana, alSeleccionar }: { semana: string; alSeleccionar: (semana: string) => void }) {
  const [mes, setMes] = useState(semana.slice(0, 7));
  const dias = diasDelMes(mes);
  return <section aria-label="Selector semanal" className="selector-semanal"><div><button className="boton-secundario" onClick={() => setMes(desplazarMes(mes, -1))} type="button">‹</button><strong>{new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mes}-01T00:00:00Z`))}</strong><button className="boton-secundario" onClick={() => setMes(desplazarMes(mes, 1))} type="button">›</button><button className="boton-secundario" onClick={() => { const hoy = new Date().toISOString().slice(0, 10); setMes(hoy.slice(0, 7)); alSeleccionar(inicio(hoy)); }} type="button">Hoy</button></div><div className="dias-selector">{dias.map((dia) => <button aria-pressed={inicio(dia) === semana} className={inicio(dia) === semana ? "semana-elegida" : ""} key={dia} onClick={() => alSeleccionar(inicio(dia))} type="button">{dia.slice(8)}</button>)}</div></section>;
}
function crearDesdeModelo(colaborador: Colaborador, fecha: string, modelo: Modelo): Celda { return { idHuellero: colaborador.idHuellero, fecha, sede: colaborador.sede, modeloHorarioId: modelo.id, entradaProgramada: modelo.entrada, salidaProgramada: modelo.salida, descanso: false }; }
function valorDe(celda: Celda | undefined) { return celda?.descanso ? "descanso" : celda?.modeloHorarioId ?? ""; }
function etiqueta(celda: Celda) { return celda.descanso ? "Descanso libre" : `${celda.entradaProgramada}–${celda.salidaProgramada}`; }
function iniciales(nombre: string) { return nombre.split(/\s+/).map((parte) => parte[0]).join("").slice(0, 2).toUpperCase(); }
function rangoDeSemana(dias: string[]) { const formato = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); return `${formato.format(new Date(`${dias[0]}T00:00:00Z`))} al ${formato.format(new Date(`${dias.at(-1)}T00:00:00Z`))}`; }
function inicio(fecha: string) { return inicioDeSemana(fecha); }
function desplazarMes(mes: string, cantidad: number) { const fecha = new Date(`${mes}-01T00:00:00Z`); fecha.setUTCMonth(fecha.getUTCMonth() + cantidad); return fecha.toISOString().slice(0, 7); }
function diasDelMes(mes: string) { const fecha = new Date(`${mes}-01T00:00:00Z`); const cantidad = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0)).getUTCDate(); return Array.from({ length: cantidad }, (_, indice) => `${mes}-${String(indice + 1).padStart(2, "0")}`); }
function estaPublicadaLaSemana(idHuellero: string, dias: string[], publicados: Map<string, Publicado>) { return dias.every((fecha) => publicados.has(`${idHuellero}:${fecha}`)); }
function hayCambiosSinPublicar(idHuellero: string, dias: string[], celdas: Map<string, Celda>, publicados: Map<string, Publicado>) {
  return dias.some((fecha) => {
    const clave = `${idHuellero}:${fecha}`; const celda = celdas.get(clave); const publicado = publicados.get(clave);
    return Boolean(celda && publicado && (celda.sede !== publicado.sede || celda.modeloHorarioId !== publicado.modeloHorarioId || celda.entradaProgramada !== publicado.entradaProgramada || celda.salidaProgramada !== publicado.salidaProgramada || celda.descanso !== publicado.descanso));
  });
}
