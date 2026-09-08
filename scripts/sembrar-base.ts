import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { hashDeContrasena } from "@/autenticacion/contrasenas";
import { provisionarCuentaLocal } from "@/autenticacion/provisionar-cuenta-local";
import { RepositorioPostgresDeCuentas } from "@/autenticacion/repositorio-postgres";
import type { Actor } from "@/colaboradores/registrar-colaborador";
import { registrarColaborador } from "@/colaboradores/registrar-colaborador";
import { RepositorioPostgresDeColaboradores } from "@/colaboradores/repositorio-postgres";
import * as schema from "@/db/schema";
import { configurarPoliticaDePenalizacionPorTardanzas } from "@/tardanzas/politica-de-penalizacion";
import { RepositorioPostgresDeTardanzas } from "@/tardanzas/repositorio-postgres";
import { crearModeloDeHorario } from "@/turnos/gestionar-modelos-de-horario";
import { RepositorioPostgresDeModelosDeHorario } from "@/turnos/repositorio-postgres-modelos-de-horario";
import { RepositorioPostgresDeTurnos } from "@/turnos/repositorio-postgres";
import { diasDeLaSemana } from "@/turnos/semana";

// Datos de demo para el entorno de revisión (`pnpm revisar`). NO usar contra la base `planilla`.
// Se apoya en los casos de uso reales donde protegen correctness (hash de contraseña; cascada
// turno -> asistencia esperada -> historial). Los estados que hoy no tienen caso de uso limpio
// (asistencias confirmadas/manuales, tardanzas, horas extra) se escriben directo, y van marcados.

type Db = NodePgDatabase<typeof schema>;

const SEDES = {
  benavides: "Tienda Benavides",
  sanIsidro: "Tienda San Isidro",
  taller: "Taller",
  administracion: "Administración",
  depositoInactivo: "Depósito (inactivo)",
};
const NOMBRES_DE_SEDE = Object.values(SEDES);

const CUENTAS = [
  { nombreUsuario: "operaciones", contrasena: "operaciones", rol: "operaciones" },
  { nombreUsuario: "admin", contrasena: "admin", rol: "administracion" },
  { nombreUsuario: "finanzas", contrasena: "finanzas", rol: "finanzas" },
] as const;

const COLABORADORES = [
  { idHuellero: "DEMO-ANA", nombre: "Ana Borrador", sede: SEDES.benavides, activo: true },
  { idHuellero: "DEMO-BETO", nombre: "Beto Publicado", sede: SEDES.benavides, activo: true },
  { idHuellero: "DEMO-CARLA", nombre: "Carla Cambios", sede: SEDES.benavides, activo: true },
  { idHuellero: "DEMO-DARIO", nombre: "Darío Liquidado", sede: SEDES.sanIsidro, activo: true },
  { idHuellero: "DEMO-ELENA", nombre: "Elena Sotelo", sede: SEDES.sanIsidro, activo: true },
  { idHuellero: "DEMO-FRANCO", nombre: "Franco Díaz", sede: SEDES.taller, activo: true },
  { idHuellero: "DEMO-GABI", nombre: "Gabriela Pérez", sede: SEDES.taller, activo: true },
  { idHuellero: "DEMO-HUGO", nombre: "Hugo Marín", sede: SEDES.administracion, activo: true },
  { idHuellero: "DEMO-INES", nombre: "Inés Quispe", sede: SEDES.administracion, activo: true },
  { idHuellero: "DEMO-NICO", nombre: "Nico Inactivo", sede: SEDES.benavides, activo: false },
];

