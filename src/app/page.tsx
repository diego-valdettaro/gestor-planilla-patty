import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";

export default async function Inicio(): Promise<never> {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  redirect(actor.rol === "finanzas" ? "/asistencias" : "/turnos");
}
