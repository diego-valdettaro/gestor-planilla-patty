import { Pool } from "pg";

export const GRUPO_183 = "QA 183 Horarios";
export const OTRO_GRUPO_183 = "QA 183 Otro grupo";
export const SEDE_183 = "QA 183 Sede";
export const PERSONAS_183 = { ana: "99918301", beto: "99918302", carla: "99918303" };
export const MES_183 = "2026-04";

export async function crearEscenario183(pool: Pool) {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const cuenta = await cliente.query<{ id: string }>(
      "SELECT id FROM cuentas_locales WHERE nombre_usuario = 'gerente-tiendas'",
    );
    if (cuenta.rowCount !== 1) throw new Error("Falta gerente-tiendas de prueba.");
    const gerente = cuenta.rows[0].id;
    const fechaCerrada = "2026-04-19";
    const periodos = await cliente.query(
      "SELECT id FROM periodos_planilla WHERE inicio <= $1 AND fin >= $1",
      [fechaCerrada],
    );
    if (periodos.rowCount) throw new Error("La fecha cerrada de QA debe quedar fuera de los períodos de demostración.");

    await cliente.query("INSERT INTO grupos (nombre) VALUES ($1), ($2)", [GRUPO_183, OTRO_GRUPO_183]);
    await cliente.query("INSERT INTO gerentes_de_grupo (grupo, cuenta_id) VALUES ($1, $2)", [GRUPO_183, gerente]);
    await cliente.query("INSERT INTO sedes (nombre, grupo) VALUES ($1, $2), ($3, $4)",
      [SEDE_183, GRUPO_183, "QA 183 Otra sede", OTRO_GRUPO_183]);
    await cliente.query(
      "INSERT INTO periodos_planilla (inicio, fin, estado, cerrado_por_id, cerrado_en) VALUES ($1, $1, 'cerrado', $2, now())",
      [fechaCerrada, gerente],
    );
    const modelos = await cliente.query<{ id: string }>(`
      INSERT INTO modelos_de_horario (id, sede, nombre, entrada, salida)
      VALUES (gen_random_uuid(), $1, 'Apertura QA 183', '08:00', '16:00'),
             (gen_random_uuid(), $1, 'Tarde QA 183', '10:00', '18:00')
      RETURNING id
    `, [SEDE_183]);
    const [apertura, tarde] = modelos.rows;
    const { ana, beto, carla } = PERSONAS_183;
    await cliente.query(`
      INSERT INTO colaboradores (dni, nombre, sede, grupo)
      VALUES ($1, 'Ana QA 183', $4, $5), ($2, 'Beto QA 183', $4, $5),
             ($3, 'Carla QA 183', 'QA 183 Otra sede', $6)
    `, [ana, beto, carla, SEDE_183, GRUPO_183, OTRO_GRUPO_183]);
    await cliente.query(`
      INSERT INTO relaciones_laborales (dni, ingreso, ingreso_confirmado_por_id, ingreso_confirmado_en, registrada_por_id)
      VALUES ($1, '2020-01-01', $4, now(), $4), ($2, '2026-04-10', $4, now(), $4),
             ($3, '2020-01-01', $4, now(), $4)
    `, [ana, beto, carla, gerente]);

    const plan = await cliente.query<{ id: string }>(
      "INSERT INTO planes_semanales_en_borrador (semana, equipo) VALUES ('2026-04-20', $1) RETURNING id",
      [GRUPO_183],
    );
    await cliente.query(`
      INSERT INTO celdas_planes_semanales_en_borrador
        (plan_id, dni, fecha, grupo, sede, modelo_horario_id, entrada_programada, salida_programada, descanso)
      VALUES ($1, $2, '2026-04-20', $3, $4, $5, '10:00', '18:00', false)
    `, [plan.rows[0].id, ana, GRUPO_183, SEDE_183, tarde.id]);

    await cliente.query("COMMIT");
    return { idApertura: apertura.id, fechaCerrada };
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/escenarios/issue-183.ts")) {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw || new URL(raw).hostname !== "127.0.0.1" || new URL(raw).pathname !== "/planilla_rev_183" || process.env.DATABASE_URL !== raw) {
    throw new Error("El escenario requiere la base de revisión desechable planilla_rev_183.");
  }
  const pool = new Pool({ connectionString: raw });
  crearEscenario183(pool)
    .then(escenario => console.log(JSON.stringify(escenario)))
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => pool.end());
}
