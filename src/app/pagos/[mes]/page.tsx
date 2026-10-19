import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeGestionarPagos } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { formatearSoles } from "@/condiciones-laborales/valores";
import { formatearMes } from "@/fuentes-externas/valores";
import { totalDeHorasExtraCentimos } from "@/pagos/calcular-borrador";
import { ROTULO_DEL_NETO, estadoDeLaPersona, totalesPorSede } from "@/pagos/fuentes-en-el-neto";
import { consultarVersion, evaluarBorradorPreparado, listarVersiones } from "@/pagos/finalizar-mes";
import { prepararBorrador } from "@/pagos/preparar-borrador";
import { dependenciasDeFinalizacion, fuentesDelBorrador } from "@/pagos/servicio";

import { NavegacionDePagos } from "../navegacion-de-pagos";
import { BloqueoDePagos } from "../bloqueo";
import { NotaDelSubtotal } from "../nota-del-subtotal";
import { SinPermisoDePagos } from "../sin-permiso";
import { estadoDelMes } from "./estado-del-mes";
import { FinalizacionDelMes } from "./finalizacion-del-mes";
import { HistorialDeVersiones } from "./historial-de-versiones";
import { VistaDeVersion } from "./vista-de-version";

export const dynamic = "force-dynamic";

// El número de versión es un entero de PostgreSQL (`versiones_de_pago.numero`): uno mayor no existe y no debe llegar a la consulta.
const NUMERO_MAXIMO_DE_VERSION = 2_147_483_647;

