import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeGestionarPagos } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { buscarConcepto } from "@/conceptos-de-preliquidacion/catalogo";
import { formatearSoles } from "@/condiciones-laborales/valores";
import { formatearMes } from "@/fuentes-externas/valores";
import { totalDeHorasExtraCentimos, type DescansoVacacionalDelBorrador, type LineaDeBorrador } from "@/pagos/calcular-borrador";
import { prepararBorrador } from "@/pagos/preparar-borrador";
import { fuentesDelBorrador } from "@/pagos/servicio";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";

import { NavegacionDePagos } from "../../navegacion-de-pagos";
import { BloqueoDePagos } from "../../bloqueo";
import { SinPermisoDePagos } from "../../sin-permiso";

export const dynamic = "force-dynamic";

/** El cálculo de cada línea, a la vista: valor diario o por hora, fechas o minutos y la regla aplicada. */
function baseDeLinea(linea: LineaDeBorrador, dni: string) {
  switch (linea.concepto) {
    case "sueldo_basico":
      return <p>{linea.dias} días del {linea.desde} al {linea.hasta}, sueldo mensual {formatearSoles(linea.sueldoMensualCentimos)}, divisor 30. Redondeo a céntimos por línea.</p>;
    case "remuneracion_vacacional":
      return <p>{linea.dias} {linea.dias === 1 ? "día" : "días"} del {linea.desde} al {linea.hasta} dentro del descanso del {formatearFechaDeRelacion(linea.inicioDelDescanso)} al {formatearFechaDeRelacion(linea.finDelDescanso)} ({linea.diasCalendario} {linea.diasCalendario === 1 ? "día calendario" : "días calendario"} de vacaciones aprobadas en Asistencia), base vacacional {formatearSoles(linea.baseSueldoCentimos)} vigente al inicio del descanso, divisor 30. Reemplaza el sueldo básico de esos días: no suma un sueldo adicional ni por el día 31. Redondeo a céntimos por línea.</p>;
    case "ajuste_por_variacion_de_sueldo_en_vacaciones":
      return <p>Diferencia por {linea.dias} {linea.dias === 1 ? "día" : "días"} del {linea.desde} al {linea.hasta} entre el sueldo vigente {formatearSoles(linea.sueldoVigenteCentimos)} y la base vacacional {formatearSoles(linea.baseSueldoCentimos)} del descanso del {formatearFechaDeRelacion(linea.inicioDelDescanso)} al {formatearFechaDeRelacion(linea.finDelDescanso)}. La app la calcula; no la registra Finanzas.</p>;
    default:
      return <p>{linea.minutos} minutos el {linea.fecha}, remuneración ordinaria computable {formatearSoles(linea.remuneracionOrdinariaComputableCentimos)}, divisor 30 y jornada pactada de {linea.jornadaOrdinariaDiariaMinutos} minutos, sobretasa {linea.sobretasaEnCentesimasDePunto / 100} %. Redondeo a céntimos por línea. <Link href={`/asistencias?vista=mensual&grupo=${encodeURIComponent(linea.grupo)}&fecha=${linea.fecha}&colaborador=${dni}`}>Ver jornada</Link>.</p>;
  }
}

function VacacionesDelMes({ descansos, mes, provisionales }: { descansos: DescansoVacacionalDelBorrador[]; mes: string; provisionales: boolean }) {
  return <section className="tarjeta panel" aria-labelledby="titulo-vacaciones"><header className="panel-cabecera"><div><h2 id="titulo-vacaciones">Vacaciones del mes</h2><p>Los días salen de las vacaciones que el gerente aprobó en Asistencia. El saldo a entregar es la remuneración vacacional del mes menos los abonos anticipados asignados a ese mes; no es el saldo ni la adquisición del derecho vacacional.</p></div></header>
    {provisionales && <p className="mensaje-operacion" role="status">Incluye vacaciones de períodos abiertos: pueden cambiar hasta que el período se cierre.</p>}
    {descansos.map((descanso) => <div key={descanso.inicio}>
      <h3>Descanso del {formatearFechaDeRelacion(descanso.inicio)} al {formatearFechaDeRelacion(descanso.fin)} ({descanso.dias} {descanso.dias === 1 ? "día" : "días"})</h3>
      <p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p>
      <div className="panel-tabla primera-columna-fija" role="region" aria-label={`Vacaciones del descanso del ${formatearFechaDeRelacion(descanso.inicio)}`} tabIndex={0}><table><thead><tr><th>Mes</th><th className="numerico">Días de descanso vacacional del mes</th><th className="numerico">Remuneración vacacional</th><th className="numerico">Abonos anticipados asignados</th><th className="numerico">Saldo a entregar</th></tr></thead><tbody>
        {descanso.meses.map((fila) => <tr key={fila.mes}><th scope="row">{formatearMes(fila.mes)}<small className="linea-de-relacion">{fila.mes === mes ? "Mes de pago" : fila.mes < mes ? "Mes de origen" : "Mes de destino"}</small></th><td className="numerico">{fila.diasDeDescanso} {fila.diasDeDescanso === 1 ? "día" : "días"}{fila.diasConvencionales !== fila.diasDeDescanso && <small className="linea-de-relacion">{fila.diasConvencionales} {fila.diasConvencionales === 1 ? "día" : "días"} con divisor 30</small>}</td><td className="numerico">{fila.remuneracionCentimos === null ? "Pendiente" : formatearSoles(fila.remuneracionCentimos)}</td><td className="numerico">{formatearSoles(fila.abonosAsignadosCentimos)}</td><td className="numerico">{fila.saldoCentimos === null ? "Pendiente" : formatearSoles(fila.saldoCentimos)}</td></tr>)}
      </tbody></table></div>
      {descanso.baseSueldoCentimos === null && <p>Falta el sueldo vigente al inicio del descanso para valorar la remuneración vacacional.</p>}
      {descanso.abonos.length ? <ul>{descanso.abonos.map((abono) => <li key={abono.id}>Abono del {formatearFechaDeRelacion(abono.fechaDelAbono)} por {formatearSoles(abono.importeCentimos)}, registrado en el mes de aplicación {formatearMes(abono.mesDeAplicacion)}: {abono.asignaciones.map(({ mes: asignado, centimos }) => `${formatearSoles(centimos)} a ${formatearMes(asignado)}`).join(" y ")}.</li>)}</ul> : <p>Sin abono anticipado registrado para este descanso.</p>}
    </div>)}
  </section>;
}