const MODELOS = [
  { id: randomUUID(), sede: SEDES.benavides, nombre: "Apertura", entrada: "08:00", salida: "16:00" },
  { id: randomUUID(), sede: SEDES.benavides, nombre: "Cierre", entrada: "14:00", salida: "22:00" },
  { id: randomUUID(), sede: SEDES.sanIsidro, nombre: "Apertura", entrada: "08:00", salida: "16:00" },
  { id: randomUUID(), sede: SEDES.sanIsidro, nombre: "Cierre", entrada: "14:00", salida: "22:00" },
  { id: randomUUID(), sede: SEDES.taller, nombre: "Producción", entrada: "07:00", salida: "16:00" },
  { id: randomUUID(), sede: SEDES.administracion, nombre: "Administrativo", entrada: "09:00", salida: "18:00" },
];
const modeloApertura = (sede: string) => MODELOS.find((modelo) => modelo.sede === sede && modelo.nombre === "Apertura")!;
const modeloCierre = (sede: string) => MODELOS.find((modelo) => modelo.sede === sede && modelo.nombre === "Cierre")!;

function iso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}
function primerDiaDelMes(ref: Date): Date {
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
}
function ultimoDiaDelMes(ref: Date): Date {
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0));
}
function primerLunesDelMes(ref: Date): string {
  const primero = primerDiaDelMes(ref);
  const diaSemana = primero.getUTCDay() === 0 ? 7 : primero.getUTCDay();
  const lunes = new Date(primero);
  lunes.setUTCDate(primero.getUTCDate() + ((8 - diaSemana) % 7));
  return iso(lunes);
}
function sumarMinutos(hora: string, minutos: number): string {
  const [h, m] = hora.split(":").map(Number);
  const total = h * 60 + m + minutos;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function minutosEntre(inicio: string, fin: string): number {
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fin.split(":").map(Number);
  return hf * 60 + mf - (hi * 60 + mi);
}

const hoy = new Date();
const mesAnterior = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 15));
const PERIODO_ACTUAL = { inicio: iso(primerDiaDelMes(hoy)), fin: iso(ultimoDiaDelMes(hoy)) };
const PERIODO_ANTERIOR = { inicio: iso(primerDiaDelMes(mesAnterior)), fin: iso(ultimoDiaDelMes(mesAnterior)) };
const SEMANA_ACTUAL = primerLunesDelMes(hoy);
const SEMANA_ANTERIOR = primerLunesDelMes(mesAnterior);

function urlDeArgumentos(): string {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const indice = process.argv.indexOf("--url");
  const url = indice >= 0 ? process.argv[indice + 1] : process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL o el argumento --url.");
  if (/\/planilla(\?|$)/.test(url) && !process.argv.includes("--forzar")) {
    throw new Error("Rechazo sembrar contra la base `planilla`. Usá una base de revisión o pasá --forzar.");
  }
  return url;
}

async function limpiar(pool: Pool): Promise<void> {
  // Borra solo filas de demo, en orden seguro de FK. En una base de revisión recién creada es un no-op.
  const usuarios = CUENTAS.map((cuenta) => `'${cuenta.nombreUsuario}'`).join(", ");
  const sedes = NOMBRES_DE_SEDE.map((nombre) => `'${nombre.replace(/'/g, "''")}'`).join(", ");
  await pool.query(`
    BEGIN;
    DELETE FROM horas_extra WHERE asistencia_id IN (SELECT id FROM asistencias_esperadas WHERE id_huellero LIKE 'DEMO-%');
    DELETE FROM tardanzas WHERE asistencia_id IN (SELECT id FROM asistencias_esperadas WHERE id_huellero LIKE 'DEMO-%');
    DELETE FROM estados_manuales WHERE asistencia_id IN (SELECT id FROM asistencias_esperadas WHERE id_huellero LIKE 'DEMO-%');
    DELETE FROM ajustes_de_asistencia WHERE asistencia_id IN (SELECT id FROM asistencias_esperadas WHERE id_huellero LIKE 'DEMO-%');
    DELETE FROM asistencias_esperadas WHERE id_huellero LIKE 'DEMO-%';
    DELETE FROM incidencias_de_importacion WHERE id_huellero LIKE 'DEMO-%';
    DELETE FROM marcas_crudas WHERE id_huellero LIKE 'DEMO-%';
    DELETE FROM importaciones_semanales WHERE sede IN (${sedes});
    DELETE FROM historial_turnos_publicados WHERE turno_publicado_id IN (SELECT id FROM turnos_publicados WHERE id_huellero LIKE 'DEMO-%');
    DELETE FROM turnos_publicados WHERE id_huellero LIKE 'DEMO-%';
    DELETE FROM horarios_semanales_procesados WHERE id_huellero LIKE 'DEMO-%';
    DELETE FROM celdas_planes_semanales_en_borrador WHERE id_huellero LIKE 'DEMO-%';
    DELETE FROM planes_semanales_en_borrador WHERE semana IN ('${SEMANA_ACTUAL}', '${SEMANA_ANTERIOR}');
    DELETE FROM auditoria_modelos_de_horario WHERE modelo_id IN (SELECT id FROM modelos_de_horario WHERE sede IN (${sedes}));
    DELETE FROM modelos_de_horario WHERE sede IN (${sedes});
    DELETE FROM politicas_de_penalizacion_por_tardanzas WHERE sede IN (${sedes});
    DELETE FROM auditoria_periodos_planilla WHERE periodo_id IN (SELECT id FROM periodos_planilla WHERE inicio IN ('${PERIODO_ACTUAL.inicio}', '${PERIODO_ANTERIOR.inicio}'));
    DELETE FROM periodos_planilla WHERE inicio IN ('${PERIODO_ACTUAL.inicio}', '${PERIODO_ANTERIOR.inicio}');
    DELETE FROM colaboradores WHERE id_huellero LIKE 'DEMO-%';
    DELETE FROM sedes WHERE nombre IN (${sedes});
    DELETE FROM sesiones WHERE cuenta_id IN (SELECT id FROM cuentas_locales WHERE nombre_usuario IN (${usuarios}));
    DELETE FROM cuentas_locales WHERE nombre_usuario IN (${usuarios});
    COMMIT;
  `);
}

