import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { RepositorioPostgresDeCuentas } from "@/autenticacion/repositorio-postgres";
import type { Actor } from "@/autenticacion/permisos";
import { RepositorioPostgresDeCondicionesLaborales } from "@/condiciones-laborales/repositorio-postgres";
import * as schema from "@/db/schema";
import { RepositorioPostgresDeDescansosYFeriados } from "@/descansos-y-feriados/repositorio-postgres";
import { confirmarFuente, registrarImporte } from "@/fuentes-externas/gestionar-fuentes-externas";
import { decidirIncidencia, registrarIncidencia } from "@/fuentes-externas/incidencias-y-ajustes";
import { RepositorioPostgresDeFuentesExternas } from "@/fuentes-externas/repositorio-postgres";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";
import { formatearSolesConSigno } from "@/pagos/fuentes-en-el-neto";
import { prepararBorrador } from "@/pagos/preparar-borrador";
import { RepositorioPostgresDePeriodos } from "@/periodos/repositorio-postgres";
import { RepositorioPostgresDeReglasLegales } from "@/reglas-legales/repositorio-postgres";
import { RepositorioPostgresDeRelacionesLaborales } from "@/relaciones-laborales/repositorio-postgres";

// Escenario de revisión del issue #127 (`pnpm revisar` lo corre después del seed). Datos SINTÉTICOS
// del mes de pago actual. Añade préstamos de 200,00 a Beto y 2.000,00 a Carla, más una incidencia
// de 80,00 de Beto marcada «En investigación (fuera del neto)», e intenta confirmar los tipos de fuente.
// No resuelve asistencia: Beto puede seguir bloqueado por jornadas pendientes y Carla por horas extra pendientes.
// Por tanto no promete netos E1/E2 calculados ni que Carla llegue al bloqueo por neto negativo.
// La salida conserva los importes o la primera causa de bloqueo real de cada persona; no equivale a QA aprobada.
//
// QA posterior a cargo de maestro, con Ana Borrador (99900001, Tiendas Benavides) y Franco Díaz
// (99900007, Taller): comprobar primero sus bloqueos, condiciones, reglas y subtotal real, incluidas
// las vacaciones de Franco. Maestro preparará por UI las operaciones y los esperados independientes:
// registrar fuentes sobre personas calculables para neto y negativo individual, revisar totales por sede,
// volver Adelantos a pendiente y confirmarla vacía, registrar en Ana una incidencia en investigación y
// luego autorizarla y reconfirmar su fuente. Recargar y contrastar líneas, bases y estados en cada paso.
// Esas operaciones UI no las ejecuta este escenario; los préstamos y la incidencia de Beto se conservan
// para inspección aunque su asistencia impida observar el neto. No se cambian semillas para fabricar éxito.

const RECHAZO_DE_BASE = "Rechazo correr el escenario contra una base que no sea de revisión (`planilla_rev_<n>`).";

function urlDeArgumentos(): string {
  const indice = process.argv.indexOf("--url");
  const url = indice >= 0 ? process.argv[indice + 1] : process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL o el argumento --url.");
  const nombre = new URL(url).pathname.replace(/^\//, "");
  if (nombre === "planilla" || !/^planilla_rev_\d+$/.test(nombre)) throw new Error(RECHAZO_DE_BASE);
  return url;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: urlDeArgumentos() });
  try {
    const db = drizzle(pool, { schema });
    const finanzas = await new RepositorioPostgresDeCuentas(db).buscarPorNombreUsuario("finanzas");
    if (!finanzas) throw new Error("No existe la cuenta de Finanzas: ¿corrió el seed?");
    const actor: Actor = { id: finanzas.id, rol: "finanzas" };
    const repositorio = new RepositorioPostgresDeFuentesExternas(db);

    const hoy = new Date();
    const mes = `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, "0")}`;
    const fecha = `${mes}-02`;
    const cargar = (tipoDeFuente: string, dni: string, concepto: string, monto: string) =>
      registrarImporte(repositorio, actor, { tipoDeFuente, dni, concepto, fechaDelHecho: fecha, mesDeDevengue: mes, mesDeAplicacion: mes, monto });

    await cargar("prestamos", "99900002", "cuota_de_prestamo", "200");
    await cargar("prestamos", "99900003", "cuota_de_prestamo", "2000");
    const incidencia = await registrarIncidencia(repositorio, actor, { dni: "99900002", fechaDelHecho: fecha, mesDeDevengue: mes, mesDeAplicacion: mes, monto: "80" });
    await decidirIncidencia(repositorio, actor, { id: incidencia.id, decision: "no_descontar" });

    // Confirma el resto de los tipos del mes; los ya confirmados por el seed (comisiones y adelantos) se dejan como están.
    for (const { codigo, nombre } of TIPOS_DE_FUENTE) {
      try {
        await confirmarFuente(repositorio, actor, { tipoDeFuente: codigo, mes });
      } catch (error) {
        console.log(`Fuente «${nombre}»: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const borrador = await prepararBorrador({
      relaciones: new RepositorioPostgresDeRelacionesLaborales(db), condiciones: new RepositorioPostgresDeCondicionesLaborales(db),
      reglas: new RepositorioPostgresDeReglasLegales(db), asistencia: new RepositorioPostgresDePeriodos(db), externas: repositorio,
      descansos: new RepositorioPostgresDeDescansosYFeriados(db),
    }, mes);
    console.log(`Escenario #127: mes de pago ${mes}.`);
    for (const { relacion, sedeDeAdscripcion, netoCentimos, bloqueos } of borrador.personas) {
      console.log(`  ${relacion.nombre} (${sedeDeAdscripcion ?? "sede pendiente"}): ${netoCentimos === null ? `sin neto${bloqueos.length ? ` (${bloqueos[0]})` : ""}` : formatearSolesConSigno(netoCentimos)}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
