import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { RepositorioPostgresDeCuentas } from "@/autenticacion/repositorio-postgres";
import type { Actor } from "@/autenticacion/permisos";
import { registrarColaborador } from "@/colaboradores/registrar-colaborador";
import { RepositorioPostgresDeColaboradores } from "@/colaboradores/repositorio-postgres";
import { registrarCondicionLaboral } from "@/condiciones-laborales/gestionar-condiciones-laborales";
import { RepositorioPostgresDeCondicionesLaborales } from "@/condiciones-laborales/repositorio-postgres";
import * as schema from "@/db/schema";
import { RepositorioPostgresDeDescansosYFeriados } from "@/descansos-y-feriados/repositorio-postgres";
import { confirmarFuente, registrarImporte } from "@/fuentes-externas/gestionar-fuentes-externas";
import { RepositorioPostgresDeFuentesExternas } from "@/fuentes-externas/repositorio-postgres";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";
import { TIPO_DE_CONCILIACION } from "@/pagos/conciliacion-de-cese";
import { formatearSolesConSigno } from "@/pagos/fuentes-en-el-neto";
import { prepararBorrador } from "@/pagos/preparar-borrador";
import { construirHechosDiarios } from "@/periodos/hechos-de-asistencia-postgres";
import { RepositorioPostgresDePeriodos } from "@/periodos/repositorio-postgres";
import { activarReglaLegal } from "@/reglas-legales/gestionar-reglas-legales";
import { RepositorioPostgresDeReglasLegales } from "@/reglas-legales/repositorio-postgres";
import { confirmarCese, confirmarIngreso, registrarCese, registrarIngreso } from "@/relaciones-laborales/gestionar-relaciones-laborales";
import { RepositorioPostgresDeRelacionesLaborales } from "@/relaciones-laborales/repositorio-postgres";

// Escenario de revisión del issue #129, «Finalizar la preliquidación del mes» (`pnpm revisar` lo corre después del seed). Datos SINTÉTICOS
// de dos meses de pago pasados, anteriores al ingreso de cualquier persona del seed (el primero es el 06/01/2020), de modo que su
// población son solo las personas de este escenario y los importes no dependen de la fecha de hoy:
//
//   2019-11  mes limpio, sin bloqueos: Ana S/ 2.000,00, Beto S/ 1.500,00 y Carla S/ 1.000,00 (subtotal total S/ 4.500,00). Q1 y Q3.
//   2019-12  mes con bloqueos: las tres anteriores, más una persona con subtotal negativo (cuota de préstamo mayor que su sueldo) y otra
//            con cese confirmado y sin conciliar. Q2.
//
// Cada mes tiene su período de planilla cerrado (cortes 26/10–25/11 y 26/11–25/12) con la asistencia aprobada y una revisión sin hechos
// (la asistencia no interviene: todas las personas cobran su sueldo completo), reglas legales de DEMOSTRACIÓN vigentes desde el 01/10/2019,
// condiciones laborales y todas las fuentes externas confirmadas, salvo la conciliación de liquidación por cese de 2019-12. No toca el seed.
//
// QA posterior a cargo de la orquestadora (navegador, Finanzas): /pagos debe listar ambos meses; /pagos/2019-11 muestra «El mes no tiene
// bloqueos. Puede finalizarlo.»; /pagos/2019-12 muestra el botón deshabilitado con «Resuelva los N bloqueos para finalizar».

const RECHAZO_DE_BASE = "Rechazo correr el escenario contra una base que no sea de revisión (`planilla_rev_<n>`).";
const FUENTE_DE_DEMOSTRACION = "Dato de demostración (escenario #129), no es una fuente oficial";

const MES_LIMPIO = "2019-11";
const MES_CON_BLOQUEOS = "2019-12";
const CORTES = [
  { inicio: "2019-10-26", fin: "2019-11-25" },
  { inicio: "2019-11-26", fin: "2019-12-25" },
];
const SEDE = "Tienda Benavides";
const GRUPO = "Tiendas";

