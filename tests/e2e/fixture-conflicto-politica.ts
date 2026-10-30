import { randomUUID } from "node:crypto";
import { Pool } from "pg";

type FixtureConflictoPolitica = {
  grupo: string;
  sedes: { actual: string; futura: string; inactiva: string };
  politicas: { actual: string; futura: string; inactiva: string };
  limpiar: () => Promise<void>;
};

function urlDeBaseTemporal(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("El fixture G31 requiere TEST_DATABASE_URL de pnpm validate.");
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error("El fixture G31 solo puede usar una base temporal loopback.");
  }
  if (!parsed.pathname || parsed.pathname === "/") throw new Error("TEST_DATABASE_URL debe identificar una base temporal explícita.");
  return url;
}

export async function crearFixtureConflictoPolitica(): Promise<FixtureConflictoPolitica> {
  const pool = new Pool({ connectionString: urlDeBaseTemporal() });
  const sufijo = randomUUID();
  const grupo = `G31 ${sufijo}`;
  const sedes = {
    actual: `G31 actual ${sufijo}`,
    futura: `G31 futura ${sufijo}`,
    inactiva: `G31 inactiva ${sufijo}`,
  };
  const politicas = {
    actual: "10,3,1",
    futura: "17,2,1",
    inactiva: "20,2,1",
  };
  const { rows: admins } = await pool.query<{ id: string }>(
    "SELECT id FROM cuentas_locales WHERE nombre_usuario = 'admin'",
  );
  if (admins.length !== 1) {
    await pool.end();
    throw new Error("El fixture G31 requiere la cuenta admin del seed temporal.");
  }

  try {
    await pool.query("BEGIN");
    await pool.query("INSERT INTO grupos (nombre, gestiona_asistencia) VALUES ($1, true)", [grupo]);
    await pool.query(
      "INSERT INTO sedes (nombre, grupo, activa) VALUES ($1, $4, true), ($2, $4, true), ($3, $4, false)",
      [sedes.actual, sedes.futura, sedes.inactiva, grupo],
    );
    await pool.query(
      `INSERT INTO politicas_de_penalizacion_por_tardanzas
       (sede, tolerancia_en_minutos, tardanzas_acumuladas, horas_penalizadas, version, vigente_desde, configurada_por_id)
       VALUES ($1, 10, 3, 1, 1, '2026-09-01', $4),
              ($2, 17, 2, 1, 1, '2099-11-01', $4),
              ($3, 20, 2, 1, 1, '2026-09-01', $4)`,
      [sedes.actual, sedes.futura, sedes.inactiva, admins[0].id],
    );
    await pool.query(
      "INSERT INTO politicas_tardanzas_grupo (grupo, conflicto) VALUES ($1, true)",
      [grupo],
    );
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    await pool.end();
    throw error;
  }

  return {
    grupo,
    sedes,
    politicas,
    limpiar: async () => {
      try {
        await pool.query("BEGIN");
        await pool.query("DELETE FROM politicas_tardanzas_grupo WHERE grupo = $1", [grupo]);
        await pool.query("DELETE FROM politicas_de_penalizacion_por_tardanzas WHERE sede = ANY($1::text[])", [Object.values(sedes)]);
        await pool.query("DELETE FROM sedes WHERE grupo = $1", [grupo]);
        await pool.query("DELETE FROM grupos WHERE nombre = $1", [grupo]);
        await pool.query("COMMIT");
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      } finally {
        await pool.end();
      }
    },
  };
}
