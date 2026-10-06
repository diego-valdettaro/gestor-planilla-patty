import { redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeConsultarRelacionesLaborales, puedeGestionarRelacionesLaborales } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { repositorioDeColaboradores } from "@/colaboradores/servicio";
import { crearCasosDeUsoDeRelacionesLaborales } from "@/relaciones-laborales/casos-de-uso-servidor";
import type { PersonaConRelacionVigente, RelacionConPersona } from "@/relaciones-laborales/gestionar-relaciones-laborales";
import { repositorioDeRelacionesLaborales } from "@/relaciones-laborales/servicio";
import { estaVigenteEn, formatearFechaDeRelacion, vigenciasConfirmadas } from "@/relaciones-laborales/vigencia";

import { ConfirmacionDeFecha, FormularioDeFecha, FormularioDeIngreso } from "./formularios";

export const dynamic = "force-dynamic";

type Parametros = { desde?: string; hasta?: string };

export default async function PaginaDeRelacionesLaborales({ searchParams }: { searchParams: Promise<Parametros> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeConsultarRelacionesLaborales(actor)) return <main className="centrado"><section className="estado-vacio"><h1>Sin permiso</h1><p>Su rol no permite consultar relaciones laborales. Pida al Administrador del sistema que revise su rol.</p></section></main>;

  const puedeGestionar = puedeGestionarRelacionesLaborales(actor);
  const casosDeUso = crearCasosDeUsoDeRelacionesLaborales(repositorioDeRelacionesLaborales, { obtenerActorActual });
  const hoy = new Date().toISOString().slice(0, 10);
  const parametros = await searchParams;
  const desde = parametros.desde || hoy;
  const hasta = parametros.hasta || undefined;

  const [relaciones, colaboradores] = await Promise.all([casosDeUso.listar(), puedeGestionar ? repositorioDeColaboradores.listar() : Promise.resolve([])]);
  let vigentes: PersonaConRelacionVigente[] = [];
  let errorDeConsulta: string | undefined;
  try {
    vigentes = await casosDeUso.consultarVigentes(desde, hasta);
  } catch (causa) {
    errorDeConsulta = causa instanceof Error ? causa.message : "No se pudo consultar la vigencia.";
  }

  const conRelacionSinCese = new Set(relaciones.filter((relacion) => relacion.cese === null).map((relacion) => relacion.dni));
  const colaboradoresParaIngreso = colaboradores.filter((colaborador) => !conRelacionSinCese.has(colaborador.dni));
  const porConfirmar = relaciones.filter((relacion) => !relacion.ingresoConfirmado || (relacion.cese !== null && !relacion.ceseConfirmado)).length;

  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina"><div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>Relaciones laborales</h1><p>{puedeGestionar ? "Registre y confirme las fechas de ingreso y cese. Esas fechas definen cuándo el gerente puede publicar horarios y quién entra en Pagos." : "Consulte las fechas de ingreso y cese confirmadas por Recursos Humanos. Su rol solo puede consultarlas."}</p></div></header>

    {puedeGestionar && <section className="tarjeta panel">
      <header className="panel-cabecera"><div><h2>Registrar ingreso</h2><p>Para un reingreso elija a la misma persona: conserva su DNI y recibe otra relación laboral. La persona la da de alta el gerente de su grupo.</p></div></header>
      {colaboradoresParaIngreso.length
        ? <FormularioDeIngreso colaboradores={colaboradoresParaIngreso.map(({ dni, nombre, grupo }) => ({ dni, nombre, grupo }))} />
        : <section className="estado-vacio"><h3>No hay colaboradores para registrar</h3><p>{colaboradores.length ? "Todos los colaboradores tienen una relación laboral sin cese. Registre el cese de una para poder registrar su reingreso." : "El gerente de cada grupo da de alta a sus colaboradores en Configuración; después podrá registrar su ingreso aquí."}</p></section>}
    </section>}

    <section className="tarjeta panel">
      <header className="panel-cabecera"><div><h2>Relaciones laborales</h2><p>Solo el ingreso y el cese confirmados cuentan para publicar horarios y para Pagos.</p></div><span className="insignia neutro">{relaciones.length} relaciones · {porConfirmar} con fechas por confirmar</span></header>
      {relaciones.length ? <div className="panel-tabla"><table><thead><tr><th>Colaborador</th><th>DNI</th><th>Grupo</th><th>Ingreso</th><th>Cese</th><th>Estado</th>{puedeGestionar && <th><span className="sr-only">Acciones</span></th>}</tr></thead><tbody>{relaciones.map((relacion) => <tr key={relacion.id}>
        <td>{relacion.nombre}</td><td>{relacion.dni}</td><td>{relacion.grupo}</td>
        <td>{formatearFechaDeRelacion(relacion.ingreso)} <span className={relacion.ingresoConfirmado ? "insignia ok" : "insignia neutro"}>{relacion.ingresoConfirmado ? "Confirmado" : "Por confirmar"}</span></td>
        <td>{relacion.cese ? <>{formatearFechaDeRelacion(relacion.cese)} <span className={relacion.ceseConfirmado ? "insignia ok" : "insignia neutro"}>{relacion.ceseConfirmado ? "Confirmado" : "Por confirmar"}</span></> : "—"}</td>
        <td>{estadoDe(relacion, hoy)}</td>
        {puedeGestionar && <td><span className="acciones-configuracion">{acciones(relacion)}</span></td>}
      </tr>)}</tbody></table></div> : <section className="estado-vacio"><h3>Todavía no hay relaciones laborales</h3><p>{puedeGestionar ? "Registre el ingreso de un colaborador con el formulario de arriba." : "Recursos Humanos las registra y confirma."}</p></section>}
    </section>

    <section className="tarjeta panel">
      <header className="panel-cabecera"><div><h2>Personas con relación laboral vigente</h2><p>Consulta por fecha o rango, a partir de las relaciones confirmadas y sin depender de las asistencias registradas.</p></div><span className="insignia neutro">{vigentes.length} {vigentes.length === 1 ? "persona vigente" : "personas vigentes"}</span></header>
      <form className="filtros panel-filtros" method="get">
        <label>Desde<input defaultValue={desde} name="desde" required type="date" /></label>
        <label>Hasta (opcional)<input defaultValue={hasta} name="hasta" type="date" /></label>
        <button className="boton-secundario" type="submit">Consultar</button>
      </form>
      {errorDeConsulta && <p className="mensaje-operacion error" role="alert">{errorDeConsulta}</p>}
      {!errorDeConsulta && (vigentes.length
        ? <div className="panel-tabla"><table><thead><tr><th>Colaborador</th><th>DNI</th><th>Grupo</th><th>Ingreso</th><th>Cese confirmado</th></tr></thead><tbody>{vigentes.map((persona) => <tr key={persona.dni}><td>{persona.nombre}</td><td>{persona.dni}</td><td>{persona.grupo}</td><td>{persona.relaciones.map((relacion) => <span className="linea-de-relacion" key={relacion.relacionId}>{formatearFechaDeRelacion(relacion.ingreso)}</span>)}</td><td>{persona.relaciones.map((relacion) => <span className="linea-de-relacion" key={relacion.relacionId}>{relacion.cese ? formatearFechaDeRelacion(relacion.cese) : "Sin cese"}</span>)}</td></tr>)}</tbody></table></div>
        : <section className="estado-vacio"><h3>Nadie tiene una relación laboral vigente {hasta ? "en ese rango" : "en esa fecha"}</h3><p>Una relación cuenta cuando su ingreso está confirmado. Confirme los ingresos pendientes o cambie la fecha de consulta.</p></section>)}
    </section>
  </main>;
}

