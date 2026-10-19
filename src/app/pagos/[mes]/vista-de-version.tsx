import Link from "next/link";

import { NOMBRE_DE_ROL, type Actor } from "@/autenticacion/permisos";
import { buscarConcepto } from "@/conceptos-de-preliquidacion/catalogo";
import { formatearSoles } from "@/condiciones-laborales/valores";
import { fechaDeHoyEnLima } from "@/condiciones-laborales/vigencia";
import { formatearMes } from "@/fuentes-externas/valores";
import type { VersionDePago } from "@/pagos/finalizar-mes";
import { ROTULO_DEL_NETO } from "@/pagos/fuentes-en-el-neto";
import { buscarDefinicion } from "@/reglas-legales/catalogo";
import { formatearValorLegal } from "@/reglas-legales/valores";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";

import { NavegacionDePagos } from "../navegacion-de-pagos";
import { NotaDelSubtotal } from "../nota-del-subtotal";
import { TablaDesplazable } from "./tabla-desplazable";

const fecha = formatearFechaDeRelacion;

/** Una versión finalizada del mes, completa y de solo lectura (interacción §4.2, D15): lo que se guardó, sin recalcular el borrador. */
export function VistaDeVersion({ actor, version }: { actor: Actor; version: VersionDePago }) {
  const { mesDePago: mes, numero } = version;
  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina"><div>
      <p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p>
      <h1>Mes de pago {formatearMes(mes)}</h1>
      <p>Versión {numero}, finalizada por {version.finalizadaPor} el {fecha(fechaDeHoyEnLima(version.finalizadaEn))}</p>
      <span className="insignia neutro">Solo lectura</span>
      <p><Link href={`/pagos/${mes}`}>Volver al mes de pago {formatearMes(mes)}</Link></p>
    </div></header>
    <NavegacionDePagos actual="meses" />
    <section className="tarjeta panel"><header className="panel-cabecera"><div><h2>Totales de la versión {numero}</h2><p>{`Subtotal «${ROTULO_DEL_NETO}» del mes completo: ${formatearSoles(version.subtotalCentimos)}, de ${version.personas.length} ${version.personas.length === 1 ? "persona" : "personas"}. Esta versión no se puede editar.`}</p><NotaDelSubtotal /></div></header></section>
    <section className="tarjeta panel"><header className="panel-cabecera"><h2>Reglas legales usadas</h2></header>
      <TablaDesplazable etiqueta="Reglas legales usadas"><thead><tr><th>Regla</th><th className="numerico">Valor</th><th>Vigente desde</th><th>Fuente oficial</th><th>Activada por</th></tr></thead>
        <tbody>{version.reglas.map((regla) => {
          const definicion = buscarDefinicion(regla.codigo);
          return <tr key={regla.codigo}><th scope="row">{definicion?.nombre ?? regla.codigo}</th><td className="numerico">{definicion ? formatearValorLegal(definicion.unidad, regla.valor) : regla.valor}</td><td>{fecha(regla.vigenteDesde)}</td><td>{regla.fuenteOficial}</td><td>{regla.activadaPor}</td></tr>;
        })}</tbody></TablaDesplazable></section>
    <section className="tarjeta panel"><header className="panel-cabecera"><h2>Revisiones de asistencia de origen</h2></header>
      <TablaDesplazable etiqueta="Revisiones de asistencia de origen"><thead><tr><th>Período de planilla</th><th>Revisión</th></tr></thead>
        <tbody>{version.revisiones.map(({ periodoId, inicio, fin, numero: revision }) => <tr key={periodoId}><th scope="row">{fecha(inicio)} al {fecha(fin)}</th><td>Revisión n.º {revision ?? "—"}</td></tr>)}</tbody></TablaDesplazable></section>
    <section className="tarjeta panel"><header className="panel-cabecera"><h2>Fuentes externas de la versión</h2></header>
      <TablaDesplazable etiqueta="Fuentes externas de la versión"><thead><tr><th>Tipo de fuente</th><th>Estado</th><th className="numerico">Filas (n.º)</th><th className="numerico">Total</th></tr></thead>
        <tbody>{version.fuentes.map((fuente) => <tr key={fuente.tipoDeFuente}><th scope="row">{fuente.nombre}</th><td><span className={`insignia ${fuente.estado === "Pendiente" ? "advertencia" : "ok"}`}>{fuente.estado}</span></td><td className="numerico">{fuente.filas}</td><td className="numerico">{formatearSoles(fuente.totalCentimos)}</td></tr>)}</tbody></TablaDesplazable></section>
    <section className="tarjeta panel"><header className="panel-cabecera"><h2>Personas de la versión</h2></header>
      <TablaDesplazable etiqueta="Personas de la versión"><thead><tr><th>Persona</th><th className="numerico">{ROTULO_DEL_NETO}</th></tr></thead>
        <tbody>{version.personas.map((persona) => <tr key={persona.relacionId}><th scope="row">{persona.nombre}<small className="linea-de-relacion">DNI {persona.dni}</small></th><td className="numerico">{formatearSoles(persona.subtotalCentimos)}</td></tr>)}</tbody></TablaDesplazable></section>
    {version.personas.map((persona) => <section className="tarjeta panel" key={persona.relacionId}>
      <header className="panel-cabecera"><h2>{persona.nombre}</h2></header>
      <TablaDesplazable etiqueta={`Conceptos de ${persona.nombre}`}><thead><tr><th>Concepto</th><th>Mes de devengue</th><th className="numerico">Importe</th></tr></thead>
        <tbody>{persona.lineas.map((linea, indice) => <tr key={indice}><th scope="row">{buscarConcepto(linea.concepto)?.nombre ?? linea.concepto}</th><td>{formatearMes(linea.mesDeDevengue)}</td><td className="numerico">{"efectoEnNeto" in linea && linea.efectoEnNeto === "resta" ? "−" : ""}{formatearSoles(linea.importeCentimos)}</td></tr>)}</tbody></TablaDesplazable>
      <TablaDesplazable etiqueta={`Bases de ${persona.nombre}`}><thead><tr><th>Mes de devengue</th><th className="numerico">Base pensionaria</th><th className="numerico">Base de EsSalud (remunerativa)</th><th className="numerico">Base de EsSalud aplicable</th><th className="numerico">Base de quinta categoría</th></tr></thead>
        <tbody>{persona.bases.map((base) => <tr key={base.mesDeDevengue}><th scope="row">{formatearMes(base.mesDeDevengue)}</th>{[base.pensionariaCentimos, base.essaludRemunerativaCentimos, base.essaludAplicableCentimos, base.quintaCentimos].map((valor, i) => <td className="numerico" key={i}>{valor === null ? "Pendiente" : formatearSoles(valor)}</td>)}</tr>)}</tbody></TablaDesplazable>
    </section>)}
  </main>;
}
