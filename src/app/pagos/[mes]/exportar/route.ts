import { NextRequest } from "next/server";

import { puedeGestionarPagos } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { exportarPreliquidacion } from "@/pagos/exportar-mes";
import { dependenciasDeFinalizacion } from "@/pagos/servicio";

// El número de versión es un entero de PostgreSQL (`versiones_de_pago.numero`): uno mayor no existe y no debe llegar a la consulta.
const NUMERO_MAXIMO_DE_VERSION = 2_147_483_647;

/** Descarga la preliquidación del mes: el borrador de hoy o, con `?version=N`, esa versión finalizada (interacción 4.8, D11). Solo Finanzas. */
export async function GET(solicitud: NextRequest, { params }: { params: Promise<{ mes: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor || !puedeGestionarPagos(actor)) return new Response("No autorizado", { status: 403 });
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return new Response("El mes de pago no es válido.", { status: 400 });
  const pedida = solicitud.nextUrl.searchParams.get("version");
  if (pedida !== null && (!/^[1-9]\d*$/.test(pedida) || Number(pedida) > NUMERO_MAXIMO_DE_VERSION)) return new Response("La versión no es válida.", { status: 400 });
  const resultado = await exportarPreliquidacion(dependenciasDeFinalizacion, actor, { mes, version: pedida === null ? undefined : Number(pedida) })
    .catch(() => undefined);
  if (!resultado) return new Response("No se pudo generar el archivo", { status: 500 });
  if (resultado.estado === "sin_version") return new Response("La versión no existe en ese mes.", { status: 404 });
  if (resultado.estado === "sin_personas") return new Response(resultado.mensaje, { status: 422 });
  return new Response(Buffer.from(resultado.archivo.contenido), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${resultado.archivo.nombre}"`,
    "Cache-Control": "no-store",
  } });
}
