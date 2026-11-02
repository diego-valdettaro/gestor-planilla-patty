"use client";

import React, { useEffect, useRef, useState } from "react";
import { inicioDeSemana } from "@/turnos/semana";

export function SelectorSemanal({ semana, alSeleccionar }: { semana: string; alSeleccionar: (semana: string) => void }) {
  const [mes, setMes] = useState(semana.slice(0, 7));
  const [semanaEnHover, setSemanaEnHover] = useState<string>();
  const [calendarioAbierto, setCalendarioAbierto] = useState(false);
  const disparador = useRef<HTMLButtonElement>(null);
  const inicioSemana = new Date(`${semana}T00:00:00Z`);
  const finSemana = new Date(inicioSemana); finSemana.setUTCDate(finSemana.getUTCDate() + 6);
  const formato = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  useEffect(() => setMes(semana.slice(0, 7)), [semana]);

  function cerrarCalendario() {
    setCalendarioAbierto(false);
    disparador.current?.focus();
  }
  function seleccionar(fecha: string) {
    cerrarCalendario();
    alSeleccionar(inicioDeSemana(fecha));
  }

  return <section aria-label="Selector semanal" className="selector-semanal"><button aria-label="Semana anterior" className="boton-secundario" onClick={() => alSeleccionar(desplazarSemana(semana, -7))} type="button">‹</button><div className="selector-fecha-semanal"><span>Semana</span><button aria-expanded={calendarioAbierto} aria-haspopup="dialog" className="boton-fecha-semanal" ref={disparador} onClick={() => setCalendarioAbierto((abierto) => !abierto)} type="button"><strong>{formato.format(inicioSemana)} al {formato.format(finSemana)}</strong></button></div><button aria-label="Semana siguiente" className="boton-secundario" onClick={() => alSeleccionar(desplazarSemana(semana, 7))} type="button">›</button>{calendarioAbierto && <div aria-label="Elegir semana" className="calendario-semanal" onKeyDown={(evento) => { if (evento.key === "Escape") { evento.stopPropagation(); cerrarCalendario(); } }} role="dialog"><div className="encabezado-calendario-semanal"><button aria-label="Mes anterior" className="boton-secundario" onClick={() => setMes(desplazarMes(mes, -1))} type="button">‹</button><strong>{nombreDelMes(mes)}</strong><button aria-label="Mes siguiente" className="boton-secundario" onClick={() => setMes(desplazarMes(mes, 1))} type="button">›</button></div><div aria-hidden="true" className="dias-calendario-semanal">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((dia) => <span key={dia}>{dia}</span>)}</div><div className="dias-calendario-semanal fechas-calendario-semanal">{diasDelCalendario(mes).map((fecha) => { const semanaDeFecha = inicioDeSemana(fecha); const esSemanaActiva = (semanaEnHover ?? semana) === semanaDeFecha; return <button aria-label={`Elegir la semana del ${fecha}`} className={`${fecha.slice(0, 7) === mes ? "" : "fuera-de-mes "}${esSemanaActiva ? "semana-activa" : ""}`} key={fecha} onClick={() => seleccionar(fecha)} onMouseEnter={() => setSemanaEnHover(semanaDeFecha)} onMouseLeave={() => setSemanaEnHover(undefined)} type="button">{Number(fecha.slice(-2))}</button>; })}</div><p>Seleccione cualquier día para ver su semana completa.</p><div className="acciones-calendario-semanal"><button className="boton-secundario" onClick={() => seleccionar(new Date().toISOString().slice(0, 10))} type="button">Hoy</button><button className="boton-secundario" onClick={cerrarCalendario} type="button">Cancelar</button></div></div>}</section>;
}

function desplazarMes(mes: string, cantidad: number) { const fecha = new Date(`${mes}-01T00:00:00Z`); fecha.setUTCMonth(fecha.getUTCMonth() + cantidad); return fecha.toISOString().slice(0, 7); }
function nombreDelMes(mes: string) { return new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mes}-01T00:00:00Z`)); }
function diasDelCalendario(mes: string) { const primero = new Date(`${mes}-01T00:00:00Z`); const inicioCalendario = new Date(primero); inicioCalendario.setUTCDate(inicioCalendario.getUTCDate() - ((inicioCalendario.getUTCDay() + 6) % 7)); return Array.from({ length: 42 }, (_, indice) => { const fecha = new Date(inicioCalendario); fecha.setUTCDate(fecha.getUTCDate() + indice); return fecha.toISOString().slice(0, 10); }); }
function desplazarSemana(semana: string, dias: number) { const fecha = new Date(`${semana}T00:00:00Z`); fecha.setUTCDate(fecha.getUTCDate() + dias); return fecha.toISOString().slice(0, 10); }
