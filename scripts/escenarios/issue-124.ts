import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { RepositorioPostgresDeCuentas } from "@/autenticacion/repositorio-postgres";
import type { Actor } from "@/autenticacion/permisos";
import * as schema from "@/db/schema";
import { asignarDescansoSemanal, registrarFeriado } from "@/descansos-y-feriados/gestionar-descansos-y-feriados";
import { RepositorioPostgresDeDescansosYFeriados } from "@/descansos-y-feriados/repositorio-postgres";
import { activarReglaLegal } from "@/reglas-legales/gestionar-reglas-legales";
import { RepositorioPostgresDeReglasLegales } from "@/reglas-legales/repositorio-postgres";

// Escenario de revisión del issue #124 (`pnpm revisar` lo corre después del seed). Beto Publicado trabajó el lunes
// y el martes de la semana actual: el lunes pasa a ser su descanso semanal asignado y el martes un feriado, de modo que
// el borrador de Pagos muestre las dos líneas de «trabajo en descanso o feriado» (el martes con sus horas extra
// descontadas). Las sobretasas son de DEMOSTRACIÓN y siguen pendientes de validar con Finanzas o el contador.

const FUENTE_DE_DEMOSTRACION = "Dato de demostración (escenario #124), no es una fuente oficial";

function urlDeArgumentos(): string {
  const indice = process.argv.indexOf("--url");
  const url = indice >= 0 ? process.argv[indice + 1] : process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL o el argumento --url.");
  if (/\/planilla(\?|$)/.test(url)) throw new Error("Rechazo correr el escenario contra la base `planilla`.");
  return url;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: urlDeArgumentos() });
  try {
    const db = drizzle(pool, { schema });
    const finanzas = await new RepositorioPostgresDeCuentas(db).buscarPorNombreUsuario("finanzas");
    if (!finanzas) throw new Error("No existe la cuenta de Finanzas: ¿corrió el seed?");
    const actor: Actor = { id: finanzas.id, rol: "finanzas" };

    const [primerPeriodo] = await db.select().from(schema.periodosPlanilla).orderBy(asc(schema.periodosPlanilla.inicio)).limit(1);
    const reglas = new RepositorioPostgresDeReglasLegales(db);
    const activar = (codigo: string, valor: string) =>
      activarReglaLegal(reglas, actor, { codigo, valor, vigenteDesde: primerPeriodo.inicio, fuenteOficial: FUENTE_DE_DEMOSTRACION });
    await activar("trabajo_en_descanso_o_feriado_sobretasa", "100");
    await activar("trabajo_en_primero_de_mayo_sobretasa", "100");

    const dias = await db.select({ fecha: schema.asistenciasEsperadas.fecha, estado: schema.asistenciasEsperadas.estado })
      .from(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.dni, "99900002"), eq(schema.asistenciasEsperadas.estado, "confirmada")))
      .orderBy(asc(schema.asistenciasEsperadas.fecha));
    if (dias.length < 2) throw new Error("Beto debería tener al menos dos asistencias confirmadas en el seed.");
    const [lunes, martes] = dias;

    const calendario = new RepositorioPostgresDeDescansosYFeriados(db);
    const diaDeLaSemana = new Date(`${lunes.fecha}T00:00:00Z`).getUTCDay() || 7;
    await asignarDescansoSemanal(calendario, actor, { dni: "99900002", diaDeLaSemana, vigenteDesde: lunes.fecha });
    await registrarFeriado(calendario, actor, { fecha: martes.fecha, nombre: "Feriado de demostración" });
    console.log(`Escenario #124: Beto tiene descanso semanal el ${lunes.fecha} y feriado el ${martes.fecha}; sobretasas de demostración al 100 %.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