interface PersonaDelEscenario { dni: string; nombre: string; sueldo: string; ingreso: string; cese?: string }
const PERSONAS: PersonaDelEscenario[] = [
  { dni: "99912901", nombre: "Ana Mes Limpio", sueldo: "2000", ingreso: "2019-11-01" },
  { dni: "99912902", nombre: "Beto Mes Limpio", sueldo: "1500", ingreso: "2019-11-01" },
  { dni: "99912903", nombre: "Carla Mes Limpio", sueldo: "1000", ingreso: "2019-11-01" },
  { dni: "99912904", nombre: "Néstor Neto Negativo", sueldo: "1500", ingreso: "2019-12-01" },
  { dni: "99912905", nombre: "Cecilia Cese Sin Conciliar", sueldo: "1800", ingreso: "2019-12-01", cese: "2019-12-18" },
];

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
    const cuentas = new RepositorioPostgresDeCuentas(db);
    const [admin, finanzas, rrhh, gerente] = await Promise.all(["admin", "finanzas", "rrhh", "gerente-tiendas"].map((nombre) => cuentas.buscarPorNombreUsuario(nombre)));
    if (!admin || !finanzas || !rrhh || !gerente) throw new Error("Faltan las cuentas del seed: ¿corrió el seed?");
    const actorAdmin: Actor = { id: admin.id, rol: "administrador" };
    const actorFinanzas: Actor = { id: finanzas.id, rol: "finanzas" };
    const actorRrhh: Actor = { id: rrhh.id, rol: "recursos_humanos" };

    const colaboradores = new RepositorioPostgresDeColaboradores(db);
    if (await colaboradores.buscarPorDni(PERSONAS[0].dni)) throw new Error("El escenario #129 ya se aplicó en esta base.");

    // Personas y relaciones laborales, con los casos de uso reales.
    const relaciones = new RepositorioPostgresDeRelacionesLaborales(db);
    const relacionDe = new Map<string, string>();
    for (const { dni, nombre, ingreso, cese } of PERSONAS) {
      await registrarColaborador(colaboradores, actorAdmin, { dni, nombre, sede: SEDE, grupo: GRUPO, activo: true });
      const relacion = await registrarIngreso(relaciones, actorRrhh, { dni, ingreso });
      await confirmarIngreso(relaciones, actorRrhh, relacion.id);
      if (cese) {
        await registrarCese(relaciones, actorRrhh, relacion.id, cese);
        await confirmarCese(relaciones, actorRrhh, relacion.id);
      }
      relacionDe.set(dni, relacion.id);
    }

    // Condiciones laborales: sueldo y los demás datos que exige el borrador (ONP, sin asignación familiar, sede de adscripción).
    const condiciones = new RepositorioPostgresDeCondicionesLaborales(db);
    for (const { dni, sueldo, ingreso } of PERSONAS) {
      const registrar = (dato: string, valor: string) => registrarCondicionLaboral(condiciones, actorFinanzas, { relacionId: relacionDe.get(dni)!, dato, valor, vigenteDesde: ingreso });
      await registrar("sueldo", sueldo);
      await registrar("jornada_ordinaria_diaria", "8");
      await registrar("regimen_laboral", "general");
      await registrar("afiliacion_pensionaria", "onp");
      await registrar("elegibilidad_familiar", "no");
      await registrar("sede_de_adscripcion", SEDE);
    }

    // Reglas legales de demostración, vigentes antes del primer mes (las del seed empiezan en el mes anterior a hoy).
    const reglas = new RepositorioPostgresDeReglasLegales(db);
    for (const [codigo, valor] of [["rmv", "1000"], ["essalud_tasa", "9"], ["essalud_base_minima", "1000"], ["onp_tasa", "13"]] as const) {
      await activarReglaLegal(reglas, actorFinanzas, { codigo, valor, vigenteDesde: "2019-10-01", fuenteOficial: FUENTE_DE_DEMOSTRACION });
    }

    // Períodos de planilla cerrados con la asistencia aprobada y su revisión (sin hechos: nadie tiene turnos ni marcas en estas fechas).
    const periodos = new RepositorioPostgresDePeriodos(db);
    for (const corte of CORTES) {
      const [periodo] = await db.insert(schema.periodosPlanilla).values({ ...corte, estado: "cerrado", cerradoPorId: finanzas.id, cerradoEn: new Date() }).returning({ id: schema.periodosPlanilla.id });
      await db.insert(schema.aprobacionesDeAsistencia).values({ periodoId: periodo.id, grupo: GRUPO, aprobadaPorId: gerente.id, aprobadaEn: new Date() });
      await db.insert(schema.revisionesDePeriodosPlanilla).values({
        periodoId: periodo.id, numero: 1, resumen: await periodos.listarResumen({ periodoId: periodo.id }),
        hechos: await construirHechosDiarios(db, corte), responsableId: finanzas.id, cerradaEn: new Date(),
      });
    }

    // Fuentes externas: el préstamo de Néstor (mayor que su sueldo) y la confirmación de todas las fuentes de cada mes. La conciliación
    // de liquidación por cese de 2019-12 queda sin confirmar: es lo que mantiene bloqueada a Cecilia.
    const fuentes = new RepositorioPostgresDeFuentesExternas(db);
    await registrarImporte(fuentes, actorFinanzas, { tipoDeFuente: "prestamos", dni: "99912904", concepto: "cuota_de_prestamo", fechaDelHecho: "2019-12-02",
      mesDeDevengue: MES_CON_BLOQUEOS, mesDeAplicacion: MES_CON_BLOQUEOS, monto: "3000" });
    for (const mes of [MES_LIMPIO, MES_CON_BLOQUEOS]) {
      for (const { codigo } of TIPOS_DE_FUENTE) {
        if (mes === MES_CON_BLOQUEOS && codigo === TIPO_DE_CONCILIACION) continue;
        await confirmarFuente(fuentes, actorFinanzas, { tipoDeFuente: codigo, mes });
      }
    }

    console.log("Escenario #129: dos meses de pago sintéticos, anteriores al ingreso de cualquier persona del seed.");
    for (const [mes, recorrido] of [[MES_LIMPIO, "mes limpio, sin bloqueos (Q1 y Q3)"], [MES_CON_BLOQUEOS, "mes con bloqueos: subtotal negativo y cese sin conciliar (Q2)"]]) {
      const borrador = await prepararBorrador({
        relaciones, condiciones, reglas, asistencia: periodos, externas: fuentes, descansos: new RepositorioPostgresDeDescansosYFeriados(db),
      }, mes);
      console.log(`\n  Mes ${mes}: ${recorrido}. Panel: ${borrador.bloqueosDelMes.length + borrador.personasBloqueadas} bloqueo(s) (${borrador.bloqueosDelMes.length} del mes y ${borrador.personasBloqueadas} persona(s) bloqueada(s)).`);
      for (const { relacion, netoCentimos, bloqueos } of borrador.personas) {
        console.log(`    ${relacion.nombre}: ${netoCentimos === null ? `sin subtotal (${bloqueos.join(" | ")})` : formatearSolesConSigno(netoCentimos)}`);
      }
      if (!borrador.personasBloqueadas) console.log(`    Subtotal total: ${formatearSolesConSigno(borrador.netoCalculadoCentimos)}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
