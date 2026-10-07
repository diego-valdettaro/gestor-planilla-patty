import Link from "next/link";
import { redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeGestionarPagos } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { NOMBRE_DE_DATO, enMinuscula, type DatoLaboral } from "@/condiciones-laborales/catalogo";
import { crearCasosDeUsoDeCondicionesLaborales } from "@/condiciones-laborales/casos-de-uso-servidor";
import { textoDeUsoEnVersiones, type DetalleDeRelacion, type EntradaDeHistorial, type HistorialDeDato } from "@/condiciones-laborales/gestionar-condiciones-laborales";
import { repositorioDeCondicionesLaborales } from "@/condiciones-laborales/servicio";
import { formatearValor } from "@/condiciones-laborales/valores";
import { fechaDeHoyEnLima } from "@/condiciones-laborales/vigencia";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";
import { desplazarFecha } from "@/turnos/semana";

import { NavegacionDePagos } from "../../navegacion-de-pagos";
import { SinPermisoDePagos } from "../../sin-permiso";

import { CorreccionDeCondicion, RegistroDeCondicion } from "./formularios";

export const dynamic = "force-dynamic";

const ESTADO_VISIBLE = { vigente: "Vigente", anterior: "Anterior", programado: "Programado", reemplazado: "Reemplazado" } as const;

export default async function PaginaDeDetalleDeCondiciones({ params }: { params: Promise<{ relacionId: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeGestionarPagos(actor)) return <SinPermisoDePagos />;

  const { relacionId } = await params;
  const casosDeUso = crearCasosDeUsoDeCondicionesLaborales(repositorioDeCondicionesLaborales, { obtenerActorActual });
  const hoy = fechaDeHoyEnLima();
  const [detalle, sedes] = await Promise.all([casosDeUso.detalle(relacionId, hoy), casosDeUso.sedesDeAdscripcion()]);
  if (!detalle) return <main className="contenido pagina">
    <NavegacionDePagos actual="condiciones-laborales" />
    <section className="estado-vacio"><h1>No existe esa relación laboral confirmada</h1><p>Solo hay condiciones laborales para relaciones con ingreso confirmado por Recursos Humanos. <Link href="/pagos/condiciones-laborales">Volver a condiciones laborales</Link></p></section>
  </main>;

  const { relacion } = detalle;
  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina">
      <div>
        <p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p>
        <h1>Condiciones laborales de {relacion.nombre}</h1>
        <p>DNI {relacion.dni} · Grupo {relacion.grupo} · Ingreso {formatearFechaDeRelacion(relacion.ingreso)} – {relacion.cese ? `cese ${formatearFechaDeRelacion(relacion.cese)}` : "vigente"}</p>
        <p><Link href="/pagos/condiciones-laborales">Volver a condiciones laborales</Link></p>
      </div>
      <RegistroDeCondicion cese={relacion.cese} limites={limitesDeFecha(detalle)} nombreDeLaPersona={relacion.nombre} relacionId={relacion.id} sedes={sedes} />
    </header>
    <NavegacionDePagos actual="condiciones-laborales" />
    {detalle.datos.map((dato) => <PanelDeDato dato={dato} detalle={detalle} hoy={hoy} key={dato.dato} sedes={sedes} />)}
  </main>;
}

/** Un valor nuevo empieza después de la última vigencia activa del dato, o desde el ingreso si todavía no tiene ninguna. */
function limitesDeFecha({ relacion, datos }: DetalleDeRelacion): Record<DatoLaboral, { minimo: string; ultima?: string }> {
  return Object.fromEntries(datos.map(({ dato, historial }) => {
    const ultima = historial.filter(({ estado }) => estado !== "reemplazado").at(-1)?.vigenteDesde;
    return [dato, { minimo: ultima ? desplazarFecha(ultima, 1) : relacion.ingreso, ultima }];
  })) as Record<DatoLaboral, { minimo: string; ultima?: string }>;
}

function PanelDeDato({ dato, detalle, hoy, sedes }: { dato: HistorialDeDato; detalle: DetalleDeRelacion; hoy: string; sedes: string[] }) {
  const titulo = `titulo-${dato.dato}`;
  return <section aria-labelledby={titulo} className="tarjeta panel">
    <header className="panel-cabecera"><div><h2 id={titulo}>{NOMBRE_DE_DATO[dato.dato]}</h2><p>Vigente hoy ({formatearFechaDeRelacion(hoy)}): {dato.vigente === undefined ? <span className="insignia advertencia">Pendiente</span> : <strong>{formatearValor(dato.dato, dato.vigente)}</strong>}</p></div></header>
    {dato.historial.length
      ? <div className="panel-tabla primera-columna-fija" role="region" aria-label={`Historial de ${enMinuscula(NOMBRE_DE_DATO[dato.dato])}`} tabIndex={0}><table><thead><tr><th>Valor</th><th>Vigente desde</th><th>Vigente hasta</th><th>Registrado por</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>{dato.historial.map((entrada) => <FilaDeHistorial dato={dato} detalle={detalle} entrada={entrada} key={entrada.id} sedes={sedes} />)}</tbody></table></div>
      : <section className="estado-vacio"><h3>Pendiente: todavía no hay ningún valor</h3><p>Use «Registrar nuevo valor» para indicar {enMinuscula(NOMBRE_DE_DATO[dato.dato])} y desde cuándo rige.</p></section>}
  </section>;
}

function FilaDeHistorial({ dato, detalle, entrada, sedes }: { dato: HistorialDeDato; detalle: DetalleDeRelacion; entrada: EntradaDeHistorial; sedes: string[] }) {
  const usadaPor = detalle.usadasPorVersiones[entrada.id];
  const texto = formatearValor(entrada.dato, entrada.valor);
  return <tr>
    <th scope="row">{texto}</th>
    <td>{formatearFechaDeRelacion(entrada.vigenteDesde)}</td>
    <td>{entrada.estado === "reemplazado" ? "—" : entrada.vigenteHasta ? formatearFechaDeRelacion(entrada.vigenteHasta) : "Vigente"}</td>
    <td>{entrada.registradaPor}<small className="linea-de-relacion">{formatearFechaDeRelacion(fechaDeHoyEnLima(entrada.registradaEn))}</small></td>
    <td><span className={entrada.estado === "vigente" ? "insignia ok" : "insignia neutro"}>{ESTADO_VISIBLE[entrada.estado]}</span>{entrada.motivoDeReemplazo && <small className="linea-de-relacion">Motivo: {entrada.motivoDeReemplazo}</small>}</td>
    <td><span className="acciones-configuracion">{entrada.estado === "reemplazado" ? null : usadaPor
      ? <><button className="boton-secundario" disabled type="button">Corregir<span className="sr-only"> {enMinuscula(NOMBRE_DE_DATO[entrada.dato])} vigente desde el {formatearFechaDeRelacion(entrada.vigenteDesde)}</span></button><small className="linea-de-relacion">{textoDeUsoEnVersiones(usadaPor)}</small></>
      : <CorreccionDeCondicion condicionId={entrada.id} dato={dato.dato} nombreDeLaPersona={detalle.relacion.nombre} sedes={sedes} valorActual={texto} vigenteDesde={entrada.vigenteDesde} />}</span></td>
  </tr>;
}
