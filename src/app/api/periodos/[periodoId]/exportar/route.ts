import { NextRequest } from "next/server";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { repositorioDePeriodos } from "@/periodos/servicio";
import * as XLSX from "xlsx";
export async function GET(request: NextRequest, { params }: { params: Promise<{ periodoId: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined); if (!actor || (actor.rol !== "administracion" && actor.rol !== "finanzas")) return new Response("No autorizado", { status: 403 });
  const { periodoId } = await params; const query = request.nextUrl.searchParams;
  const filas = await repositorioDePeriodos.listarResumen({ periodoId, sede: query.get("sede") || undefined, idHuellero: query.get("idHuellero") || undefined });
  const datos = filas.map((fila) => ({ Colaborador: fila.nombre, "ID huellero": fila.idHuellero, Sede: fila.sede, "Horas trabajadas": fila.minutosTrabajados / 60, Tardanzas: fila.cantidadTardanzas, "Saldo penalizado": fila.minutosPenalizados / 60, "Extras 25% aprobadas": fila.minutosAl25 / 60, "Extras 35% aprobadas": fila.minutosAl35 / 60 }));
  const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(datos), "Resumen");
  const periodo = await repositorioDePeriodos.buscar(periodoId); XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet([{ "Período": `${periodo?.inicio} a ${periodo?.fin}`, "Generado por": actor.id, "Generado en": new Date().toISOString(), "Horas extra": "Solo aprobadas" }]), "Auditoría");
  const contenido = XLSX.write(libro, { type: "buffer", bookType: "xlsx" }); return new Response(contenido, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="resumen-${periodo?.inicio ?? periodoId}.xlsx"` } });
}
