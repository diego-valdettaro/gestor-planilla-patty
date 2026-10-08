import Link from "next/link";
import { redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeGestionarPagos } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { buscarConcepto } from "@/conceptos-de-preliquidacion/catalogo";
import { formatearSoles } from "@/condiciones-laborales/valores";
import { fechaDeHoyEnLima } from "@/condiciones-laborales/vigencia";
import { crearCasosDeUsoDeFuentesExternas } from "@/fuentes-externas/casos-de-uso-servidor";
import type { ImporteExterno } from "@/fuentes-externas/gestionar-fuentes-externas";
import { repositorioDeFuentesExternas } from "@/fuentes-externas/servicio";
import { buscarTipoDeFuente } from "@/fuentes-externas/tipos-de-fuente";
import { formatearMes, textoDeProcedencia } from "@/fuentes-externas/valores";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";

import { NavegacionDePagos } from "../../navegacion-de-pagos";
import { SinPermisoDePagos } from "../../sin-permiso";
import { InsigniaDeEstado } from "../insignia-de-estado";
import { AnuncioDelResultado } from "../anuncio";
import { AnulacionDeImporte, ConfirmacionDeListado, RegistroDeImporte, VolverAPendiente } from "../formularios";
import { mesDePagoDeLaConsulta } from "../mes-de-pago";

export const dynamic = "force-dynamic";

const TEXTO_DE_EFECTO = { suma: "Suma al neto", resta: "Resta del neto", ninguno: "No cambia el neto", del_concepto_ajustado: "Según el concepto ajustado" } as const;

export default async function PaginaDeUnaFuenteExterna({ params, searchParams }: { params: Promise<{ tipo: string }>; searchParams: Promise<{ mes?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeGestionarPagos(actor)) return <SinPermisoDePagos />;

  const { tipo: codigo } = await params;
  const { mes: mesPedido } = await searchParams;
  const tipo = buscarTipoDeFuente(codigo);
  if (!tipo) return <main className="contenido pagina">
    <NavegacionDePagos actual="fuentes-externas" />
    <section className="estado-vacio"><h1>No existe ese tipo de fuente</h1><p>Elija uno de la lista de fuentes externas. <Link href="/pagos/fuentes-externas">Volver a fuentes externas</Link></p></section>
  </main>;

  const { mes, error: errorDeMes } = mesDePagoDeLaConsulta(mesPedido);

  const casosDeUso = crearCasosDeUsoDeFuentesExternas(repositorioDeFuentesExternas, { obtenerActorActual });
  const detalle = await casosDeUso.fuente(tipo.codigo, mes);
  if (!detalle) return null;
  const conceptos = tipo.conceptos.flatMap((conceptoCodigo) => buscarConcepto(conceptoCodigo) ?? []).map(({ codigo: conceptoCodigo, nombre }) => ({ codigo: conceptoCodigo, nombre }));
  const confirmada = detalle.estado !== "pendiente";

  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina">
      <div>
        <p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p>
        <h1>{tipo.nombre} · mes de pago {formatearMes(mes)}</h1>
        <p>Estado: <InsigniaDeEstado estado={detalle.estado} />{detalle.confirmacion && <> Confirmada por {detalle.confirmacion.confirmadaPor} el {formatearFechaDeRelacion(fechaDeHoyEnLima(detalle.confirmacion.confirmadaEn))}.</>}</p>
        <p><Link href={`/pagos/fuentes-externas?mes=${mes}`}>Volver a fuentes externas</Link></p>
      </div>
      {confirmada
        ? <VolverAPendiente mes={mes} nombre={tipo.nombre} tipoDeFuente={tipo.codigo} />
        : <ConfirmacionDeListado filas={detalle.filas} mes={mes} nombre={tipo.nombre} tipoDeFuente={tipo.codigo} total={detalle.total} />}
    </header>
    <NavegacionDePagos actual="fuentes-externas" />
    <AnuncioDelResultado />
    {errorDeMes && <p className="mensaje-operacion error" role="alert">{errorDeMes} Se muestra el mes {formatearMes(mes)}.</p>}

    <section aria-labelledby="titulo-filas" className="tarjeta panel">
      <header className="panel-cabecera"><div><h2 id="titulo-filas">Filas cargadas</h2><p>{detalle.filas} {detalle.filas === 1 ? "fila" : "filas"}, {formatearSoles(detalle.total)} en total para el mes de pago completo.</p></div></header>
      {detalle.importes.length
        ? <>
          <p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p>
          <div className="panel-tabla primera-columna-fija" role="region" aria-label={`Filas de ${tipo.nombre} de ${formatearMes(mes)}`} tabIndex={0}><table><thead><tr><th>Persona</th><th>Concepto</th><th>Fecha del hecho</th><th>Mes de devengue</th><th>Mes de aplicación</th><th className="numerico">Importe (S/)</th><th>Procedencia</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>{detalle.importes.map((importe) => <FilaDeImporte confirmada={confirmada} importe={importe} key={importe.id} />)}</tbody></table></div>
        </>
        : <section className="estado-vacio"><h3>No hay filas de {tipo.nombre} para este mes</h3><p>Cargue un importe abajo o confirme el listado sin importes.</p></section>}
    </section>

    <section aria-labelledby="titulo-registro" className="tarjeta panel">
      <header className="panel-cabecera"><div><h2 id="titulo-registro">Registrar un importe</h2><p>Carga manual. Un importe no se edita: si está mal, anúlelo con motivo y regístrelo de nuevo. Las líneas calculadas se corrigen en su fuente o con un ajuste de preliquidación.</p></div></header>
      <RegistroDeImporte conceptos={conceptos} mes={mes} tipoDeFuente={tipo.codigo} />
    </section>
  </main>;
}

function FilaDeImporte({ importe, confirmada }: { importe: ImporteExterno; confirmada: boolean }) {
  const concepto = buscarConcepto(importe.concepto);
  const nombreDelConcepto = concepto?.nombre ?? importe.concepto;
  return <tr>
    <th scope="row">{importe.nombre}<small className="linea-de-relacion">DNI {importe.dni}</small></th>
    <td>{nombreDelConcepto}{concepto && <small className="linea-de-relacion">{TEXTO_DE_EFECTO[concepto.efectoEnNeto]}</small>}</td>
    <td>{formatearFechaDeRelacion(importe.fechaDelHecho)}</td>
    <td>{formatearMes(importe.mesDeDevengue)}{importe.mesDeDevengue < importe.mesDeAplicacion && <small className="linea-de-relacion">Devengue anterior</small>}</td>
    <td>{formatearMes(importe.mesDeAplicacion)}</td>
    <td className="numerico">{formatearSoles(importe.monto)}</td>
    <td>{textoDeProcedencia(importe.procedencia)}<small className="linea-de-relacion">{importe.registradoPor}, {formatearFechaDeRelacion(fechaDeHoyEnLima(importe.registradoEn))}</small></td>
    <td><span className="acciones-configuracion"><AnulacionDeImporte concepto={nombreDelConcepto} confirmada={confirmada} dni={importe.dni} importeId={importe.id} monto={importe.monto} persona={importe.nombre} /></span></td>
  </tr>;
}
