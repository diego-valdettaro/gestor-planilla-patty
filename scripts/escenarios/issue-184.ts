import { Pool, type PoolClient } from "pg";

// Escenario de revisión de #184 (publicación semanal de horarios). Datos ficticios con prefijo «QA 184»; no toca cuentas ni
// grupos existentes. Solo corre contra una base desechable en 127.0.0.1 (`planilla_rev_184` o la `planilla_test` de las e2e).
export const GRUPO_184 = "QA 184 Horarios";
export const OTRO_GRUPO_184 = "QA 184 Otro grupo";
export const SEDE_184 = "QA 184 Sede";
export const OTRA_SEDE_184 = "QA 184 Otra sede";
export const PERSONAS_184 = { ana: "99918401", beto: "99918402", carla: "99918403" };
export const NOMBRES_184 = { ana: "Ana QA 184", beto: "Beto QA 184", carla: "Carla QA 184" };
/** Semana sin ningún período: se publica completa (QA 3). Beto ingresa el 23, así que el 21 y el 22 son «Sin relación laboral». */
export const SEMANA_SIN_PERIODO_184 = "2026-09-21";
/** Semana siguiente: solo Ana tiene allí un borrador (martes 29), para ver el borrador de destino al cambiar de semana (QA 1). */
export const SEMANA_SIGUIENTE_184 = "2026-09-28";
/** Semana con un día cerrado (el miércoles 16): intentar publicarla se rechaza con la fecha y la causa (QA 4). */
export const SEMANA_CON_CIERRE_184 = "2026-09-14";
export const FECHA_CERRADA_184 = "2026-09-16";
const INGRESO_DE_BETO = "2026-09-23";

export function urlEscenario184(): string {
  const indice = process.argv.indexOf("--url");
  const raw = indice >= 0 ? process.argv[indice + 1] : process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("Falta TEST_DATABASE_URL.");
  const url = new URL(raw);
  if (url.hostname !== "127.0.0.1" || !["/planilla_rev_184", "/planilla_test"].includes(url.pathname)
    || process.env.DATABASE_URL !== raw || process.env.TEST_DATABASE_URL !== raw) {
    throw new Error("El escenario de #184 requiere una base desechable en 127.0.0.1 (planilla_rev_184 o planilla_test) con DATABASE_URL igual a TEST_DATABASE_URL.");
  }
  return raw;
}

