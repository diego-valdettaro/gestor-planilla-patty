import { redirect } from "next/navigation";

import { puedeGestionarPagos } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";

import { SinPermisoDePagos } from "./sin-permiso";

export const dynamic = "force-dynamic";

// Hoy Pagos solo tiene Condiciones laborales; la lista de meses de pago (4.1) reemplazará esta redirección.
export default async function PaginaDePagos() {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeGestionarPagos(actor)) return <SinPermisoDePagos />;
  redirect("/pagos/condiciones-laborales");
}
