import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { repositorioDePeriodos } from "@/periodos/servicio";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ periodoId: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor || (actor.rol !== "administracion" && actor.rol !== "finanzas")) return new Response("No autorizado", { status: 403 });
  const { periodoId } = await params;
  const resumen = await repositorioDePeriodos.listarResumen({ periodoId });
  const datos = resumen.filas.map((fila) => ({
    Grupo: fila.grupo,
    Colaborador: fila.nombre,
    "ID huellero": fila.idHuellero,
    "Jornadas trabajadas": fila.jornadasTrabajadas,
    "Horas trabajadas (decimal)": fila.minutosTrabajados / 60,
    Faltas: fila.noAsistencias.falta,
    Descansos: fila.noAsistencias.descanso,
    Feriados: fila.noAsistencias.feriado,
    Vacaciones: fila.noAsistencias.vacaciones,
    Permisos: fila.noAsistencias.permiso,
    Suspensiones: fila.noAsistencias.suspension,
    Tardanzas: fila.cantidadTardanzas,
    "Horas penalizadas (decimal)": fila.minutosPenalizados / 60,
    "Extras 25% aprobadas (horas decimales)": fila.horasExtra.aprobada.minutosAl25 / 60,
    "Extras 35% aprobadas (horas decimales)": fila.horasExtra.aprobada.minutosAl35 / 60,
  }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(datos), "Resumen");
  const periodo = await repositorioDePeriodos.buscar(periodoId);
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet([{
    "Período": `${periodo?.inicio} a ${periodo?.fin}`,
    "Generado por": actor.id,
    "Generado en": new Date().toISOString(),
    "Horas extra": "Solo aprobadas",
  }]), "Auditoría");
  const contenido = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });
  return new Response(contenido, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="resumen-${periodo?.inicio ?? periodoId}.xlsx"`,
  } });
}