export default async function PaginaDePersona({ params }: { params: Promise<{ mes: string; dni: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeGestionarPagos(actor)) return <SinPermisoDePagos />;
  const { mes, dni } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes) || !/^\d{8}$/.test(dni)) notFound();
  const borrador = await prepararBorrador(fuentesDelBorrador, mes);
  const persona = borrador.personas.find(({ relacion }) => relacion.dni === dni);
  if (!persona) notFound();
  const { relacion, lineas, bloqueos, vacaciones } = persona;
  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina"><div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>{relacion.nombre}</h1><p>DNI {relacion.dni} · {relacion.grupo} · Relación laboral desde {relacion.ingreso}{relacion.ceseConfirmado ? ` hasta ${relacion.cese}` : ""}</p><span className="insignia advertencia">{bloqueos.length ? "Bloqueada" : "Pendiente"}</span><p><Link href={`/pagos/${mes}`}>Volver al mes de pago</Link></p></div></header>
    <NavegacionDePagos actual="meses" />
    {bloqueos.length > 0 && <section className="tarjeta panel"><h2>Bloqueos de la persona</h2>{bloqueos.map((bloqueo, i) => <BloqueoDePagos key={i} mensaje={bloqueo} mes={mes} relacionId={relacion.id} />)}</section>}
    <section className="tarjeta panel"><h2>Resumen</h2><p>Mes de pago {formatearMes(mes)}. Corte de incidencias {borrador.corte.inicio} al {borrador.corte.fin}.</p><p>Sueldo calculado (sueldo básico más remuneración vacacional): {formatearSoles(persona.sueldoCalculadoCentimos)}. Neto: Incompleto. Los demás conceptos, bases y aportes están pendientes de valoración.</p><p>Horas extra calculadas: {formatearSoles(totalDeHorasExtraCentimos(lineas))}.</p></section>
    <section className="tarjeta panel"><header className="panel-cabecera"><h2>Conceptos</h2></header>{lineas.length ? <><p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p><div className="panel-tabla primera-columna-fija" role="region" aria-label="Conceptos de la persona" tabIndex={0}><table><thead><tr><th>Concepto</th><th>Cantidad</th><th>Mes de devengue</th><th>Mes de pago</th><th>Corte de incidencias</th><th>Origen</th><th className="numerico">Importe</th></tr></thead><tbody>{lineas.map((linea, i) => <tr key={i}><th scope="row">{buscarConcepto(linea.concepto)?.nombre ?? linea.concepto}<details><summary>Ver base</summary>{baseDeLinea(linea, relacion.dni)}</details></th><td>{linea.concepto === "horas_extra_25" || linea.concepto === "horas_extra_35" ? `${linea.minutos} min` : `${linea.dias} días`}</td><td>{formatearMes(linea.mesDeDevengue)}{linea.mesDeDevengue !== mes && <small className="linea-de-relacion">Devengue anterior</small>}</td><td>{formatearMes(linea.mesDePago)}</td><td>{linea.corte.inicio} al {linea.corte.fin}</td><td>{linea.origen}</td><td className="numerico">{formatearSoles(linea.importeCentimos)}</td></tr>)}</tbody></table></div></> : <section className="estado-vacio"><h3>Sin conceptos calculables en este mes de pago</h3><p>Revise la relación laboral y sus condiciones vigentes.</p></section>}</section>
    <section className="tarjeta panel"><h2>Bases y aportes</h2><p>Pendiente. La valoración de incidencias, bases pensionaria, de EsSalud y de quinta categoría, y los aportes aún no produce un neto definitivo.</p></section>
    {vacaciones.length > 0 && <VacacionesDelMes descansos={vacaciones} mes={mes} provisionales={borrador.vacacionesProvisionales} />}
  </main>;
}
