import Link from "next/link";
import { redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeGestionarPagos } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { NOMBRE_DE_AFILIACION, NOMBRE_DE_DATO, NOMBRE_DE_ESQUEMA, enMinuscula, esAfp, type Afiliacion, type EsquemaDeComision } from "@/condiciones-laborales/catalogo";
import { crearCasosDeUsoDeCondicionesLaborales } from "@/condiciones-laborales/casos-de-uso-servidor";
import type { FilaDeCondiciones } from "@/condiciones-laborales/gestionar-condiciones-laborales";
import { repositorioDeCondicionesLaborales } from "@/condiciones-laborales/servicio";
import { formatearValor } from "@/condiciones-laborales/valores";
import { fechaDeHoyEnLima } from "@/condiciones-laborales/vigencia";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";

import { NavegacionDePagos } from "../navegacion-de-pagos";
import { SinPermisoDePagos } from "../sin-permiso";

export const dynamic = "force-dynamic";

type Parametros = { grupo?: string; sede?: string; persona?: string; faltantes?: string };

export default async function PaginaDeCondicionesLaborales({ searchParams }: { searchParams: Promise<Parametros> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeGestionarPagos(actor)) return <SinPermisoDePagos />;

  const parametros = await searchParams;
  const filtros = { grupo: parametros.grupo || undefined, sede: parametros.sede || undefined, persona: parametros.persona || undefined, soloFaltantes: parametros.faltantes === "1" };
  const hayFiltros = Boolean(filtros.grupo || filtros.sede || filtros.persona || filtros.soloFaltantes);
  const casosDeUso = crearCasosDeUsoDeCondicionesLaborales(repositorioDeCondicionesLaborales, { obtenerActorActual });
  const hoy = fechaDeHoyEnLima();
  const { filas, total, grupos, sedes } = await casosDeUso.listar(hoy, filtros);
  const incompletas = filas.filter(({ faltantes }) => faltantes.length).length;

  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina"><div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>Condiciones laborales</h1><p>Mantenga por relación laboral, y con fecha de vigencia, el sueldo, la jornada, el régimen, la afiliación pensionaria, la elegibilidad familiar y la sede de adscripción. Un valor nuevo no reescribe la historia.</p></div></header>
    <NavegacionDePagos actual="condiciones-laborales" />

    {total ? <>
      <form className="filtros panel-filtros" method="get">
        <label>Grupo operativo<select defaultValue={filtros.grupo ?? ""} name="grupo"><option value="">Todos los grupos</option>{grupos.map((grupo) => <option key={grupo} value={grupo}>{grupo}</option>)}</select></label>
        <label>Sede de adscripción<select defaultValue={filtros.sede ?? ""} name="sede"><option value="">Todas las sedes</option>{sedes.map((sede) => <option key={sede} value={sede}>{sede}</option>)}</select></label>
        <label>Persona (nombre o DNI)<input defaultValue={filtros.persona ?? ""} name="persona" type="search" /></label>
        <label className="checkbox"><input defaultChecked={filtros.soloFaltantes} name="faltantes" type="checkbox" value="1" />Solo con datos faltantes</label>
        <button className="boton-secundario" type="submit">Filtrar</button>
      </form>

      <section className="tarjeta panel">
        <header className="panel-cabecera"><div><h2>Relaciones laborales confirmadas</h2><p>Valores vigentes hoy ({formatearFechaDeRelacion(hoy)}). Solo entran las relaciones con ingreso confirmado por Recursos Humanos.</p></div><span className="insignia neutro">{hayFiltros ? `${filas.length} de ${total} relaciones` : `${total} ${total === 1 ? "relación" : "relaciones"}`} · {incompletas} con datos faltantes</span></header>
        {filas.length ? <>
          <p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p>
          <div className="panel-tabla primera-columna-fija" role="region" aria-label="Condiciones laborales vigentes hoy" tabIndex={0}><table><thead><tr><th>Persona</th><th>Relación laboral</th><th className="numerico">Sueldo vigente hoy</th><th className="numerico">Jornada diaria</th><th>Régimen</th><th>Afiliación pensionaria</th><th>Sede de adscripción</th><th>Estado</th></tr></thead>
            <tbody>{filas.map((fila) => <tr key={fila.id}>
              <th scope="row"><Link href={`/pagos/condiciones-laborales/${fila.id}`}>{fila.nombre}</Link><small className="linea-de-relacion">DNI {fila.dni} · {fila.grupo}</small></th>
              <td>{relacionLaboral(fila)}</td>
              <td className="numerico">{valorOPendiente(fila, "sueldo")}</td>
              <td className="numerico">{valorOPendiente(fila, "jornada_ordinaria_diaria")}</td>
              <td>{valorOPendiente(fila, "regimen_laboral")}</td>
              <td>{afiliacion(fila)}</td>
              <td>{valorOPendiente(fila, "sede_de_adscripcion")}</td>
              <td className="celda-estado">{fila.faltantes.length ? <span className="insignia advertencia">Falta: {fila.faltantes.map((dato) => enMinuscula(NOMBRE_DE_DATO[dato])).join(", ")}</span> : <span className="insignia ok">Completa</span>}</td>
            </tr>)}</tbody></table></div>
        </> : <section className="estado-vacio"><h3>Ninguna relación coincide con los filtros</h3><p>Cambie los criterios o <Link href="/pagos/condiciones-laborales">quite los filtros</Link> para ver las {total} relaciones confirmadas.</p></section>}
      </section>
    </> : <section className="estado-vacio"><h2>Todavía no hay relaciones laborales confirmadas</h2><p>Recursos Humanos las registra y confirma.</p></section>}
  </main>;
}

function relacionLaboral({ ingreso, cese }: FilaDeCondiciones): string {
  return `Ingreso ${formatearFechaDeRelacion(ingreso)} – ${cese ? `cese ${formatearFechaDeRelacion(cese)}` : "vigente"}`;
}

/** Un dato sin valor vigente es «Pendiente» con texto, nunca un cero. */
function valorOPendiente(fila: FilaDeCondiciones, dato: keyof FilaDeCondiciones["vigentes"]) {
  const vigente = fila.vigentes[dato];
  return vigente === undefined ? <span className="insignia advertencia">Pendiente</span> : formatearValor(dato, vigente);
}

function afiliacion(fila: FilaDeCondiciones) {
  const { afiliacion_pensionaria: elegida, comision_afp: esquema } = fila.vigentes;
  if (elegida === undefined) return <span className="insignia advertencia">Pendiente</span>;
  const nombre = NOMBRE_DE_AFILIACION[elegida as Afiliacion];
  if (!esAfp(elegida)) return nombre;
  return esquema === undefined
    ? <>{nombre} · <span className="insignia advertencia">Esquema pendiente</span></>
    : `${nombre} · comisión ${enMinuscula(NOMBRE_DE_ESQUEMA[esquema as EsquemaDeComision])}`;
}
