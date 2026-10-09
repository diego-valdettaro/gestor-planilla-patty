import { NextRequest } from "next/server";

import { puedeGestionarPagos } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearPlantillaDeFuente } from "@/fuentes-externas/parsear-archivo-de-fuente";
import { buscarTipoDeFuente } from "@/fuentes-externas/tipos-de-fuente";

/** Plantilla normalizada del archivo fuente de un tipo de fuente: solo encabezados e instrucciones, sin datos (D8). */
export async function GET(solicitud: NextRequest) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor || !puedeGestionarPagos(actor)) return new Response("No autorizado", { status: 403 });
  const tipo = buscarTipoDeFuente(solicitud.nextUrl.searchParams.get("tipo") ?? "");
  if (!tipo || tipo.flujoPropio) return new Response("Elija un tipo de fuente importable de la lista.", { status: 400 });
  return new Response(new Uint8Array(crearPlantillaDeFuente(tipo)), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="plantilla-${tipo.codigo}.xlsx"`,
    "Cache-Control": "no-store",
  } });
}
