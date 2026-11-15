import { Pool } from "pg";

export const GRUPO_182 = "QA 182 Horarios";
export const SEDE_182 = "QA 182 Sede";
export const PERSONAS_182 = ["99918201", "99918202"];

function urlEscenario(): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("Falta TEST_DATABASE_URL");
  const url = new URL(raw);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/planilla_rev_182" || process.env.DATABASE_URL !== raw) {
    throw new Error("El escenario requiere la base de revisión desechable planilla_rev_182.");
  }
  return raw;
}

export async function crearEscenario182(pool: Pool) {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const cuenta = await cliente.query<{ id: string }>(
      "SELECT id FROM cuentas_locales WHERE nombre_usuario = 'gerente-tiendas'",
    );
    if (cuenta.rowCount !== 1) throw new Error("Falta gerente-tiendas de prueba");
    const gerente = cuenta.rows[0].id;
    const abierto = await cliente.query<{ semana: string }>(`
      SELECT min(dia)::date::text AS semana
      FROM periodos_planilla, LATERAL generate_series(inicio, fin - 6, interval '1 day') AS dias(dia)
      WHERE estado = 'abierto' AND now()::date BETWEEN inicio AND fin
        AND extract(isodow FROM dia) = 1
    `);
    const cerrado = await cliente.query<{ fecha: string }>(
      "SELECT max(fin)::text AS fecha FROM periodos_planilla WHERE estado = 'cerrado'",
    );
    const semana = abierto.rows[0].semana;
    const fechaCerrada = cerrado.rows[0].fecha;
    if (!semana || !fechaCerrada) throw new Error("El seed requiere una semana abierta y una fecha cerrada");

    await cliente.query("INSERT INTO grupos (nombre) VALUES ($1)", [GRUPO_182]);
    await cliente.query("INSERT INTO gerentes_de_grupo (grupo, cuenta_id) VALUES ($1, $2)", [GRUPO_182, gerente]);
    await cliente.query("INSERT INTO sedes (nombre, grupo) VALUES ($1, $2)", [SEDE_182, GRUPO_182]);
    const modelos = await cliente.query<{ id: string }>(`
      INSERT INTO modelos_de_horario (id, sede, nombre, entrada, salida)
      VALUES (gen_random_uuid(), $1, 'Apertura QA 182', '08:00', '16:00'),
             (gen_random_uuid(), $1, 'Tarde QA 182', '10:00', '18:00')
      RETURNING id
    `, [SEDE_182]);
    const [ana, beto] = PERSONAS_182;
    await cliente.query(`
      INSERT INTO colaboradores (dni, nombre, sede, grupo)
      VALUES ($1, 'Ana QA 182', $3, $4), ($2, 'Beto QA 182', $3, $4)
    `, [ana, beto, SEDE_182, GRUPO_182]);
    await cliente.query(`
      INSERT INTO relaciones_laborales (dni, ingreso, ingreso_confirmado_por_id, ingreso_confirmado_en, registrada_por_id)
      VALUES ($1, '2020-01-01', $3, now(), $3), ($2, $4::date + 2, $3, now(), $3)
    `, [ana, beto, gerente, semana]);

    const plan = await cliente.query<{ id: string }>(
      "INSERT INTO planes_semanales_en_borrador (semana, equipo) VALUES ($1, $2) RETURNING id",
      [semana, GRUPO_182],
    );
    await cliente.query(`
      INSERT INTO celdas_planes_semanales_en_borrador
        (plan_id, dni, fecha, grupo, sede, modelo_horario_id, entrada_programada, salida_programada, descanso)
      SELECT $1, $2, $3::date + dia, $4, $5, $6, '08:00', '16:00', false
      FROM generate_series(0, 6) AS dias(dia)
    `, [plan.rows[0].id, ana, semana, GRUPO_182, SEDE_182, modelos.rows[0].id]);

    const publicados = await cliente.query<{ id: string; fecha: string }>(`
      INSERT INTO turnos_publicados (dni, fecha, grupo, sede, modelo_horario_id, entrada_programada, salida_programada, descanso)
      SELECT $1, $2::date + dia, $3, $4, $5, '08:00', '16:00', false
      FROM generate_series(0, 6) AS dias(dia)
      RETURNING id, fecha::text
    `, [ana, semana, GRUPO_182, SEDE_182, modelos.rows[0].id]);

    for (const publicado of publicados.rows) {
      const jornada = {
        dni: ana, fecha: publicado.fecha, grupo: GRUPO_182, sede: SEDE_182,
        modeloHorarioId: modelos.rows[0].id, entradaProgramada: "08:00", salidaProgramada: "16:00",
        descanso: false, motivoNoAsistencia: null,
      };
      await cliente.query(`
        INSERT INTO historial_turnos_publicados (turno_publicado_id, horario, responsable_id, motivo)
        VALUES ($1, $2::jsonb, $3, 'Publicación inicial QA 182')
      `, [publicado.id, JSON.stringify(jornada), gerente]);
      await cliente.query("INSERT INTO asistencias_esperadas (dni, fecha, estado) VALUES ($1, $2, 'pendiente')", [ana, publicado.fecha]);
    }
    await cliente.query("COMMIT");
    return { semanaPublicada: semana, fechaCerrada };
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/escenarios/issue-182.ts")) {
  const pool = new Pool({ connectionString: urlEscenario() });
  crearEscenario182(pool).then(escenario => console.log(JSON.stringify(escenario)))
    .catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
}
