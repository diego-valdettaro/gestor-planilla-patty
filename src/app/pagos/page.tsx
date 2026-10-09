import Link from "next/link";
import { redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeGestionarPagos } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { fechaDeHoyEnLima } from "@/condiciones-laborales/vigencia";
import { formatearMes } from "@/fuentes-externas/valores";
import { listarMesesDePago, prepararBorrador } from "@/pagos/preparar-borrador";
import { fuentesDelBorrador } from "@/pagos/servicio";

import { NavegacionDePagos } from "./navegacion-de-pagos";
import { SinPermisoDePagos } from "./sin-permiso";

export const dynamic = "force-dynamic";

export default async function PaginaDePagos() {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeGestionarPagos(actor)) return <SinPermisoDePagos />;
  const meses = await listarMesesDePago(fuentesDelBorrador, fechaDeHoyEnLima());
  const borradores = (await Promise.all(meses.map((mes) => prepararBorrador(fuentesDelBorrador, mes))))
    .filter((borrador) => borrador.personas.length > 0);
  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina"><div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>Pagos</h1><p>Revise la preliquidación de cada mes de pago.</p></div></header>
    <NavegacionDePagos actual="meses" />
    {borradores.length ? <section className="tarjeta panel"><header className="panel-cabecera"><h2>Meses de pago</h2></header>
      <p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p>
      <div className="panel-tabla primera-columna-fija" role="region" aria-label="Meses de pago" tabIndex={0}><table><thead><tr><th>Mes de pago</th><th>Corte de incidencias</th><th>Estado</th><th>Bloqueos</th><th className="numerico">Personas (n.º)</th><th className="numerico">Neto total</th></tr></thead><tbody>
        {borradores.map((borrador) => <tr key={borrador.mesDePago}><th scope="row"><Link href={`/pagos/${borrador.mesDePago}`}>{formatearMes(borrador.mesDePago)}</Link></th><td>{borrador.corte.inicio} al {borrador.corte.fin}</td><td><span className="insignia advertencia">Borrador</span></td><td>{borrador.bloqueosDelMes.length + borrador.personas.reduce((suma, persona) => suma + persona.bloqueos.length, 0)} bloqueos</td><td className="numerico">{borrador.personas.length}</td><td className="numerico">Incompleto</td></tr>)}
      </tbody></table></div></section> : <section className="estado-vacio"><h2>Todavía no hay meses de pago</h2><p>Un mes aparece cuando existe al menos una relación laboral confirmada por Recursos Humanos dentro de su corte.</p></section>}
  </main>;
}