function turnosDeSemana(idHuellero: string, sede: string, semana: string) {
  const modelo = modeloApertura(sede);
  return diasDeLaSemana(semana).map((fecha, indice) => indice === 6
    ? { idHuellero, fecha, sede, modeloHorarioId: null, entradaProgramada: null, salidaProgramada: null, descanso: true }
    : { idHuellero, fecha, sede, modeloHorarioId: modelo.id, entradaProgramada: modelo.entrada, salidaProgramada: modelo.salida, descanso: false });
}

async function marcarConfirmada(
  db: Db,
  idHuellero: string,
  fecha: string,
  modelo: { entrada: string; salida: string },
  extras: { tardanzaMin?: number; horaExtra?: "pendiente" | "aprobada" },
): Promise<void> {
  const entradaReal = extras.tardanzaMin ? sumarMinutos(modelo.entrada, extras.tardanzaMin) : modelo.entrada;
  const [fila] = await db.update(schema.asistenciasEsperadas)
    .set({
      estado: "confirmada",
      entradaReal: `${fecha}T${entradaReal}:00`,
      salidaReal: `${fecha}T${modelo.salida}:00`,
      minutosTrabajados: minutosEntre(entradaReal, modelo.salida),
    })
    .where(and(eq(schema.asistenciasEsperadas.idHuellero, idHuellero), eq(schema.asistenciasEsperadas.fecha, fecha)))
    .returning({ id: schema.asistenciasEsperadas.id });
  if (!fila) return;
  if (extras.tardanzaMin) {
    await db.insert(schema.tardanzas).values({ asistenciaId: fila.id, minutosDeTardanza: extras.tardanzaMin, minutosPenalizados: 0, politicaVersion: 1 });
  }
  if (extras.horaExtra) {
    await db.insert(schema.horasExtra).values({ asistenciaId: fila.id, minutosAl25: 45, minutosAl35: 0, estado: extras.horaExtra });
  }
}

async function confirmarSemanaLaboral(db: Db, idHuellero: string, modelo: { entrada: string; salida: string }, semana: string): Promise<void> {
  for (const fecha of diasDeLaSemana(semana).slice(0, 6)) {
    await marcarConfirmada(db, idHuellero, fecha, modelo, {});
  }
}

