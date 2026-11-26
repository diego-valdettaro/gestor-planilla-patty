import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as XLSX from "xlsx";

import * as schema from "@/db/schema";
import { RepositorioPostgresDeImportaciones } from "@/importaciones/repositorio-postgres";
import { confirmarAsistencia, registrarEstadoManual } from "@/asistencias/confirmar-y-ajustar-asistencia";
import { RepositorioPostgresDeAsistencias } from "@/asistencias/repositorio-postgres";
import type { Actor } from "@/autenticacion/permisos";

// Datos ficticios propios. 2019 evita las relaciones de demo (desde 2020) y los períodos dinámicos del seed.
export const GRUPO_185 = "QA185 Tienda";
export const OTRO_GRUPO_185 = "QA185 Otro grupo";
export const SEDE_185 = "QA185 Sede";
export const OTRA_SEDE_185 = "QA185 Otra sede";
export const PERSONAS_185 = { ana: "18500001", beto: "18500002" };
export const NOMBRES_185 = { ana: "Ana QA185", beto: "Beto QA185" };
export const SEMANA_185 = "2019-09-23";
export const CORTE_185 = { inicio: "2019-09-26", fin: "2019-10-25" };
export const FECHAS_185 = { anterior: "2019-09-23", cerrada: "2019-09-24", manual: "2019-09-25", registrar: "2019-09-26", ajustar: "2019-09-27", incompleta: "2019-09-28", sinPlan: "2019-09-29" };

export function urlEscenario185(): string {
  const indice = process.argv.indexOf("--url");
  const raw = indice >= 0 ? process.argv[indice + 1] : process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("Falta TEST_DATABASE_URL.");
  const url = new URL(raw);
  if (url.hostname !== "127.0.0.1" || !["/qa185_ficticia", "/planilla_rev_185", "/planilla_test"].includes(url.pathname)
    || process.env.DATABASE_URL !== raw || process.env.TEST_DATABASE_URL !== raw) {
    throw new Error("El escenario #185 requiere base exclusiva permitida en 127.0.0.1 y DATABASE_URL igual a TEST_DATABASE_URL.");
  }
  return raw;
}

export async function limpiarEscenario185(pool: Pool): Promise<void> {
  const personas = Object.values(PERSONAS_185);
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    for (const tabla of ["reemplazos_de_asistencia_importada", "ajustes_de_asistencia", "estados_manuales", "tardanzas", "horas_extra"]) {
      await cliente.query(`DELETE FROM ${tabla} WHERE asistencia_id IN (SELECT id FROM asistencias_esperadas WHERE dni = ANY($1::text[]))`, [personas]);
    }
    await cliente.query("DELETE FROM marcas_crudas WHERE dni = ANY($1::text[])", [personas]);
    await cliente.query("DELETE FROM incidencias_de_importacion WHERE importacion_id IN (SELECT id FROM importaciones_semanales WHERE archivo_nombre = 'QA185-original.xlsx')");
    await cliente.query("DELETE FROM importaciones_semanales WHERE archivo_nombre = 'QA185-original.xlsx'");
    await cliente.query("DELETE FROM asistencias_esperadas WHERE dni = ANY($1::text[])", [personas]);
    await cliente.query("DELETE FROM historial_turnos_publicados WHERE turno_publicado_id IN (SELECT id FROM turnos_publicados WHERE dni = ANY($1::text[]))", [personas]);
    await cliente.query("DELETE FROM turnos_publicados WHERE dni = ANY($1::text[])", [personas]);
    await cliente.query("DELETE FROM relaciones_laborales WHERE dni = ANY($1::text[])", [personas]);
    await cliente.query("DELETE FROM colaboradores WHERE dni = ANY($1::text[])", [personas]);
    // Solo los dos intervalos exclusivos reservados al escenario, nunca períodos de demostración.
    for (const tabla of ["aprobaciones_de_asistencia", "revisiones_periodos_planilla", "auditoria_periodos_planilla"]) {
      await cliente.query(`DELETE FROM ${tabla} WHERE periodo_id IN (SELECT id FROM periodos_planilla WHERE (inicio=$1::date AND fin=$2::date) OR (inicio=$3::date AND fin=$3::date))`, [CORTE_185.inicio, CORTE_185.fin, FECHAS_185.cerrada]);
    }
    await cliente.query("DELETE FROM periodos_planilla WHERE (inicio=$1::date AND fin=$2::date) OR (inicio=$3::date AND fin=$3::date)", [CORTE_185.inicio, CORTE_185.fin, FECHAS_185.cerrada]);
    await cliente.query("DELETE FROM sedes WHERE nombre = ANY($1::text[])", [[SEDE_185, OTRA_SEDE_185]]);
    await cliente.query("DELETE FROM gerentes_de_grupo WHERE grupo = ANY($1::text[])", [[GRUPO_185, OTRO_GRUPO_185]]);
    await cliente.query("DELETE FROM politicas_tardanzas_grupo WHERE grupo = ANY($1::text[])", [[GRUPO_185, OTRO_GRUPO_185]]);
    await cliente.query("DELETE FROM grupos WHERE nombre = ANY($1::text[])", [[GRUPO_185, OTRO_GRUPO_185]]);
    await cliente.query("COMMIT");
  } catch (error) { await cliente.query("ROLLBACK"); throw error; }
  finally { cliente.release(); }
}

