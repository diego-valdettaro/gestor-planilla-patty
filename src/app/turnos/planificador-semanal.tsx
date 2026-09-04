"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { EquipoOperativo } from "@/turnos/configurar-equipos-operativos";
import type { ModeloDeHorario } from "@/turnos/gestionar-modelos-de-horario";
import type { CeldaDePlanSemanalEnBorrador, HorarioSemanalParaCopiar } from "@/turnos/plan-semanal-en-borrador";
import { inicioDeSemana } from "@/turnos/semana";

import { copiarSemanaAnteriorEnBorrador, guardarBorradorDesdeGrilla, publicarPlanSemanalDesdeGrilla } from "./actions";

type Celda = Omit<CeldaDePlanSemanalEnBorrador, "planId">;
type Colaborador = { idHuellero: string; nombre: string; sede: string };
type Modelo = ModeloDeHorario;
type Publicado = HorarioSemanalParaCopiar;

export function PlanificadorSemanal({ planId, semana, equipo, colaboradores, dias, celdasIniciales, publicados, modelos }: {
  planId: string; semana: string; equipo: EquipoOperativo; colaboradores: Colaborador[]; dias: string[]; celdasIniciales: Celda[]; publicados: Publicado[]; modelos: Modelo[];
}) {
  const router = useRouter();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [celdas, setCeldas] = useState(celdasIniciales);
  const [cambios, setCambios] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [personasSeleccionadas, setPersonasSeleccionadas] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [personalizado, setPersonalizado] = useState<{ colaborador: Colaborador; fecha: string }>();
  const porClave = useMemo(() => new Map(celdas.map((celda) => [`${celda.idHuellero}:${celda.fecha}`, celda])), [celdas]);
  const publicadosPorClave = useMemo(() => new Map(publicados.map((celda) => [`${celda.idHuellero}:${celda.fecha}`, celda])), [publicados]);
  const idsPublicables = colaboradores
    .filter((colaborador) => !estaPublicadaLaSemana(colaborador.idHuellero, dias, publicadosPorClave))
    .filter((colaborador) => estaListaParaPublicar(colaborador.idHuellero, dias, porClave))
    .map((colaborador) => colaborador.idHuellero);
  const todasLasPublicablesSeleccionadas = idsPublicables.length > 0 && idsPublicables.every((idHuellero) => personasSeleccionadas.includes(idHuellero));

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
    if (!window.confirm("Copiar la semana anterior puede reemplazar celdas existentes. ¿Continuar?")) return;
    const datos = new FormData(); datos.set("planId", planId);
    try { await copiarSemanaAnteriorEnBorrador(datos); router.refresh(); }
    catch (causa) { setError(causa instanceof Error ? causa.message : "No se pudo copiar la semana anterior."); }
  }
  async function publicarSeleccionadas() {
    if (cambios) { setError("Guarde el borrador antes de publicar."); return; }
    setPublicando(true); setError(undefined);
    const datos = new FormData();
    datos.set("planId", planId);
    personasSeleccionadas.forEach((idHuellero) => datos.append("idHuellero", idHuellero));
    try { await publicarPlanSemanalDesdeGrilla(datos); setPersonasSeleccionadas([]); router.refresh(); }
    catch (causa) { setError(causa instanceof Error ? causa.message : "No se pudo publicar el horario semanal."); }
    finally { setPublicando(false); }
  }
  function alternarPersona(idHuellero: string, seleccionada: boolean) {
    setPersonasSeleccionadas((actuales) => seleccionada ? [...new Set([...actuales, idHuellero])] : actuales.filter((id) => id !== idHuellero));
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
      <SelectorSemanal semana={semana} alSeleccionar={cambiarSemana} />
      <button className="boton-secundario" onClick={copiarAnterior} type="button">Copiar semana anterior</button>
      <button disabled={!cambios || guardando} onClick={guardar} type="button">{guardando ? "Guardando…" : "Guardar borrador"}</button>
      <button disabled={!personasSeleccionadas.length || publicando} onClick={publicarSeleccionadas} type="button">{publicando ? "Publicando…" : `Publicar seleccionadas (${personasSeleccionadas.length})`}</button>
      {error && <p role="alert">{error}</p>}
    </div>
    <div className="tabla-plan-semanal"><table><thead><tr><th><label><input aria-label="Seleccionar todas las personas sin publicar" checked={todasLasPublicablesSeleccionadas} disabled={!idsPublicables.length} onChange={(evento) => setPersonasSeleccionadas(evento.target.checked ? idsPublicables : [])} type="checkbox" /> Persona · sede</label></th>{dias.map((fecha) => <th key={fecha}>{fecha.slice(8)}</th>)}</tr></thead><tbody>
      {colaboradores.map((colaborador) => { const semanaPublicada = estaPublicadaLaSemana(colaborador.idHuellero, dias, publicadosPorClave); return <tr key={colaborador.idHuellero}><th scope="row"><label><input aria-label={`Seleccionar ${colaborador.nombre} para publicar`} checked={personasSeleccionadas.includes(colaborador.idHuellero)} disabled={semanaPublicada} onChange={(evento) => alternarPersona(colaborador.idHuellero, evento.target.checked)} type="checkbox" /><strong>{colaborador.nombre}</strong><small>{colaborador.sede}{semanaPublicada ? " · Publicado" : ""}</small></label></th>{dias.map((fecha) => {
        const clave = `${colaborador.idHuellero}:${fecha}`; const publicado = publicadosPorClave.get(clave); const celda = porClave.get(clave);
        if (publicado) return <td className="celda-plan-semanal publicado" key={fecha}>{etiqueta(publicado)}</td>;
        return <td className="celda-plan-semanal" key={fecha}><select aria-label={`Horario de ${colaborador.nombre} para ${fecha}`} onChange={(evento) => actualizar(celda, colaborador, fecha, evento.target.value)} value={valorDe(celda)}>
          <option value="">Sin definir</option><option value="descanso">Descanso libre</option>
          {modelos.filter((modelo) => modelo.activo && modelo.sede === colaborador.sede).map((modelo) => <option key={modelo.id} value={modelo.id}>{modelo.nombre} · {modelo.entrada} a {modelo.salida}</option>)}
          <option value="personalizado">Horario personalizado…</option>
        </select><span className="horario-visible">{celda && etiqueta(celda)}</span></td>;
      })}</tr>; })}
    </tbody></table></div>
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
function inicio(fecha: string) { return inicioDeSemana(fecha); }
function desplazarMes(mes: string, cantidad: number) { const fecha = new Date(`${mes}-01T00:00:00Z`); fecha.setUTCMonth(fecha.getUTCMonth() + cantidad); return fecha.toISOString().slice(0, 7); }
function diasDelMes(mes: string) { const fecha = new Date(`${mes}-01T00:00:00Z`); const cantidad = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0)).getUTCDate(); return Array.from({ length: cantidad }, (_, indice) => `${mes}-${String(indice + 1).padStart(2, "0")}`); }
function estaPublicadaLaSemana(idHuellero: string, dias: string[], publicados: Map<string, Publicado>) { return dias.every((fecha) => publicados.has(`${idHuellero}:${fecha}`)); }
function estaListaParaPublicar(idHuellero: string, dias: string[], celdas: Map<string, Celda>) {
  return dias.every((fecha) => {
    const celda = celdas.get(`${idHuellero}:${fecha}`);
    return Boolean(celda && (celda.descanso || (celda.sede.trim() && celda.entradaProgramada && celda.salidaProgramada)));
  });
}