async function marcarManual(
  db: Db,
  idHuellero: string,
  fecha: string,
  tipo: "falta" | "descanso" | "feriado" | "vacaciones" | "permiso" | "suspension",
  responsableId: string,
): Promise<void> {
  const [fila] = await db.update(schema.asistenciasEsperadas)
    .set({ estado: "manual" })
    .where(and(eq(schema.asistenciasEsperadas.idHuellero, idHuellero), eq(schema.asistenciasEsperadas.fecha, fecha)))
    .returning({ id: schema.asistenciasEsperadas.id });
  if (!fila) return;
  await db.insert(schema.estadosManuales).values({ asistenciaId: fila.id, tipo, comentario: "Sembrado por sembrar-base", responsableId });
}

// Marcas del huellero incompletas para un día que sigue `pendiente`: en el calendario
// de asistencias se ve como "Pendiente de revisión" (hay marcas, pero no permiten
// proponer entrada y salida completas).
async function marcarPendienteDeRevision(db: Db, idHuellero: string, fecha: string, sede: string, usuarioId: string): Promise<void> {
  const [importacion] = await db.insert(schema.importacionesSemanales).values({
    sede, semana: SEMANA_ACTUAL, archivoNombre: "demo-huellero.xlsx",
    archivoUbicacion: "demo/demo-huellero.xlsx", archivoHashSha256: "0".repeat(64), usuarioId,
  }).returning({ id: schema.importacionesSemanales.id });
  await db.insert(schema.marcasCrudas).values({ importacionId: importacion.id, idHuellero, fecha, instante: `${fecha}T08:57:00` });
}

async function verificarInvariantes(pool: Pool): Promise<void> {
  const fallos: string[] = [];
  const ultimoDiaSemana = diasDeLaSemana(SEMANA_ACTUAL).at(-1);

  const { rows: [sinSede] } = await pool.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM colaboradores c LEFT JOIN sedes s ON s.nombre = c.sede WHERE s.nombre IS NULL",
  );
  if (Number(sinSede.n) > 0) fallos.push(`${sinSede.n} colaborador(es) con sede inexistente`);

  const { rows: [abiertos] } = await pool.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM periodos_planilla WHERE estado = 'abierto' AND inicio <= $1 AND fin >= $1",
    [iso(hoy)],
  );
  if (Number(abiertos.n) !== 1) fallos.push(`se esperaba 1 período abierto cubriendo hoy, hay ${abiertos.n}`);

  const { rows: [anterior] } = await pool.query<{ estado: string }>(
    "SELECT estado FROM periodos_planilla WHERE inicio = $1",
    [PERIODO_ANTERIOR.inicio],
  );
  if (anterior?.estado !== "cerrado") fallos.push("el período del mes anterior no quedó cerrado");

  for (const idHuellero of ["DEMO-BETO", "DEMO-CARLA", "DEMO-DARIO"]) {
    const { rows: [turnos] } = await pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM turnos_publicados WHERE id_huellero = $1 AND fecha >= $2 AND fecha <= $3",
      [idHuellero, SEMANA_ACTUAL, ultimoDiaSemana],
    );
    if (Number(turnos.n) !== 7) fallos.push(`${idHuellero} debería tener 7 turnos en la semana actual, tiene ${turnos.n}`);
  }

  const { rows: [procesados] } = await pool.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM horarios_semanales_procesados WHERE id_huellero IN ('DEMO-DARIO', 'DEMO-ELENA')",
  );
  if (Number(procesados.n) !== 2) fallos.push(`se esperaban 2 semanas procesadas, hay ${procesados.n}`);

  if (fallos.length) throw new Error(`Invariantes del seed no se cumplen:\n- ${fallos.join("\n- ")}`);
}

