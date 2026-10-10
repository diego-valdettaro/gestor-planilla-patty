import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeGestionarPagos } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { formatearSoles } from "@/condiciones-laborales/valores";
import { formatearMes } from "@/fuentes-externas/valores";
import { totalDeHorasExtraCentimos } from "@/pagos/calcular-borrador";
import { prepararBorrador } from "@/pagos/preparar-borrador";
import { fuentesDelBorrador } from "@/pagos/servicio";

import { NavegacionDePagos } from "../navegacion-de-pagos";
import { BloqueoDePagos } from "../bloqueo";
import { SinPermisoDePagos } from "../sin-permiso";

export const dynamic = "force-dynamic";

export default async function PaginaDelMes({ params, searchParams }: { params: Promise<{ mes: string }>; searchParams: Promise<{ persona?: string; grupo?: string; sede?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeGestionarPagos(actor)) return <SinPermisoDePagos />;
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  const borrador = await prepararBorrador(fuentesDelBorrador, mes);
  const filtros = await searchParams;
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
  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina"><div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>Mes de pago {formatearMes(mes)}</h1><p>Corte de incidencias: {borrador.corte.inicio} al {borrador.corte.fin}</p><p>Revisiones de asistencia: {borrador.revisiones.length} períodos</p><span className="insignia advertencia">Borrador</span></div></header>
    <NavegacionDePagos actual="meses" />
    <section className="tarjeta panel" aria-labelledby="titulo-bloqueos"><header className="panel-cabecera"><h2 id="titulo-bloqueos">Bloqueos del mes ({borrador.bloqueosDelMes.length + bloqueadas})</h2></header>
      {borrador.bloqueosDelMes.length || bloqueadas ? <div>{borrador.bloqueosDelMes.map((bloqueo, i) => <BloqueoDePagos key={i} mensaje={bloqueo} mes={mes} />)}{borrador.personas.filter(({ bloqueos }) => bloqueos.length).map(({ relacion, bloqueos }) => <div key={relacion.id}><Link href={`/pagos/${mes}/${relacion.dni}`}>{relacion.nombre}</Link>{bloqueos.map((bloqueo, i) => <BloqueoDePagos key={i} mensaje={bloqueo} mes={mes} relacionId={relacion.id} />)}</div>)}</div> : <p>El sueldo está calculado; los demás conceptos y el neto siguen pendientes.</p>}
    </section>
    <section className="tarjeta panel"><header className="panel-cabecera"><h2>Fuentes externas</h2></header><p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p><div className="panel-tabla primera-columna-fija" role="region" aria-label="Fuentes externas del mes" tabIndex={0}><table><thead><tr><th>Tipo de fuente</th><th>Estado</th><th className="numerico">Filas (n.º)</th><th>Acción</th></tr></thead><tbody>{(borrador.fuentes ?? []).map((fuente) => <tr key={fuente.codigo}><th scope="row">{fuente.nombre}</th><td><span className={`insignia ${fuente.estado === "Pendiente" ? "advertencia" : "ok"}`}>{fuente.estado}</span></td><td className="numerico">{fuente.filas}</td><td><Link href={`/pagos/fuentes-externas/${fuente.codigo}?mes=${mes}`}>Revisar fuente</Link></td></tr>)}</tbody></table></div></section>
    <form className="filtros panel-filtros" method="get"><label>Grupo operativo<select name="grupo" defaultValue={filtros.grupo ?? ""}><option value="">Todos los grupos</option>{grupos.map((grupo) => <option value={grupo} key={grupo}>{grupo}</option>)}</select></label><label>Sede de adscripción<select name="sede" defaultValue={filtros.sede ?? ""}><option value="">Todas las sedes</option>{sedes.map((sede) => <option value={sede} key={sede}>{sede}</option>)}</select></label><label>Persona (nombre o DNI)<input name="persona" type="search" defaultValue={filtros.persona ?? ""} /></label><button className="boton-secundario" type="submit">Filtrar</button></form>
    <section className="tarjeta panel"><header className="panel-cabecera"><div><h2>Totales del mes completo</h2><p>Incompleto. {bloqueadas} personas con bloqueo. El neto aún no es definitivo.</p></div></header><p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p><div className="panel-tabla" role="region" aria-label="Totales del mes completo" tabIndex={0}><table><thead><tr><th className="numerico">Sueldo calculado</th><th className="numerico">Otros ingresos</th><th className="numerico">Reducciones</th><th className="numerico">Deducciones</th><th className="numerico">Neto</th><th className="numerico">Aportes patronales</th></tr></thead><tbody><tr><td className="numerico">{formatearSoles(borrador.sueldoCalculadoCentimos)}</td><td className="numerico">Horas extra {formatearSoles(totalDeHorasExtra)}. Otros pendientes</td><td>Pendiente</td><td>Pendiente</td><td>Incompleto</td><td>Pendiente</td></tr></tbody></table></div></section>
    <section className="tarjeta panel"><header className="panel-cabecera"><h2>Por sede de adscripción</h2></header>{porSede.length ? <><p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p><div className="panel-tabla primera-columna-fija" role="region" aria-label="Sueldo por sede de adscripción" tabIndex={0}><table><thead><tr><th>Sede</th><th className="numerico">Personas (n.º)</th><th className="numerico">Sueldo calculado</th><th className="numerico">Neto</th></tr></thead><tbody>{porSede.map(({ sede, personas: deLaSede }) => <tr key={sede}><th scope="row">{sede}</th><td className="numerico">{deLaSede.length}</td><td className="numerico">{formatearSoles(deLaSede.reduce((suma, persona) => suma + persona.sueldoCalculadoCentimos, 0))}</td><td>Incompleto</td></tr>)}</tbody></table></div></> : <p className="estado-vacio">No hay personas en este mes.</p>}</section>
    <section className="tarjeta panel"><header className="panel-cabecera"><h2>Personas del mes</h2></header>{personas.length ? <><p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p><div className="panel-tabla primera-columna-fija" role="region" aria-label="Personas del mes" tabIndex={0}><table><thead><tr><th>Persona</th><th>Grupo / sede de adscripción</th><th className="numerico">Sueldo calculado</th><th className="numerico">Neto</th><th>Estado</th></tr></thead><tbody>{personas.map(({ relacion, sedeDeAdscripcion, sueldoCalculadoCentimos, bloqueos }) => <tr key={relacion.id}><th scope="row"><Link href={`/pagos/${mes}/${relacion.dni}`}>{relacion.nombre}</Link><small className="linea-de-relacion">DNI {relacion.dni}</small></th><td>{relacion.grupo}<small className="linea-de-relacion">{sedeDeAdscripcion ?? "Sede pendiente"}</small></td><td className="numerico">{formatearSoles(sueldoCalculadoCentimos)}</td><td className="numerico">Incompleto</td><td><span className="insignia advertencia">{bloqueos.length ? "Bloqueada" : "Pendiente"}</span></td></tr>)}</tbody></table></div></> : <section className="estado-vacio"><h3>Este mes no incluye personas con esos criterios</h3><p>Quite los filtros para consultar la población completa.</p></section>}</section>
  </main>;
}
