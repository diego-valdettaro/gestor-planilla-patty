import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeGestionarPagos } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { formatearSoles } from "@/condiciones-laborales/valores";
import { formatearMes } from "@/fuentes-externas/valores";
import { totalDeHorasExtraCentimos, totalDeTrabajoEnDescansoOFeriadoCentimos, type LineaDeBorrador } from "@/pagos/calcular-borrador";
import { buscarConcepto } from "@/conceptos-de-preliquidacion/catalogo";
import { prepararBorrador } from "@/pagos/preparar-borrador";
import { fuentesDelBorrador } from "@/pagos/servicio";

import { NavegacionDePagos } from "../../navegacion-de-pagos";
import { BloqueoDePagos } from "../../bloqueo";
import { SinPermisoDePagos } from "../../sin-permiso";

export const dynamic = "force-dynamic";

const CLASE_DE_DIA_ESPECIAL = { descanso_semanal: "descanso semanal asignado", feriado: "feriado", primero_de_mayo: "1 de mayo" } as const;

function nombreDelConcepto(linea: LineaDeBorrador): string {
  if (linea.concepto === "trabajo_en_descanso_o_feriado") return buscarConcepto(linea.concepto)?.nombre ?? linea.concepto;
  return linea.concepto === "sueldo_basico" ? "Sueldo básico" : linea.concepto === "horas_extra_25" ? "Hora extra 25 %" : "Hora extra 35 %";
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
  const { relacion, lineas, bloqueos } = persona;
  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina"><div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>{relacion.nombre}</h1><p>DNI {relacion.dni} · {relacion.grupo} · Relación laboral desde {relacion.ingreso}{relacion.ceseConfirmado ? ` hasta ${relacion.cese}` : ""}</p><span className="insignia advertencia">{bloqueos.length ? "Bloqueada" : "Pendiente"}</span><p><Link href={`/pagos/${mes}`}>Volver al mes de pago</Link></p></div></header>
    <NavegacionDePagos actual="meses" />
    {bloqueos.length > 0 && <section className="tarjeta panel"><h2>Bloqueos de la persona</h2>{bloqueos.map((bloqueo, i) => <BloqueoDePagos key={i} mensaje={bloqueo} mes={mes} relacionId={relacion.id} />)}</section>}
    <section className="tarjeta panel"><h2>Resumen</h2><p>Mes de pago {formatearMes(mes)}. Corte de incidencias {borrador.corte.inicio} al {borrador.corte.fin}.</p><p>Sueldo calculado: {formatearSoles(persona.sueldoCalculadoCentimos)}. Neto: Incompleto. Los demás conceptos, bases y aportes están pendientes de valoración.</p><p>Horas extra calculadas: {formatearSoles(totalDeHorasExtraCentimos(lineas))}.</p><p>Trabajo en descanso o feriado calculado: {formatearSoles(totalDeTrabajoEnDescansoOFeriadoCentimos(lineas))}.</p></section>
    <section className="tarjeta panel"><header className="panel-cabecera"><h2>Conceptos</h2></header>{lineas.length ? <><p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p><div className="panel-tabla primera-columna-fija" role="region" aria-label="Conceptos de la persona" tabIndex={0}><table><thead><tr><th>Concepto</th><th>Cantidad</th><th>Mes de devengue</th><th>Mes de pago</th><th>Corte de incidencias</th><th>Origen</th><th className="numerico">Importe</th></tr></thead><tbody>{lineas.map((linea, i) => <tr key={i}><th scope="row">{nombreDelConcepto(linea)}{linea.concepto === "trabajo_en_descanso_o_feriado" && linea.regularizacion && <small className="linea-de-relacion">Regularización de descanso sustitutorio no otorgado</small>}<details><summary>Ver base</summary>{linea.concepto === "sueldo_basico" ? <p>{linea.dias} días del {linea.desde} al {linea.hasta}, sueldo mensual {formatearSoles(linea.sueldoMensualCentimos)}, divisor 30. Redondeo a céntimos por línea.</p> : linea.concepto === "trabajo_en_descanso_o_feriado" ? <p>{linea.minutos} minutos trabajados el {linea.fecha} en {CLASE_DE_DIA_ESPECIAL[linea.clase]} sin descanso sustitutorio otorgado, remuneración ordinaria computable {formatearSoles(linea.remuneracionOrdinariaComputableCentimos)}, divisor 30 y jornada pactada de {linea.jornadaOrdinariaDiariaMinutos} minutos, sobretasa {linea.sobretasaEnCentesimasDePunto / 100} %. Redondeo a céntimos por línea. Regla pendiente de validación con Finanzas o el contador. <Link href={`/asistencias?vista=mensual&grupo=${encodeURIComponent(linea.grupo)}&fecha=${linea.fecha}&colaborador=${relacion.dni}`}>Ver jornada</Link>.</p> : <p>{linea.minutos} minutos el {linea.fecha}, remuneración ordinaria computable {formatearSoles(linea.remuneracionOrdinariaComputableCentimos)}, divisor 30 y jornada pactada de {linea.jornadaOrdinariaDiariaMinutos} minutos, sobretasa {linea.sobretasaEnCentesimasDePunto / 100} %. Redondeo a céntimos por línea. <Link href={`/asistencias?vista=mensual&grupo=${encodeURIComponent(linea.grupo)}&fecha=${linea.fecha}&colaborador=${relacion.dni}`}>Ver jornada</Link>.</p>}</details></th><td>{linea.concepto === "sueldo_basico" ? `${linea.dias} días` : `${linea.minutos} min`}</td><td>{formatearMes(linea.mesDeDevengue)}{linea.mesDeDevengue !== mes && <small className="linea-de-relacion">Devengue anterior</small>}</td><td>{formatearMes(linea.mesDePago)}</td><td>{linea.corte.inicio} al {linea.corte.fin}</td><td>{linea.origen}</td><td className="numerico">{formatearSoles(linea.importeCentimos)}</td></tr>)}</tbody></table></div></> : <section className="estado-vacio"><h3>Sin conceptos calculables en este mes de pago</h3><p>Revise la relación laboral y sus condiciones vigentes.</p></section>}</section>
    <section className="tarjeta panel"><h2>Bases y aportes</h2><p>Pendiente. La valoración de incidencias, bases pensionaria, de EsSalud y de quinta categoría, y los aportes aún no produce un neto definitivo.</p></section>
  </main>;
}
