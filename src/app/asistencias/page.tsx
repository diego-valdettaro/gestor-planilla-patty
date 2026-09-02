import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { repositorioDeImportaciones } from "@/importaciones/servicio";
import { repositorioDeTurnos } from "@/turnos/servicio";

import { ajustarAsistencia, confirmarAsistencia, importarAsistencia } from "./actions";

export const dynamic = "force-dynamic";

export default async function PaginaDeAsistencias() {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") {
    return <main className="centrado"><p>No tiene permiso para importar asistencias.</p></main>;
  }
  const [asistencias, incidencias, marcasSinTurno, sedes, confirmadas] = await Promise.all([
    repositorioDeImportaciones.listarAsistenciasPendientes(),
    repositorioDeImportaciones.listarIncidencias(),
    repositorioDeImportaciones.listarMarcasSinTurno(),
    repositorioDeTurnos.listarSedesConColaboradoresActivos(),
    repositorioDeImportaciones.listarAsistenciasConfirmadas(),
  ]);
  return (
    <main className="contenido">
      <header className="encabezado"><div><p className="eyebrow">Administración y Finanzas</p><h1>Cargar asistencia</h1></div></header>
      <form action={importarAsistencia} className="filtros">
        <label>Sede
          <select name="sede" required>
            {sedes.map((sede) => <option key={sede} value={sede}>{sede}</option>)}
          </select>
        </label>
        <label>Semana<input name="semana" required type="date" /></label>
        <label>Archivo del huellero<input accept=".xlsx,.xls,.csv" name="archivo" required type="file" /></label>
        <button type="submit">Importar</button>
      </form>
      <p>El archivo debe incluir las columnas ID de huellero, fecha y marca (o fecha y hora).</p>
      <section>
        <h2>Asistencias pendientes de revisión</h2>
        {asistencias.length ? <ul>{asistencias.map((asistencia) => <li key={`${asistencia.idHuellero}-${asistencia.fecha}`}>
          {asistencia.idHuellero} · {asistencia.fecha} · entrada propuesta: {asistencia.entradaPropuesta ?? "sin propuesta"} · salida propuesta: {asistencia.salidaPropuesta ?? "sin propuesta"}
          {asistencia.entradaPropuesta && asistencia.salidaPropuesta ? <form action={confirmarAsistencia} className="filtros">
            <input name="idHuellero" type="hidden" value={asistencia.idHuellero} />
            <input name="fecha" type="hidden" value={asistencia.fecha} />
            <label>Entrada real<input name="entradaReal" required defaultValue={asistencia.entradaPropuesta} /></label>
            <label>Salida real<input name="salidaReal" required defaultValue={asistencia.salidaPropuesta} /></label>
            <button type="submit">Confirmar asistencia</button>
          </form> : <p>Faltan marcas para confirmar esta asistencia.</p>}
        </li>)}</ul> : <p>No hay asistencias pendientes.</p>}
      </section>
      <section>
        <h2>Asistencias confirmadas</h2>
        {confirmadas.length ? <ul>{confirmadas.map((asistencia) => <li key={`${asistencia.idHuellero}-${asistencia.fecha}`}>
          <p>{asistencia.idHuellero} - {asistencia.fecha}</p>
          <form action={ajustarAsistencia} className="filtros">
            <input name="idHuellero" type="hidden" value={asistencia.idHuellero} />
            <input name="fecha" type="hidden" value={asistencia.fecha} />
            <label>Entrada real<input name="entradaReal" required defaultValue={asistencia.entradaReal} /></label>
            <label>Salida real<input name="salidaReal" required defaultValue={asistencia.salidaReal} /></label>
            <label>Motivo<input name="motivo" required /></label>
            <button type="submit">Guardar ajuste</button>
          </form>
        </li>)}</ul> : <p>No hay asistencias confirmadas.</p>}
      </section>
      <section>
        <h2>Marcas sin turno publicado</h2>
        {marcasSinTurno.length ? <ul>{marcasSinTurno.map((marca) => <li key={`${marca.importacionId}-${marca.idHuellero}-${marca.fecha}`}>
          {marca.idHuellero} · {marca.fecha} · entrada propuesta: {marca.entradaPropuesta ?? "sin propuesta"} · salida propuesta: {marca.salidaPropuesta ?? "sin propuesta"}
        </li>)}</ul> : <p>No hay marcas sin turno publicado.</p>}
      </section>
      <section>
        <h2>Incidencias de importación</h2>
        {incidencias.length ? <ul>{incidencias.map((incidencia, indice) => <li key={`${incidencia.idHuellero}-${incidencia.fecha}-${indice}`}>
          {incidencia.idHuellero} · {incidencia.fecha} · {incidencia.motivo}
        </li>)}</ul> : <p>No hay incidencias de importación.</p>}
      </section>
    </main>
  );
}
