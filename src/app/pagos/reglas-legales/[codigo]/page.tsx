import Link from "next/link";
import { redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeGestionarPagos } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { fechaDeHoyEnLima } from "@/condiciones-laborales/vigencia";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";
import type { DefinicionDeReglaLegal } from "@/reglas-legales/catalogo";
import { crearCasosDeUsoDeReglasLegales } from "@/reglas-legales/casos-de-uso-servidor";
import { textoDeUsoEnVersiones, type ConsultaDeReglaVigente, type EntradaDeHistorial, type HistorialDeReglaLegal } from "@/reglas-legales/gestionar-reglas-legales";
import { repositorioDeReglasLegales } from "@/reglas-legales/servicio";
import { formatearValorLegal } from "@/reglas-legales/valores";

import { NavegacionDePagos } from "../../navegacion-de-pagos";
import { SinPermisoDePagos } from "../../sin-permiso";
import { ActivacionDeRegla, CorreccionDeRegla } from "../formularios";

export const dynamic = "force-dynamic";

const ESTADO_VISIBLE = { vigente: "Vigente", anterior: "Anterior", programado: "Programado", reemplazado: "Reemplazado" } as const;

export default async function PaginaDeUnaReglaLegal({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<{ fecha?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeGestionarPagos(actor)) return <SinPermisoDePagos />;

  const { codigo } = await params;
  const { fecha } = await searchParams;
  const casosDeUso = crearCasosDeUsoDeReglasLegales(repositorioDeReglasLegales, { obtenerActorActual });
  const hoy = fechaDeHoyEnLima();
  const detalle = await casosDeUso.historial(codigo, hoy);
  if (!detalle) return <main className="contenido pagina">
    <NavegacionDePagos actual="reglas-legales" />
    <section className="estado-vacio"><h1>No existe ese valor legal</h1><p>Elija uno de la lista de reglas legales. <Link href="/pagos/reglas-legales">Volver a reglas legales</Link></p></section>
  </main>;

  const { definicion, historial, vigente } = detalle;
  // Una fecha de consulta inválida se dice junto al campo; no reemplaza la pantalla.
  const consulta = fecha ? await casosDeUso.vigenteEn(definicion.codigo, fecha).then((resultado) => ({ resultado }), (causa: unknown) => ({ error: causa instanceof Error ? causa.message : "No se pudo consultar esa fecha." })) : undefined;

  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina">
      <div>
        <p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p>
        <h1>{definicion.nombre}</h1>
        <p>Vigente hoy ({formatearFechaDeRelacion(hoy)}): {vigente ? <strong>{formatearValorLegal(definicion.unidad, vigente.valor)}</strong> : <><span className="insignia advertencia">Pendiente</span> Sin regla vigente</>}</p>
        <p><Link href="/pagos/reglas-legales">Volver a reglas legales</Link></p>
      </div>
      <ActivacionDeRegla codigoInicial={definicion.codigo} definiciones={[definicion]} usuario={actor.nombreUsuario ?? "su usuario"} />
    </header>
    <NavegacionDePagos actual="reglas-legales" />

    <section aria-labelledby="titulo-consulta" className="tarjeta panel">
      <header className="panel-cabecera"><div><h2 id="titulo-consulta">Consultar una fecha</h2><p>Qué versión rige en el día elegido.</p></div></header>
      <form className="filtros panel-filtros" method="get">
        <label>Fecha<input defaultValue={fecha ?? hoy} name="fecha" required type="date" /></label>
        <button className="boton-secundario" type="submit">Consultar</button>
      </form>
      {consulta && <ResultadoDeConsulta consulta={consulta} definicion={definicion} fecha={fecha ?? ""} />}
    </section>

    <section aria-labelledby="titulo-historial" className="tarjeta panel">
      <header className="panel-cabecera"><div><h2 id="titulo-historial">Historial</h2><p>Una fila por versión. Un valor nuevo no reescribe las anteriores.</p></div></header>
      {historial.length
        ? <>
          <p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p>
          <div className="panel-tabla primera-columna-fija" role="region" aria-label={`Historial de ${definicion.nombre}`} tabIndex={0}><table><thead><tr><th>Valor</th><th>Vigente desde</th><th>Vigente hasta</th><th>Fuente oficial</th><th>Activado por</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>{historial.map((entrada) => <FilaDeHistorial definicion={definicion} detalle={detalle} entrada={entrada} key={entrada.id} />)}</tbody></table></div>
        </>
        : <section className="estado-vacio"><h3>Pendiente: todavía no hay ningún valor</h3><p>Use «Activar nuevo valor» para indicar el valor y desde cuándo rige.</p></section>}
    </section>
  </main>;
}

function ResultadoDeConsulta({ consulta, definicion, fecha }: { consulta: { resultado: ConsultaDeReglaVigente } | { error: string }; definicion: DefinicionDeReglaLegal; fecha: string }) {
  if ("error" in consulta) return <p className="mensaje-operacion error" role="alert">{consulta.error}</p>;
  const { resultado } = consulta;
  if (resultado.estado === "faltante") return <p className="mensaje-operacion advertencia" role="status"><span className="insignia advertencia">Pendiente</span> Sin regla vigente en esa fecha ({formatearFechaDeRelacion(fecha)}): {definicion.nombre} falta y el cálculo que la necesite queda bloqueado.</p>;
  const { regla } = resultado;
  return <p className="mensaje-operacion listo" role="status">En {formatearFechaDeRelacion(fecha)} rige <strong>{formatearValorLegal(definicion.unidad, regla.valor)}</strong>, vigente desde el {formatearFechaDeRelacion(regla.vigenteDesde)}. Fuente oficial: {regla.fuenteOficial}. Activado por {regla.activadaPor}.</p>;
}

function FilaDeHistorial({ definicion, detalle, entrada }: { definicion: DefinicionDeReglaLegal; detalle: HistorialDeReglaLegal; entrada: EntradaDeHistorial }) {
  const usadaPor = detalle.usadasPorVersiones[entrada.id];
  const texto = formatearValorLegal(definicion.unidad, entrada.valor);
  return <tr>
    <th scope="row">{texto}</th>
    <td>{formatearFechaDeRelacion(entrada.vigenteDesde)}</td>
    <td>{entrada.estado === "reemplazado" ? "—" : entrada.vigenteHasta ? formatearFechaDeRelacion(entrada.vigenteHasta) : entrada.estado === "programado" ? "Sin fecha de fin" : "Vigente"}</td>
    <td>{entrada.fuenteOficial}</td>
    <td>{entrada.activadaPor}<small className="linea-de-relacion">{formatearFechaDeRelacion(fechaDeHoyEnLima(entrada.activadaEn))}</small></td>
    <td className="celda-estado"><span className={entrada.estado === "vigente" ? "insignia ok" : "insignia neutro"}>{ESTADO_VISIBLE[entrada.estado]}</span>{entrada.motivoDeReemplazo && <small className="linea-de-relacion">Motivo: {entrada.motivoDeReemplazo}</small>}</td>
    <td><span className="acciones-configuracion">{entrada.estado === "reemplazado" ? null : usadaPor
      ? <><button className="boton-secundario" disabled type="button">Corregir<span className="sr-only"> {definicion.nombre} vigente desde el {formatearFechaDeRelacion(entrada.vigenteDesde)}</span></button><small className="linea-de-relacion">{textoDeUsoEnVersiones(usadaPor)}</small></>
      : <CorreccionDeRegla definicion={definicion} fuenteActual={entrada.fuenteOficial} reglaId={entrada.id} valorActual={texto} vigenteDesde={entrada.vigenteDesde} />}</span></td>
  </tr>;
}
