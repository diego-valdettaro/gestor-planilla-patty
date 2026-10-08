import Link from "next/link";
import { redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeGestionarPagos } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";
import { fechaDeHoyEnLima } from "@/condiciones-laborales/vigencia";
import { REGLAS_LEGALES } from "@/reglas-legales/catalogo";
import { crearCasosDeUsoDeReglasLegales } from "@/reglas-legales/casos-de-uso-servidor";
import type { FilaDeReglaLegal } from "@/reglas-legales/gestionar-reglas-legales";
import { repositorioDeReglasLegales } from "@/reglas-legales/servicio";
import { formatearValorLegal } from "@/reglas-legales/valores";

import { NavegacionDePagos } from "../navegacion-de-pagos";
import { SinPermisoDePagos } from "../sin-permiso";

import { ActivacionDeRegla } from "./formularios";

export const dynamic = "force-dynamic";

export default async function PaginaDeReglasLegales() {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeGestionarPagos(actor)) return <SinPermisoDePagos />;

  const casosDeUso = crearCasosDeUsoDeReglasLegales(repositorioDeReglasLegales, { obtenerActorActual });
  const hoy = fechaDeHoyEnLima();
  const filas = await casosDeUso.listar(hoy);
  const sinReglas = filas.every(({ vigente, proxima }) => !vigente && !proxima);
  const pendientes = filas.filter(({ vigente }) => !vigente).length;
  const activacion = <ActivacionDeRegla definiciones={REGLAS_LEGALES} usuario={actor.nombreUsuario ?? "su usuario"} />;

  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina">
      <div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>Reglas legales</h1><p>Registre y active tasas, topes, la remuneración mínima vital y demás valores legales con su fecha de vigencia y su fuente oficial. Un valor nuevo no reescribe la historia y el cálculo no consulta servicios externos.</p></div>
      {!sinReglas && activacion}
    </header>
    <NavegacionDePagos actual="reglas-legales" />

    {sinReglas
      ? <section className="estado-vacio"><h2>No hay reglas legales activas</h2><p>Sin ellas el cálculo de aportes queda bloqueado.</p>{activacion}</section>
      : <section className="tarjeta panel">
        <header className="panel-cabecera"><div><h2>Valores legales</h2><p>Valor vigente hoy ({formatearFechaDeRelacion(hoy)}). Abra un valor para ver su historial y consultar otra fecha.</p></div><span className={pendientes ? "insignia advertencia" : "insignia ok"}>{pendientes ? `${pendientes} sin regla vigente` : "Todos con regla vigente"}</span></header>
        <p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p>
        <div className="panel-tabla primera-columna-fija" role="region" aria-label="Reglas legales vigentes hoy" tabIndex={0}><table><thead><tr><th>Valor legal</th><th className="numerico">Valor vigente hoy</th><th>Vigente desde</th><th>Fuente oficial</th><th>Activado por</th></tr></thead>
          <tbody>{filas.map((fila) => <FilaDeRegla fila={fila} key={fila.definicion.codigo} />)}</tbody></table></div>
      </section>}
  </main>;
}

function FilaDeRegla({ fila }: { fila: FilaDeReglaLegal }) {
  const { definicion, vigente, proxima } = fila;
  return <tr>
    <th scope="row"><Link href={`/pagos/reglas-legales/${definicion.codigo}`}>{definicion.nombre}</Link></th>
    <td className="numerico">{vigente
      ? <strong>{formatearValorLegal(definicion.unidad, vigente.valor)}</strong>
      : <><span className="insignia advertencia">Pendiente</span><small className="linea-de-relacion">Sin regla vigente</small></>}
      {proxima && <small className="linea-de-relacion">Programado: {formatearValorLegal(definicion.unidad, proxima.valor)} desde el {formatearFechaDeRelacion(proxima.vigenteDesde)}</small>}</td>
    <td>{vigente ? formatearFechaDeRelacion(vigente.vigenteDesde) : "—"}</td>
    <td>{vigente ? vigente.fuenteOficial : "—"}</td>
    <td>{vigente ? <>{vigente.activadaPor}<small className="linea-de-relacion">{formatearFechaDeRelacion(fechaDeHoyEnLima(vigente.activadaEn))}</small></> : "—"}</td>
  </tr>;
}
