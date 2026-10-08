import Link from "next/link";
import { redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeGestionarPagos } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { formatearSoles } from "@/condiciones-laborales/valores";
import { fechaDeHoyEnLima } from "@/condiciones-laborales/vigencia";
import { crearCasosDeUsoDeFuentesExternas } from "@/fuentes-externas/casos-de-uso-servidor";
import type { FilaDeFuente } from "@/fuentes-externas/gestionar-fuentes-externas";
import { repositorioDeFuentesExternas } from "@/fuentes-externas/servicio";
import { formatearMes, textoDeProcedencia } from "@/fuentes-externas/valores";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";

import { NavegacionDePagos } from "../navegacion-de-pagos";
import { SinPermisoDePagos } from "../sin-permiso";

import { ConfirmacionDeListado, VolverAPendiente } from "./formularios";
import { InsigniaDeEstado } from "./insignia-de-estado";
import { AnuncioDelResultado } from "./anuncio";
import { mesDePagoDeLaConsulta } from "./mes-de-pago";

export const dynamic = "force-dynamic";

export default async function PaginaDeFuentesExternas({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeGestionarPagos(actor)) return <SinPermisoDePagos />;

  const { mes: mesPedido } = await searchParams;
  const { mes, error: errorDeMes } = mesDePagoDeLaConsulta(mesPedido);

  const casosDeUso = crearCasosDeUsoDeFuentesExternas(repositorioDeFuentesExternas, { obtenerActorActual });
  const filas = await casosDeUso.estado(mes);
  const pendientes = filas.filter((fila) => fila.estado === "pendiente").length;

  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina">
      <div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>Fuentes externas del mes de pago {formatearMes(mes)}</h1><p>Una persona sin fila cuenta como cero solo cuando confirma el tipo de fuente.</p></div>
    </header>
    <NavegacionDePagos actual="fuentes-externas" />
    <AnuncioDelResultado />

    <section aria-labelledby="titulo-mes" className="tarjeta panel">
      <header className="panel-cabecera"><div><h2 id="titulo-mes">Mes de pago</h2><p>Las fuentes se confirman para el mes de pago completo. El mes de devengue de cada importe puede ser anterior.</p></div></header>
      <form className="filtros panel-filtros" method="get">
        <label>Mes de pago<input defaultValue={mes} name="mes" required type="month" /></label>
        <button className="boton-secundario" type="submit">Consultar</button>
      </form>
      {errorDeMes && <p className="mensaje-operacion error" role="alert">{errorDeMes} Se muestra el mes {formatearMes(mes)}.</p>}
    </section>

    <section aria-labelledby="titulo-fuentes" className="tarjeta panel">
      <header className="panel-cabecera"><div><h2 id="titulo-fuentes">Tipos de fuente</h2><p>Confirme cada tipo para el mes completo, incluso si no tiene importes.</p></div><span className={pendientes ? "insignia advertencia" : "insignia ok"}>{pendientes ? `${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"}` : "Todas confirmadas"}</span></header>
      <p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p>
      <div className="panel-tabla primera-columna-fija tabla-de-fuentes" role="region" aria-label={`Tipos de fuente de ${formatearMes(mes)}`} tabIndex={0}><table><thead><tr><th>Tipo de fuente</th><th>Estado</th><th className="numerico">Filas (n.º)</th><th className="numerico">Importe total (S/)</th><th>Último origen</th><th><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>{filas.map((fila) => <FilaDeFuenteExterna fila={fila} key={fila.tipo.codigo} mes={mes} />)}</tbody></table></div>
    </section>
  </main>;
}

function FilaDeFuenteExterna({ fila, mes }: { fila: FilaDeFuente; mes: string }) {
  const { tipo, estado, confirmacion, ultimoOrigen } = fila;
  return <tr>
    <th scope="row"><Link href={`/pagos/fuentes-externas/${tipo.codigo}?mes=${mes}`}>{tipo.nombre}</Link></th>
    <td className="celda-estado"><InsigniaDeEstado estado={estado} />{confirmacion && <small className="linea-de-relacion">Confirmada por {confirmacion.confirmadaPor} el {formatearFechaDeRelacion(fechaDeHoyEnLima(confirmacion.confirmadaEn))}</small>}</td>
    <td className="numerico">{fila.filas}</td>
    <td className="numerico">{estado === "pendiente" && !fila.filas ? "—" : formatearSoles(fila.total)}</td>
    <td>{ultimoOrigen ? <>{textoDeProcedencia(ultimoOrigen.procedencia)}<small className="linea-de-relacion">{ultimoOrigen.registradoPor}, {formatearFechaDeRelacion(fechaDeHoyEnLima(ultimoOrigen.registradoEn))}</small></> : "Sin filas"}</td>
    <td><span className="acciones-configuracion">
      <Link className="boton-secundario" href={`/pagos/fuentes-externas/${tipo.codigo}?mes=${mes}`}>Ver filas<span className="sr-only"> de {tipo.nombre}</span></Link>
      {estado === "pendiente"
        ? <ConfirmacionDeListado filas={fila.filas} mes={mes} nombre={tipo.nombre} tipoDeFuente={tipo.codigo} total={fila.total} />
        : <VolverAPendiente mes={mes} nombre={tipo.nombre} tipoDeFuente={tipo.codigo} />}
    </span></td>
  </tr>;
}