function estadoDe(relacion: RelacionConPersona, hoy: string): string {
  const [vigencia] = vigenciasConfirmadas([relacion]);
  if (!vigencia) return "Ingreso por confirmar";
  if (vigencia.ingreso > hoy) return `Ingresa el ${formatearFechaDeRelacion(vigencia.ingreso)}`;
  if (estaVigenteEn([vigencia], hoy)) return "Vigente";
  return "Cesada";
}

function acciones(relacion: RelacionConPersona) {
  if (!relacion.ingresoConfirmado) return <>
    <FormularioDeFecha campo="ingreso" etiquetaDelBoton="Corregir ingreso" nombreDeLaPersona={relacion.nombre} relacionId={relacion.id} valorInicial={relacion.ingreso} />
    <ConfirmacionDeFecha campo="ingreso" descripcion={`Se confirma que ${relacion.nombre} ingresó el ${formatearFechaDeRelacion(relacion.ingreso)}. Desde esa fecha el gerente puede publicar sus horarios y la persona entra en Pagos. Después no podrá corregirse.`} etiqueta="Confirmar ingreso" relacionId={relacion.id} titulo={`¿Confirmar el ingreso de ${relacion.nombre}?`} />
  </>;
  if (relacion.cese === null) return <FormularioDeFecha campo="cese" etiquetaDelBoton="Registrar cese" minimo={relacion.ingreso} nombreDeLaPersona={relacion.nombre} relacionId={relacion.id} />;
  if (!relacion.ceseConfirmado) return <>
    <FormularioDeFecha campo="cese" etiquetaDelBoton="Corregir cese" minimo={relacion.ingreso} nombreDeLaPersona={relacion.nombre} relacionId={relacion.id} valorInicial={relacion.cese} />
    <ConfirmacionDeFecha campo="cese" descripcion={`Se confirma que la relación laboral de ${relacion.nombre} termina el ${formatearFechaDeRelacion(relacion.cese)}. El gerente no podrá publicar horarios después de esa fecha. Después no podrá corregirse.`} etiqueta="Confirmar cese" relacionId={relacion.id} titulo={`¿Confirmar el cese de ${relacion.nombre}?`} />
  </>;
  return <span className="pista-configuracion">Sin acciones pendientes</span>;
}