export default async function PaginaDelMes({ params, searchParams }: { params: Promise<{ mes: string }>; searchParams: Promise<{ persona?: string; grupo?: string; sede?: string; version?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeGestionarPagos(actor)) return <SinPermisoDePagos />;
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  const filtros = await searchParams;
  // Una versión abierta se muestra tal como se guardó (D15): sin recalcular el borrador.
  if (filtros.version !== undefined) {
    if (!/^[1-9]\d*$/.test(filtros.version) || Number(filtros.version) > NUMERO_MAXIMO_DE_VERSION) notFound();
    const version = await consultarVersion(dependenciasDeFinalizacion, actor, mes, Number(filtros.version));
    if (!version) notFound();
    return <VistaDeVersion actor={actor} version={version} />;
  }
  const borrador = await prepararBorrador(fuentesDelBorrador, mes);
  const versiones = await listarVersiones(dependenciasDeFinalizacion, actor, mes);
  const pagoConfirmado = await dependenciasDeFinalizacion.pago.mesConPagoConfirmado(mes);
  const personas = borrador.personas.filter(({ relacion, sedeDeAdscripcion }) =>
    (!filtros.persona || `${relacion.nombre} ${relacion.dni}`.toLocaleLowerCase().includes(filtros.persona.toLocaleLowerCase())) &&
    (!filtros.grupo || relacion.grupo === filtros.grupo) &&
    (!filtros.sede || sedeDeAdscripcion === filtros.sede));
  const grupos = [...new Set(borrador.personas.map(({ relacion }) => relacion.grupo))].sort();
  const sedes = [...new Set(borrador.personas.flatMap(({ sedeDeAdscripcion }) => sedeDeAdscripcion ? [sedeDeAdscripcion] : []))].sort();
  const bloqueadas = borrador.personas.filter(({ bloqueos }) => bloqueos.length).length;
  const totalDeHorasExtra = borrador.personas.filter(({ bloqueos }) => bloqueos.length === 0)
    .reduce((total, { lineas }) => total + totalDeHorasExtraCentimos(lineas), 0);
  const porSede = [...new Set(borrador.personas.map(({ sedeDeAdscripcion }) => sedeDeAdscripcion ?? "Sede pendiente"))]
    .sort().map((sede) => ({ sede, personas: borrador.personas.filter(({ sedeDeAdscripcion }) => (sedeDeAdscripcion ?? "Sede pendiente") === sede) }));
  const netoDeSede = new Map((borrador.totalesPorSede ?? totalesPorSede(borrador.personas)).map((total) => [total.sede, total]));
  const calculadas = borrador.totalesPorSede ? borrador.totalesPorSede.reduce((suma, total) => suma + total.calculadas, 0) : borrador.personas.filter(({ netoCentimos }) => netoCentimos != null).length;
  const netoCalculado = borrador.netoCalculadoCentimos ?? borrador.personas.reduce((suma, { netoCentimos }) => suma + (netoCentimos ?? 0), 0);
  const bloqueosDelPanel = borrador.bloqueosDelMes.length + bloqueadas;
  const estado = estadoDelMes({ personas: borrador.personas.length, bloqueos: bloqueosDelPanel, ultimaVersion: versiones[0]?.numero, pagoConfirmado });
  const accion = estado.accion;
  // El diálogo se prepara con el alcance y la huella del MISMO borrador que se muestra, sin volver a leer los datos (ADR 0014): solo se evalúa cuando se puede finalizar.
  const evaluacion = accion.tipo !== "ninguna" && !accion.causaDeshabilitado ? await evaluarBorradorPreparado(dependenciasDeFinalizacion.versiones, borrador, mes) : undefined;
  if (evaluacion && evaluacion.estado !== "lista") throw new Error("El cálculo del mes cambió mientras se abría la pantalla.");
  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina"><div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1 tabIndex={-1}>Mes de pago {formatearMes(mes)}</h1><p>Corte de incidencias: {borrador.corte.inicio} al {borrador.corte.fin}</p><p>Revisiones de asistencia: {borrador.revisiones.length} períodos</p><span className={`insignia ${estado.insignia.clase}`}>{estado.insignia.texto}</span></div>
      <span className="acciones-configuracion">
        {accion.tipo === "ninguna" ? <small className="linea-de-relacion">{accion.explicacion}</small>
          : evaluacion?.estado === "lista" ? <FinalizacionDelMes alcance={evaluacion.alcance} etiqueta={accion.etiqueta} huella={evaluacion.huella} mes={mes} />
          : <><button aria-describedby="causa-de-finalizar" className="boton-principal" disabled type="button">{accion.etiqueta}</button><small className="linea-de-relacion" id="causa-de-finalizar">{accion.causaDeshabilitado}</small></>}
      </span></header>
    <NavegacionDePagos actual="meses" />
    <section className="tarjeta panel" aria-labelledby="titulo-bloqueos" id="bloqueos-del-mes" tabIndex={-1}><header className="panel-cabecera"><h2 id="titulo-bloqueos">Bloqueos del mes ({bloqueosDelPanel})</h2></header>
      {borrador.bloqueosDelMes.length || bloqueadas ? <div>{borrador.bloqueosDelMes.map((bloqueo, i) => <BloqueoDePagos key={i} mensaje={bloqueo} mes={mes} />)}{borrador.personas.filter(({ bloqueos }) => bloqueos.length).map(({ relacion, bloqueos }) => <div key={relacion.id}><Link href={`/pagos/${mes}/${relacion.dni}`}>{relacion.nombre}</Link>{bloqueos.map((bloqueo, i) => <BloqueoDePagos key={i} mensaje={bloqueo} mes={mes} relacionId={relacion.id} />)}</div>)}</div> : <p className="mensaje-operacion listo">El mes no tiene bloqueos. Puede finalizarlo.</p>}
    </section>
    <section className="tarjeta panel"><header className="panel-cabecera"><h2>Fuentes externas</h2></header><p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p><div className="panel-tabla primera-columna-fija" role="region" aria-label="Fuentes externas del mes" tabIndex={0}><table><thead><tr><th>Tipo de fuente</th><th>Estado</th><th className="numerico">Filas (n.º)</th><th>Acción</th></tr></thead><tbody>{(borrador.fuentes ?? []).map((fuente) => <tr key={fuente.codigo}><th scope="row">{fuente.nombre}</th><td><span className={`insignia ${fuente.estado === "Pendiente" ? "advertencia" : "ok"}`}>{fuente.estado}</span></td><td className="numerico">{fuente.filas}</td><td><Link href={`/pagos/fuentes-externas/${fuente.codigo}?mes=${mes}`}>Revisar fuente</Link></td></tr>)}</tbody></table></div></section>
    <form className="filtros panel-filtros" method="get"><label>Grupo operativo<select name="grupo" defaultValue={filtros.grupo ?? ""}><option value="">Todos los grupos</option>{grupos.map((grupo) => <option value={grupo} key={grupo}>{grupo}</option>)}</select></label><label>Sede de adscripción<select name="sede" defaultValue={filtros.sede ?? ""}><option value="">Todas las sedes</option>{sedes.map((sede) => <option value={sede} key={sede}>{sede}</option>)}</select></label><label>Persona (nombre o DNI)<input name="persona" type="search" defaultValue={filtros.persona ?? ""} /></label><button className="boton-secundario" type="submit">Filtrar</button></form>
    <section className="tarjeta panel"><header className="panel-cabecera"><div><h2>Totales del mes completo</h2><p>Incompleto. {bloqueadas} {bloqueadas === 1 ? "persona con bloqueo" : "personas con bloqueo"}. El neto de los totales suma solo a las personas calculadas y aún no es definitivo.</p><NotaDelSubtotal /></div></header><p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p><div className="panel-tabla" role="region" aria-label="Totales del mes completo" tabIndex={0}><table><thead><tr><th className="numerico">Sueldo calculado</th><th className="numerico">Otros ingresos</th><th className="numerico">Reducciones</th><th className="numerico">Deducciones</th><th className="numerico">{ROTULO_DEL_NETO}</th><th className="numerico">Aportes patronales</th></tr></thead><tbody><tr><td className="numerico">{formatearSoles(borrador.sueldoCalculadoCentimos)}</td><td className="numerico">Horas extra {formatearSoles(totalDeHorasExtra)}. Desglose restante pendiente</td><td>Desglose pendiente</td><td>Desglose pendiente</td><td className="numerico">{calculadas > 0 ? formatearSoles(netoCalculado) : "Incompleto"}</td><td>Desglose pendiente</td></tr></tbody></table></div></section>
    <section className="tarjeta panel"><header className="panel-cabecera"><h2>Por sede de adscripción</h2></header>{porSede.length ? <><p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p><div className="panel-tabla primera-columna-fija" role="region" aria-label="Sueldo por sede de adscripción" tabIndex={0}><table><thead><tr><th>Sede</th><th className="numerico">Personas (n.º)</th><th className="numerico">Sueldo calculado</th><th className="numerico">{ROTULO_DEL_NETO}</th></tr></thead><tbody>{porSede.map(({ sede, personas: deLaSede }) => <tr key={sede}><th scope="row">{sede}</th><td className="numerico">{deLaSede.length}</td><td className="numerico">{formatearSoles(deLaSede.reduce((suma, persona) => suma + persona.sueldoCalculadoCentimos, 0))}</td><td className="numerico">{(netoDeSede.get(sede)?.calculadas ?? 0) > 0 ? formatearSoles(netoDeSede.get(sede)?.netoCentimos ?? 0) : "Incompleto"}{(netoDeSede.get(sede)?.calculadas ?? 0) < deLaSede.length && <small className="linea-de-relacion">Incompleto</small>}</td></tr>)}</tbody></table></div></> : <p className="estado-vacio">No hay personas en este mes.</p>}</section>
    <section className="tarjeta panel"><header className="panel-cabecera"><h2>Personas del mes</h2></header>{personas.length ? <><p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p><div className="panel-tabla primera-columna-fija" role="region" aria-label="Personas del mes" tabIndex={0}><table><thead><tr><th>Persona</th><th>Grupo / sede de adscripción</th><th className="numerico">Sueldo calculado</th><th className="numerico">{ROTULO_DEL_NETO}</th><th>Estado</th></tr></thead><tbody>{personas.map(({ relacion, sedeDeAdscripcion, sueldoCalculadoCentimos, bloqueos, netoCentimos }) => <tr key={relacion.id}><th scope="row"><Link href={`/pagos/${mes}/${relacion.dni}`}>{relacion.nombre}</Link><small className="linea-de-relacion">DNI {relacion.dni}</small></th><td>{relacion.grupo}<small className="linea-de-relacion">{sedeDeAdscripcion ?? "Sede pendiente"}</small></td><td className="numerico">{formatearSoles(sueldoCalculadoCentimos)}</td><td className="numerico">{netoCentimos == null ? "Incompleto" : formatearSoles(netoCentimos)}</td><td><span className={`insignia ${netoCentimos == null ? "advertencia" : "ok"}`}>{estadoDeLaPersona({ netoCentimos: netoCentimos ?? null, bloqueos })}</span>{bloqueos.some((bloqueo) => bloqueo.startsWith("Neto negativo")) && <small className="linea-de-relacion">Neto negativo</small>}</td></tr>)}</tbody></table></div></> : <section className="estado-vacio"><h3>Este mes no incluye personas con esos criterios</h3><p>Quite los filtros para consultar la población completa.</p></section>}</section>
    <HistorialDeVersiones mes={mes} versiones={versiones} />
  </main>;
}