function resumen(): string {
  return [
    "Seed de demo aplicado.",
    "",
    "Cuentas (usuario / contraseña):",
    ...CUENTAS.map((cuenta) => `  ${cuenta.nombreUsuario} / ${cuenta.contrasena}  (${cuenta.rol})`),
    "",
    `Semana de actividad (grupo tiendas): ${SEMANA_ACTUAL}`,
    "  Ana Borrador     -> Borrador editable",
    "  Beto Publicado   -> Publicado",
    "  Carla Cambios    -> Cambios sin publicar (miércoles)",
    "  Darío Liquidado  -> Liquidado",
    `Período ${PERIODO_ANTERIOR.inicio}..${PERIODO_ANTERIOR.fin}: cerrado (Elena publicada + procesada)`,
    `Período ${PERIODO_ACTUAL.inicio}..${PERIODO_ACTUAL.fin}: abierto`,
    "",
    "Calendario de asistencias de Beto Publicado (mes actual):",
    "  lun/mar -> Registrada ; mié -> Registrada (Feriado) ; jue -> Pendiente de revisión ; vie/sáb -> Esperada",
    "  Elena Sotelo, mes anterior -> Liquidado (período cerrado)",
  ].join("\n");
}

async function main(): Promise<void> {
  const url = urlDeArgumentos();
  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool, schema });

  const cuentas = new RepositorioPostgresDeCuentas(db);
  const colaboradores = new RepositorioPostgresDeColaboradores(db);
  const modelos = new RepositorioPostgresDeModelosDeHorario(db);
  const tardanzas = new RepositorioPostgresDeTardanzas(db);
  const turnos = new RepositorioPostgresDeTurnos(db);

  try {
    await limpiar(pool);

    // --- Cuentas (caso de uso: hashea la contraseña con argon2) ---
    for (const cuenta of CUENTAS) {
      await provisionarCuentaLocal(cuentas, cuenta, hashDeContrasena);
    }
    const admin = await cuentas.buscarPorNombreUsuario("admin");
    const finanzas = await cuentas.buscarPorNombreUsuario("finanzas");
    if (!admin || !finanzas) throw new Error("No se pudieron leer las cuentas recién creadas.");
    const actorAdmin: Actor = { id: admin.id, rol: "administracion" };
    const actorOperaciones: Actor = { id: admin.id, rol: "operaciones" };

    // --- Sedes (mismo camino que `configuracion/actions.ts`: insert directo) ---
    await db.insert(schema.sedes).values([
      { nombre: SEDES.benavides, activa: true, equipoOperativo: "tiendas" },
      { nombre: SEDES.sanIsidro, activa: true, equipoOperativo: "tiendas" },
      { nombre: SEDES.taller, activa: true, equipoOperativo: "taller" },
      { nombre: SEDES.administracion, activa: true, equipoOperativo: null }, // sin grupo hasta #38/#40/#41
      { nombre: SEDES.depositoInactivo, activa: false, equipoOperativo: null },
    ]);

    // --- Modelos de horario (caso de uso: valida las horas) ---
    for (const modelo of MODELOS) {
      await crearModeloDeHorario(modelos, actorAdmin, modelo);
    }

    // --- Política de tardanzas: una vigente por sede activa ---
    for (const sede of [SEDES.benavides, SEDES.sanIsidro, SEDES.taller, SEDES.administracion]) {
      await configurarPoliticaDePenalizacionPorTardanzas(tardanzas, actorAdmin, {
        sede, toleranciaEnMinutos: 10, tardanzasAcumuladas: 3, horasPenalizadas: 1, version: 1, vigenteDesde: PERIODO_ANTERIOR.inicio,
      });
    }

    // --- Colaboradores (caso de uso: valida permiso e id único) ---
    for (const colaborador of COLABORADORES) {
      await registrarColaborador(colaboradores, actorAdmin, colaborador);
    }

    // --- Períodos: ambos abiertos al principio para poder publicar dentro ---
    await db.insert(schema.periodosPlanilla).values([
      { inicio: PERIODO_ANTERIOR.inicio, fin: PERIODO_ANTERIOR.fin, estado: "abierto" },
      { inicio: PERIODO_ACTUAL.inicio, fin: PERIODO_ACTUAL.fin, estado: "abierto" },
    ]);

    // --- Actividad: semana del mes actual, grupo tiendas ---
    // Beto -> Publicado ; Carla -> Publicado con una celda editada ; Darío -> Liquidado
    await turnos.publicarEnLote(turnosDeSemana("DEMO-BETO", SEDES.benavides, SEMANA_ACTUAL), actorOperaciones);
    await turnos.publicarEnLote(turnosDeSemana("DEMO-CARLA", SEDES.benavides, SEMANA_ACTUAL), actorOperaciones);
    await turnos.publicarEnLote(turnosDeSemana("DEMO-DARIO", SEDES.sanIsidro, SEMANA_ACTUAL), actorOperaciones);
    // `registrarProcesamiento` exige la semana con las asistencias laborales resueltas.
    await confirmarSemanaLaboral(db, "DEMO-DARIO", modeloApertura(SEDES.sanIsidro), SEMANA_ACTUAL);
    await turnos.registrarProcesamiento({ idHuellero: "DEMO-DARIO", semana: SEMANA_ACTUAL, equipo: "tiendas", responsableId: finanzas.id });

    // Plan borrador del grupo tiendas: Ana (6 celdas, sin publicar -> Borrador editable) y
    // Carla (6 celdas = publicado salvo el miércoles con otro modelo -> Cambios sin publicar).
    const plan = await turnos.obtenerOCrear(SEMANA_ACTUAL, "tiendas");
    const diasActual = diasDeLaSemana(SEMANA_ACTUAL);
    const aperturaBenavides = modeloApertura(SEDES.benavides);
    const cierreBenavides = modeloCierre(SEDES.benavides);
    const celdasAna = diasActual.slice(0, 6).map((fecha) => ({
      planId: plan.id, idHuellero: "DEMO-ANA", fecha, sede: SEDES.benavides,
      modeloHorarioId: aperturaBenavides.id, entradaProgramada: aperturaBenavides.entrada, salidaProgramada: aperturaBenavides.salida, descanso: false,
    }));
    const celdasCarla = diasActual.slice(0, 6).map((fecha, indice) => {
      const modelo = indice === 2 ? cierreBenavides : aperturaBenavides; // miércoles editado
      return {
        planId: plan.id, idHuellero: "DEMO-CARLA", fecha, sede: SEDES.benavides,
        modeloHorarioId: modelo.id, entradaProgramada: modelo.entrada, salidaProgramada: modelo.salida, descanso: false,
      };
    });
    await turnos.guardarCeldas([...celdasAna, ...celdasCarla]);

    // --- Mes anterior con período cerrado (Elena publicada + procesada, luego se cierra) ---
    await turnos.publicarEnLote(turnosDeSemana("DEMO-ELENA", SEDES.sanIsidro, SEMANA_ANTERIOR), actorOperaciones);
    await confirmarSemanaLaboral(db, "DEMO-ELENA", modeloApertura(SEDES.sanIsidro), SEMANA_ANTERIOR);
    await turnos.registrarProcesamiento({ idHuellero: "DEMO-ELENA", semana: SEMANA_ANTERIOR, equipo: "tiendas", responsableId: finanzas.id });
    await db.update(schema.periodosPlanilla)
      .set({ estado: "cerrado", cerradoPorId: finanzas.id, cerradoEn: new Date() })
      .where(eq(schema.periodosPlanilla.inicio, PERIODO_ANTERIOR.inicio));

    // --- Asistencias en sus estados actuales (pendiente / confirmada / manual) + tardanza + hora extra.
    // Sin caso de uso limpio para fabricar estos estados; escritura directa.
    const [lun, mar, mie] = diasActual;
    await marcarConfirmada(db, "DEMO-BETO", lun, aperturaBenavides, { tardanzaMin: 18 });
    await marcarConfirmada(db, "DEMO-BETO", mar, aperturaBenavides, { horaExtra: "aprobada" });
    await marcarConfirmada(db, "DEMO-CARLA", lun, aperturaBenavides, { horaExtra: "pendiente" });
    await marcarManual(db, "DEMO-BETO", mie, "feriado", finanzas.id);
    await marcarPendienteDeRevision(db, "DEMO-BETO", diasActual[3], SEDES.benavides, finanzas.id);
    // Beto: lun/mar Registrada, mié Registrada (feriado), jue Pendiente de revisión, vie/sáb Esperada.
    // Darío ya quedó todo confirmado (semana liquidada).

    await verificarInvariantes(pool);
    console.log(resumen());
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