export async function crearEscenario185(pool: Pool): Promise<void> {
  const cuenta = await pool.query<{ id: string }>("SELECT id FROM cuentas_locales WHERE nombre_usuario='gerente-tiendas'");
  if (cuenta.rowCount !== 1) throw new Error("Falta el seed de cuentas de prueba.");
  const responsableId = cuenta.rows[0].id;
  const solapados = await pool.query("SELECT id FROM periodos_planilla WHERE inicio <= $2::date AND fin >= $1::date", [SEMANA_185, CORTE_185.fin]);
  if (solapados.rowCount) throw new Error("El escenario #185 necesita sus fechas de 2019 sin períodos previos. Retire solo su fixture antes de reponerlo.");
  await pool.query("INSERT INTO grupos (nombre) VALUES ($1),($2)", [GRUPO_185, OTRO_GRUPO_185]);
  await pool.query("INSERT INTO gerentes_de_grupo (grupo,cuenta_id) VALUES ($1,$3),($2,$3)", [GRUPO_185, OTRO_GRUPO_185, responsableId]);
  await pool.query("INSERT INTO sedes (nombre,grupo) VALUES ($1,$2),($3,$4)", [SEDE_185, GRUPO_185, OTRA_SEDE_185, OTRO_GRUPO_185]);
  await pool.query("INSERT INTO colaboradores (dni,nombre,grupo,sede) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)", [PERSONAS_185.ana, NOMBRES_185.ana, GRUPO_185, SEDE_185, PERSONAS_185.beto, NOMBRES_185.beto, OTRO_GRUPO_185, OTRA_SEDE_185]);
  await pool.query(`INSERT INTO relaciones_laborales (dni,ingreso,cese,ingreso_confirmado_por_id,ingreso_confirmado_en,cese_confirmado_por_id,cese_confirmado_en,registrada_por_id)
    VALUES ($1,'2019-09-26','2019-09-27',$3,now(),$3,now(),$3),($2,'2019-09-26','2019-09-27',$3,now(),$3,now(),$3)`, [PERSONAS_185.ana, PERSONAS_185.beto, responsableId]);
  await pool.query("INSERT INTO politicas_tardanzas_grupo (grupo,tolerancia_en_minutos,tardanzas_acumuladas,horas_penalizadas,configurada_por_id,configurada_en) VALUES ($1,10,3,1,$3,now()),($2,10,3,1,$3,now())", [GRUPO_185,OTRO_GRUPO_185,responsableId]);
  const db = drizzle({ client: pool, schema });
  const repo = new RepositorioPostgresDeAsistencias(db);
  const actor: Actor = { id: responsableId, rol: "gerente_de_area", grupos: [{ nombre: GRUPO_185, gestionaAsistencia: true }, { nombre: OTRO_GRUPO_185, gestionaAsistencia: true }] };
  for (const [dni, grupo, sede, fechas] of [
    [PERSONAS_185.ana, GRUPO_185, SEDE_185, Object.values(FECHAS_185).filter(f => f !== FECHAS_185.sinPlan)],
    [PERSONAS_185.beto, OTRO_GRUPO_185, OTRA_SEDE_185, [FECHAS_185.registrar, FECHAS_185.ajustar]],
  ] as const) {
    for (const fecha of fechas) {
      await pool.query("INSERT INTO turnos_publicados (dni,fecha,grupo,sede,entrada_programada,salida_programada,descanso) VALUES ($1,$2,$3,$4,'09:00','17:00',false)", [dni,fecha,grupo,sede]);
      await pool.query("INSERT INTO asistencias_esperadas (dni,fecha) VALUES ($1,$2)", [dni,fecha]);
    }
  }
  // Fuente XLSX real y ficticia, conservada fuera de public/. Las marcas incompletas son evidencia cruda del fixture.
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
    ["DNI", "Sede", "Fecha", "Entrada", "Salida"],
    [PERSONAS_185.ana, SEDE_185, FECHAS_185.registrar, "09:00", "17:00"],
    [PERSONAS_185.ana, SEDE_185, FECHAS_185.ajustar, "09:00", "17:00"],
  ]), "Asistencias");
  const contenido: Buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });
  const directorio = process.env.ALMACENAMIENTO_IMPORTACIONES ?? path.join(process.cwd(), "data", "importaciones");
  await mkdir(directorio, { recursive: true });
  const ubicacion = path.join(directorio, "QA185-original.xlsx");
  await writeFile(ubicacion, contenido);
  await new RepositorioPostgresDeImportaciones(db).guardar({
    archivo: { nombre: "QA185-original.xlsx", ubicacion, hashSha256: createHash("sha256").update(contenido).digest("hex") },
    usuarioId: responsableId, importadaEn: new Date(), reemplazos: [],
    propuestas: [FECHAS_185.registrar, FECHAS_185.ajustar].map(fecha => ({ dni: PERSONAS_185.ana, fecha, estado: "pendiente", entradaPropuesta: `${fecha}T09:00`, salidaPropuesta: `${fecha}T17:00` })),
    marcasCrudas: [FECHAS_185.registrar, FECHAS_185.ajustar].flatMap(fecha => ["09:00", "17:00"].map(hora => ({ dni: PERSONAS_185.ana, sede: SEDE_185, fecha, instante: `${fecha}T${hora}` }))).concat([{ dni: PERSONAS_185.ana, sede: SEDE_185, fecha: FECHAS_185.incompleta, instante: `${FECHAS_185.incompleta}T09:00` }]),
  });
  for (const [dni, sede, fechas] of [[PERSONAS_185.ana, SEDE_185, [FECHAS_185.ajustar, FECHAS_185.cerrada]], [PERSONAS_185.beto, OTRA_SEDE_185, [FECHAS_185.registrar, FECHAS_185.ajustar]]] as const) {
    for (const fecha of fechas) await confirmarAsistencia(repo, actor, { dni, fecha, sede, entradaReal: `${fecha}T09:00`, salidaReal: `${fecha}T17:00` });
  }
  await registrarEstadoManual(repo, actor, { dni: PERSONAS_185.ana, fecha: FECHAS_185.manual, tipo: "permiso", comentario: "Permiso ficticio QA185" });
  await pool.query("INSERT INTO periodos_planilla (inicio,fin,estado,cerrado_por_id,cerrado_en) VALUES ($1,$1,'cerrado',$2,now())", [FECHAS_185.cerrada,responsableId]);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/escenarios/issue-185.ts")) {
  const pool = new Pool({ connectionString: urlEscenario185() });
  (async () => { if (process.argv.includes("--limpiar")) await limpiarEscenario185(pool); else await crearEscenario185(pool); })()
    .then(() => console.log("Escenario ficticio #185 preparado/retirado en su base exclusiva."))
    .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
    .finally(() => pool.end());
}
