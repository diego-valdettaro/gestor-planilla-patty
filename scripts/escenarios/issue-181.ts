import { Pool, type PoolClient } from "pg";

export const GRUPO_181 = "QA 181 Horarios";
export const SEDE_181 = "QA 181 Sede";
export const PERSONAS_181 = ["99918101", "99918102", "99918103"];

export function urlEscenario181(): string {
  const indice = process.argv.indexOf("--url");
  const raw = indice >= 0 ? process.argv[indice + 1] : process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("Falta TEST_DATABASE_URL");
  const url = new URL(raw);
  if (url.hostname !== "127.0.0.1" || !["/planilla_test", "/planilla_rev_181"].includes(url.pathname) || process.env.DATABASE_URL !== raw || process.env.TEST_DATABASE_URL !== raw) throw new Error("Base de #181 fuera del entorno temporal");
  return raw;
}

export function semanaEscenario181(): string {
  const hoy = new Date();
  const lunes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  const dia = lunes.getUTCDay() || 7;
  lunes.setUTCDate(1 + ((8 - dia) % 7));
  return lunes.toISOString().slice(0, 10);
}

async function transaccion(pool: Pool, operacion: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try { await client.query("BEGIN"); await operacion(client); await client.query("COMMIT"); }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function crearEscenario181(pool: Pool) {
  const semana = semanaEscenario181();
  await transaccion(pool, async client => {
    const cuenta = await client.query<{ id: string }>("SELECT id FROM cuentas_locales WHERE nombre_usuario='gerente-tiendas'");
    if (cuenta.rowCount !== 1) throw new Error("Falta gerente de prueba");
    const periodo = await client.query("SELECT id FROM periodos_planilla WHERE estado='abierto' AND inicio <= $1::date AND fin >= $1::date + 6", [semana]);
    if (periodo.rowCount !== 1) throw new Error("Semana #181 sin período abierto completo");
    await client.query("INSERT INTO grupos (nombre) VALUES ($1)", [GRUPO_181]);
    await client.query("INSERT INTO gerentes_de_grupo (grupo,cuenta_id) VALUES ($1,$2)", [GRUPO_181, cuenta.rows[0].id]);
    await client.query("INSERT INTO sedes (nombre,grupo) VALUES ($1,$2)", [SEDE_181, GRUPO_181]);
    const modelo = await client.query<{ id: string }>("INSERT INTO modelos_de_horario (id,sede,nombre,entrada,salida) VALUES (gen_random_uuid(),$1,'Apertura QA 181','08:00','16:00') RETURNING id", [SEDE_181]);
    for (const [index, dni] of PERSONAS_181.entries()) {
      const nombre = ["Ana QA 181", "Beto QA 181", "Carla QA 181"][index];
      await client.query("INSERT INTO colaboradores (dni,nombre,sede,grupo) VALUES ($1,$2,$3,$4)", [dni, nombre, SEDE_181, GRUPO_181]);
      await client.query("INSERT INTO relaciones_laborales (dni,ingreso,ingreso_confirmado_por_id,ingreso_confirmado_en,registrada_por_id) VALUES ($1,'2020-01-01',$2,now(),$2)", [dni, cuenta.rows[0].id]);
      if (index === 0) continue;
      for (let dia = 0; dia < 7; dia++) {
        const turno = await client.query<{ id: string, fecha: string }>(`INSERT INTO turnos_publicados (dni,fecha,grupo,sede,modelo_horario_id,entrada_programada,salida_programada,descanso) VALUES ($1,$2::date+$3::int,$4,$5,$6,'08:00','16:00',false) RETURNING id,fecha::text`, [dni, semana, dia, GRUPO_181, SEDE_181, modelo.rows[0].id]);
        const horario = { dni, fecha: turno.rows[0].fecha, grupo: GRUPO_181, sede: SEDE_181, modeloHorarioId: modelo.rows[0].id, entradaProgramada: "08:00", salidaProgramada: "16:00", descanso: false, motivoNoAsistencia: null };
        await client.query("INSERT INTO historial_turnos_publicados (turno_publicado_id,horario,responsable_id,motivo) VALUES ($1,$2::jsonb,$3,'Publicación inicial QA 181')", [turno.rows[0].id, JSON.stringify(horario), cuenta.rows[0].id]);
        await client.query("INSERT INTO asistencias_esperadas (dni,fecha,estado) VALUES ($1,$2,'pendiente')", [dni, turno.rows[0].fecha]);
      }
    }
  });
}

export async function limpiarEscenario181(pool: Pool) {
  await transaccion(pool, async client => {
    await client.query("DELETE FROM celdas_planes_semanales_en_borrador WHERE plan_id IN (SELECT id FROM planes_semanales_en_borrador WHERE equipo=$1)", [GRUPO_181]);
    await client.query("DELETE FROM planes_semanales_en_borrador WHERE equipo=$1", [GRUPO_181]);
    await client.query("DELETE FROM historial_turnos_publicados WHERE turno_publicado_id IN (SELECT id FROM turnos_publicados WHERE dni=ANY($1::text[]))", [PERSONAS_181]);
    await client.query("DELETE FROM turnos_publicados WHERE dni=ANY($1::text[])", [PERSONAS_181]);
    await client.query("DELETE FROM asistencias_esperadas WHERE dni=ANY($1::text[])", [PERSONAS_181]);
    await client.query("DELETE FROM relaciones_laborales WHERE dni=ANY($1::text[])", [PERSONAS_181]);
    await client.query("DELETE FROM colaboradores WHERE dni=ANY($1::text[])", [PERSONAS_181]);
    await client.query("DELETE FROM modelos_de_horario WHERE sede=$1", [SEDE_181]);
    await client.query("DELETE FROM sedes WHERE nombre=$1", [SEDE_181]);
    await client.query("DELETE FROM gerentes_de_grupo WHERE grupo=$1", [GRUPO_181]);
    await client.query("DELETE FROM grupos WHERE nombre=$1", [GRUPO_181]);
  });
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/escenarios/issue-181.ts")) {
  const pool = new Pool({ connectionString: urlEscenario181() });
  crearEscenario181(pool).then(() => console.log("Escenario #181 preparado en grupo aislado.")).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
}
