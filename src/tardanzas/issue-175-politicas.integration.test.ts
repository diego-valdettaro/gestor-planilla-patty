import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para integración PostgreSQL.");

describe.skipIf(!url)("G09 migración de políticas por grupo", () => {
  const casos = [
    { fila: "R24 conflicto", comprobar: "conflicto" },
    { fila: "R24 versiones históricas", comprobar: "historia" },
    { fila: "R24 vigencia futura", comprobar: "futura" },
    { fila: "R24 grupo sin asistencia", comprobar: "sin-asistencia" },
    { fila: "R24 sede sin grupo", comprobar: "sin-grupo" },
    { fila: "R30 conserva adscripción histórica independiente", comprobar: "adscripcion" },
    { fila: "R25", comprobar: "cierre" },
  ] as const;
  it.each(casos)("$fila migra sin elegir una política ambigua", async ({ comprobar }) => {
    const nombre = `planilla175m_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: url });
    const destino = new URL(url!); destino.pathname = `/${nombre}`;
    let pool: Pool | undefined;
    try {
      await admin.query(`CREATE DATABASE "${nombre}"`);
      pool = new Pool({ connectionString: destino.toString() });
      const anteriores = readdirSync("drizzle").filter((f) => /^\d{4}_.+\.sql$/.test(f) && f < "0043_").sort();
      for (const archivo of anteriores) await pool.query(readFileSync(`drizzle/${archivo}`, "utf8"));
      const cuenta = randomUUID(), periodo = randomUUID();
      await pool.query("INSERT INTO cuentas_locales (id,nombre_usuario,hash_contrasena,rol) VALUES ($1,'admin-prueba','x','administrador')", [cuenta]);
      await pool.query("INSERT INTO grupos (nombre,gestiona_asistencia) VALUES ('G09',true),('G09-historia',true),('G09-futura',true),('G09-inactivo',false)");
      await pool.query("INSERT INTO sedes (nombre,grupo) VALUES ('G09-a','G09'),('G09-b','G09'),('G09-historia-a','G09-historia'),('G09-historia-b','G09-historia'),('G09-futura-a','G09-futura'),('G09-futura-b','G09-futura'),('G09-inactivo-a','G09-inactivo'),('G09-sin-grupo',NULL)");
      await pool.query(`INSERT INTO politicas_de_penalizacion_por_tardanzas
        (sede,tolerancia_en_minutos,tardanzas_acumuladas,horas_penalizadas,version,vigente_desde,configurada_por_id,configurada_en) VALUES
        ('G09-a',10,3,1,1,'2026-01-01',$1,'2026-01-01'),('G09-b',15,3,1,1,'2026-01-01',$1,'2026-01-01'),
        ('G09-historia-a',5,2,1,1,'2025-01-01',$1,'2025-01-01'),('G09-historia-a',10,3,1,2,'2026-01-01',$1,'2026-01-01'),
        ('G09-historia-b',20,4,2,1,'2025-01-01',$1,'2025-01-01'),('G09-historia-b',10,3,1,2,'2026-01-01',$1,'2026-01-01'),
        ('G09-futura-a',10,3,1,1,'2026-01-01',$1,'2026-01-01'),('G09-futura-b',10,3,1,1,'2026-01-01',$1,'2026-01-01'),
        ('G09-futura-b',15,3,1,2,'2099-01-01',$1,'2098-12-01'),
        ('G09-inactivo-a',10,3,1,1,'2026-01-01',$1,'2026-01-01'),('G09-sin-grupo',10,3,1,1,'2026-01-01',$1,'2026-01-01')`, [cuenta]);
      await pool.query("INSERT INTO colaboradores (dni,nombre,sede,grupo,activo) VALUES ('87654321','Histórico G11','G09-historia-a','G09-historia',true)");
      const relacion = randomUUID();
      await pool.query("INSERT INTO relaciones_laborales (id,dni,ingreso,registrada_por_id) VALUES ($1,'87654321','2025-01-01',$2)", [relacion, cuenta]);
      await pool.query("INSERT INTO condiciones_laborales (relacion_laboral_id,dato,sede_de_adscripcion,vigente_desde,registrado_por_id) VALUES ($1,'sede_de_adscripcion','G09-historia-b','2025-01-01',$2)", [relacion, cuenta]);
      await pool.query("INSERT INTO periodos_planilla (id,inicio,fin,estado) VALUES ($1,'2026-01-26','2026-02-25','cerrado')", [periodo]);
      await pool.query("INSERT INTO revisiones_periodos_planilla (periodo_id,numero,resumen,responsable_id,cerrada_en) VALUES ($1,1,$2,$3,now())", [periodo, JSON.stringify({ indicador: 60, politicaVersion: 1 }), cuenta]);
      const revisionAntes = (await pool.query("SELECT resumen FROM revisiones_periodos_planilla WHERE periodo_id=$1", [periodo])).rows[0].resumen;
      expect(revisionAntes).toEqual({ indicador: 60, politicaVersion: 1 });
      const migration = "drizzle/0043_datos_maestros_issue_175.sql";
      if (existsSync(migration)) await pool.query(readFileSync(migration, "utf8"));
      if (comprobar === "conflicto") {
        const [{ existe }] = (await pool.query("SELECT to_regclass('public.politicas_tardanzas_grupo') IS NOT NULL AS existe")).rows;
        expect(existe).toBe(true);
        const { rows } = await pool.query("SELECT grupo, conflicto FROM politicas_tardanzas_grupo WHERE grupo='G09'");
        expect(rows).toMatchObject([{ grupo: "G09", conflicto: true }]);
        expect((await pool.query("SELECT count(*)::int AS n FROM politicas_de_penalizacion_por_tardanzas WHERE sede IN ('G09-a','G09-b')")).rows[0].n).toBe(2);
      } else if (comprobar === "historia") {
        const { rows } = await pool.query("SELECT conflicto,tolerancia_en_minutos,tardanzas_acumuladas,horas_penalizadas FROM politicas_tardanzas_grupo WHERE grupo='G09-historia'");
        expect(rows).toEqual([{ conflicto: false, tolerancia_en_minutos: 10, tardanzas_acumuladas: 3, horas_penalizadas: 1 }]);
      } else if (comprobar === "futura") {
        const { rows } = await pool.query("SELECT conflicto FROM politicas_tardanzas_grupo WHERE grupo='G09-futura'");
        expect(rows).toEqual([{ conflicto: true }]);
      } else if (comprobar === "sin-asistencia") {
        expect((await pool.query("SELECT grupo FROM politicas_tardanzas_grupo WHERE grupo='G09-inactivo'")).rows).toEqual([]);
        expect((await pool.query("SELECT count(*)::int AS n FROM politicas_de_penalizacion_por_tardanzas WHERE sede='G09-inactivo-a'")).rows[0].n).toBe(1);
      } else if (comprobar === "sin-grupo") {
        expect((await pool.query("SELECT grupo FROM politicas_tardanzas_grupo WHERE grupo IS NULL")).rows).toEqual([]);
        expect((await pool.query("SELECT count(*)::int AS n FROM politicas_de_penalizacion_por_tardanzas WHERE sede='G09-sin-grupo'")).rows[0].n).toBe(1);
      } else if (comprobar === "adscripcion") {
        expect((await pool.query(`SELECT c.sede, cl.sede_de_adscripcion AS adscripcion
          FROM colaboradores c JOIN relaciones_laborales r USING (dni)
          JOIN condiciones_laborales cl ON cl.relacion_laboral_id=r.id
          WHERE c.dni='87654321' AND cl.dato='sede_de_adscripcion'`)).rows)
          .toEqual([{ sede: "G09-historia-a", adscripcion: "G09-historia-b" }]);
      } else {
        expect((await pool.query("SELECT resumen FROM revisiones_periodos_planilla WHERE periodo_id=$1", [periodo])).rows[0].resumen).toEqual({ indicador: 60, politicaVersion: 1 });
      }
    } finally {
      if (pool) await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS "${nombre}"`);
      await admin.end();
    }
  }, 120_000);
});