async function transaccion(pool: Pool, operacion: (cliente: PoolClient) => Promise<void>): Promise<void> {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    await operacion(cliente);
    await cliente.query("COMMIT");
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

function fechaMasDias(inicio: string, dias: number): string {
  const fecha = new Date(`${inicio}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

export async function crearEscenario184(pool: Pool): Promise<void> {
  await transaccion(pool, async (cliente) => {
    const cuenta = await cliente.query<{ id: string }>("SELECT id FROM cuentas_locales WHERE nombre_usuario = 'gerente-tiendas'");
    if (cuenta.rowCount !== 1) throw new Error("Falta gerente-tiendas de prueba (siembre la base de revisión primero).");
    const gerente = cuenta.rows[0].id;
    // La semana 21-27 debe quedar sin período (QA 3) y la del cierre solo con el cierre propio de este escenario (QA 4).
    const cubiertos = await cliente.query(
      "SELECT inicio::text, fin::text FROM periodos_planilla WHERE inicio <= $2::date AND fin >= $1::date",
      [SEMANA_CON_CIERRE_184, fechaMasDias(SEMANA_SIN_PERIODO_184, 6)],
    );
    if (cubiertos.rowCount) throw new Error("Las semanas del 14 al 27 de septiembre de 2026 deben quedar fuera de los períodos de demostración.");

    await cliente.query("INSERT INTO grupos (nombre) VALUES ($1), ($2)", [GRUPO_184, OTRO_GRUPO_184]);
    await cliente.query("INSERT INTO gerentes_de_grupo (grupo, cuenta_id) VALUES ($1, $3), ($2, $3)", [GRUPO_184, OTRO_GRUPO_184, gerente]);
    await cliente.query("INSERT INTO sedes (nombre, grupo) VALUES ($1, $2), ($3, $4)", [SEDE_184, GRUPO_184, OTRA_SEDE_184, OTRO_GRUPO_184]);
    await cliente.query(
      "INSERT INTO periodos_planilla (inicio, fin, estado, cerrado_por_id, cerrado_en) VALUES ($1, $1, 'cerrado', $2, now())",
      [FECHA_CERRADA_184, gerente],
    );
    const modelos = await cliente.query<{ id: string; sede: string; nombre: string }>(`
      INSERT INTO modelos_de_horario (id, sede, nombre, entrada, salida)
      VALUES (gen_random_uuid(), $1, 'Apertura QA 184', '08:00', '16:00'),
             (gen_random_uuid(), $1, 'Tarde QA 184', '10:00', '18:00'),
             (gen_random_uuid(), $2, 'Apertura otra sede QA 184', '09:00', '17:00')
      RETURNING id, sede, nombre
    `, [SEDE_184, OTRA_SEDE_184]);
    const modelo = (nombre: string) => modelos.rows.find((fila) => fila.nombre === nombre)!;
    const { ana, beto, carla } = PERSONAS_184;
    await cliente.query(`
      INSERT INTO colaboradores (dni, nombre, sede, grupo)
      VALUES ($1, $4, $7, $8), ($2, $5, $7, $8), ($3, $6, $9, $10)
    `, [ana, beto, carla, NOMBRES_184.ana, NOMBRES_184.beto, NOMBRES_184.carla, SEDE_184, GRUPO_184, OTRA_SEDE_184, OTRO_GRUPO_184]);
    await cliente.query(`
      INSERT INTO relaciones_laborales (dni, ingreso, ingreso_confirmado_por_id, ingreso_confirmado_en, registrada_por_id)
      VALUES ($1, '2020-01-01', $4, now(), $4), ($2, $5, $4, now(), $4), ($3, '2020-01-01', $4, now(), $4)
    `, [ana, beto, carla, gerente, INGRESO_DE_BETO]);

    async function crearPlan(semana: string, equipo: string): Promise<string> {
      const plan = await cliente.query<{ id: string }>(
        "INSERT INTO planes_semanales_en_borrador (semana, equipo) VALUES ($1, $2) RETURNING id", [semana, equipo],
      );
      return plan.rows[0].id;
    }
    async function crearCelda(planId: string, dni: string, fecha: string, grupo: string, sede: string, modeloId: string, entrada: string, salida: string) {
      await cliente.query(`
        INSERT INTO celdas_planes_semanales_en_borrador
          (plan_id, dni, fecha, grupo, sede, modelo_horario_id, entrada_programada, salida_programada, descanso)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
      `, [planId, dni, fecha, grupo, sede, modeloId, entrada, salida]);
    }
    const apertura = modelo("Apertura QA 184");
    const tarde = modelo("Tarde QA 184");

    // Semana sin período: Ana completa; Beto solo desde su ingreso (el sistema fija «Sin relación laboral» el 21 y el 22).
    const planSinPeriodo = await crearPlan(SEMANA_SIN_PERIODO_184, GRUPO_184);
    for (let dia = 0; dia < 7; dia++) await crearCelda(planSinPeriodo, ana, fechaMasDias(SEMANA_SIN_PERIODO_184, dia), GRUPO_184, SEDE_184, apertura.id, "08:00", "16:00");
    for (let dia = 2; dia < 7; dia++) await crearCelda(planSinPeriodo, beto, fechaMasDias(SEMANA_SIN_PERIODO_184, dia), GRUPO_184, SEDE_184, apertura.id, "08:00", "16:00");

    // Semana siguiente: una sola celda, distinta, para reconocer el borrador de destino.
    const planSiguiente = await crearPlan(SEMANA_SIGUIENTE_184, GRUPO_184);
    await crearCelda(planSiguiente, ana, fechaMasDias(SEMANA_SIGUIENTE_184, 1), GRUPO_184, SEDE_184, tarde.id, "10:00", "18:00");

    // Otro grupo, misma semana: una celda de Carla para reconocer el borrador del grupo de destino.
    const planOtroGrupo = await crearPlan(SEMANA_SIN_PERIODO_184, OTRO_GRUPO_184);
    await crearCelda(planOtroGrupo, carla, fechaMasDias(SEMANA_SIN_PERIODO_184, 1), OTRO_GRUPO_184, OTRA_SEDE_184, modelo("Apertura otra sede QA 184").id, "09:00", "17:00");

    // Semana con el miércoles 16 cerrado: Ana completa; publicarla debe rechazarse.
    const planConCierre = await crearPlan(SEMANA_CON_CIERRE_184, GRUPO_184);
    for (let dia = 0; dia < 7; dia++) await crearCelda(planConCierre, ana, fechaMasDias(SEMANA_CON_CIERRE_184, dia), GRUPO_184, SEDE_184, apertura.id, "08:00", "16:00");
  });
}

export async function limpiarEscenario184(pool: Pool): Promise<void> {
  const personas = Object.values(PERSONAS_184);
  const equipos = [GRUPO_184, OTRO_GRUPO_184];
  await transaccion(pool, async (cliente) => {
    await cliente.query("DELETE FROM celdas_planes_semanales_en_borrador WHERE plan_id IN (SELECT id FROM planes_semanales_en_borrador WHERE equipo = ANY($1::text[]))", [equipos]);
    await cliente.query("DELETE FROM planes_semanales_en_borrador WHERE equipo = ANY($1::text[])", [equipos]);
    await cliente.query("DELETE FROM historial_turnos_publicados WHERE turno_publicado_id IN (SELECT id FROM turnos_publicados WHERE dni = ANY($1::text[]))", [personas]);
    await cliente.query("DELETE FROM turnos_publicados WHERE dni = ANY($1::text[])", [personas]);
    await cliente.query("DELETE FROM asistencias_esperadas WHERE dni = ANY($1::text[])", [personas]);
    await cliente.query("DELETE FROM relaciones_laborales WHERE dni = ANY($1::text[])", [personas]);
    await cliente.query("DELETE FROM colaboradores WHERE dni = ANY($1::text[])", [personas]);
    await cliente.query("DELETE FROM periodos_planilla WHERE inicio = $1::date AND fin = $1::date AND estado = 'cerrado'", [FECHA_CERRADA_184]);
    await cliente.query("DELETE FROM modelos_de_horario WHERE sede = ANY($1::text[])", [[SEDE_184, OTRA_SEDE_184]]);
    await cliente.query("DELETE FROM sedes WHERE nombre = ANY($1::text[])", [[SEDE_184, OTRA_SEDE_184]]);
    await cliente.query("DELETE FROM gerentes_de_grupo WHERE grupo = ANY($1::text[])", [equipos]);
    await cliente.query("DELETE FROM grupos WHERE nombre = ANY($1::text[])", [equipos]);
  });
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/escenarios/issue-184.ts")) {
  const pool = new Pool({ connectionString: urlEscenario184() });
  const accion = process.argv.includes("--limpiar") ? limpiarEscenario184 : crearEscenario184;
  accion(pool)
    .then(() => console.log(process.argv.includes("--limpiar") ? "Escenario #184 retirado." : "Escenario #184 preparado en grupos aislados."))
    .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
    .finally(() => pool.end());
}
