import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { hashDeContrasena } from "@/autenticacion/contrasenas";
import { provisionarCuentaLocal } from "@/autenticacion/provisionar-cuenta-local";
import { RepositorioPostgresDeCuentas } from "@/autenticacion/repositorio-postgres";
import { asignarGerenteAGrupo } from "@/autenticacion/gestionar-cuentas";
import type { Actor } from "@/autenticacion/permisos";
import { registrarColaborador } from "@/colaboradores/registrar-colaborador";
import { confirmarCese, confirmarIngreso, registrarCese, registrarIngreso } from "@/relaciones-laborales/gestionar-relaciones-laborales";
import { RepositorioPostgresDeRelacionesLaborales } from "@/relaciones-laborales/repositorio-postgres";
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

const GRUPOS = {
  tiendas: "Tiendas",
  taller: "Taller",
  administracion: "Administración",
};
const NOMBRES_DE_GRUPO = Object.values(GRUPOS);

// Una cuenta por rol, con la clave igual al nombre de usuario. Los gerentes de área ejemplifican
// el modelo del ADR 0012: uno con varios grupos, uno cuyo único grupo (Administración) no gestiona
// asistencia y uno sin grupos asignados (como queda una cuenta «operaciones» migrada).
const CUENTAS = [
  { nombreUsuario: "admin", contrasena: "admin", rol: "administrador" },
  { nombreUsuario: "finanzas", contrasena: "finanzas", rol: "finanzas" },
  { nombreUsuario: "rrhh", contrasena: "rrhh", rol: "recursos_humanos" },
  { nombreUsuario: "gerente-tiendas", contrasena: "gerente-tiendas", rol: "gerente_de_area" },
  { nombreUsuario: "gerente-administracion", contrasena: "gerente-administracion", rol: "gerente_de_area" },
  { nombreUsuario: "gerente-sin-grupos", contrasena: "gerente-sin-grupos", rol: "gerente_de_area" },
] as const;

const GERENTES_POR_GRUPO = [
  { gerente: "gerente-tiendas", grupo: GRUPOS.tiendas },
  { gerente: "gerente-tiendas", grupo: GRUPOS.taller },
  { gerente: "gerente-administracion", grupo: GRUPOS.administracion },
] as const;

// Los DNI de demo comparten este patrón (99900001…99900011) para poder limpiarlos al resembrar.
const PATRON_DNI_DEMO = "999000__";

const COLABORADORES = [
  { dni: "99900001", nombre: "Ana Borrador", sede: SEDES.benavides, grupo: GRUPOS.tiendas, activo: true },
  { dni: "99900002", nombre: "Beto Publicado", sede: SEDES.benavides, grupo: GRUPOS.tiendas, activo: true },
  { dni: "99900003", nombre: "Carla Cambios", sede: SEDES.benavides, grupo: GRUPOS.tiendas, activo: true },
  { dni: "99900004", nombre: "Darío Liquidado", sede: SEDES.sanIsidro, grupo: GRUPOS.tiendas, activo: true },
  { dni: "99900005", nombre: "Elena Sotelo", sede: SEDES.sanIsidro, grupo: GRUPOS.tiendas, activo: true },
  { dni: "99900006", nombre: "Eva Confirmable", sede: SEDES.benavides, grupo: GRUPOS.tiendas, activo: true },
  { dni: "99900007", nombre: "Franco Díaz", sede: SEDES.taller, grupo: GRUPOS.taller, activo: true },
  { dni: "99900008", nombre: "Gabriela Pérez", sede: SEDES.taller, grupo: GRUPOS.taller, activo: true },
  { dni: "99900009", nombre: "Hugo Marín", sede: SEDES.administracion, grupo: GRUPOS.administracion, activo: true },
  { dni: "99900010", nombre: "Inés Quispe", sede: SEDES.administracion, grupo: GRUPOS.administracion, activo: true },
  { dni: "99900011", nombre: "Nico Inactivo", sede: SEDES.benavides, grupo: GRUPOS.tiendas, activo: false },
  // Casos de relación laboral (#109): ingreso a mitad de semana, reingreso e ingreso sin confirmar.
  { dni: "99900012", nombre: "Julia Ingreso", sede: SEDES.benavides, grupo: GRUPOS.tiendas, activo: true },
  { dni: "99900013", nombre: "Karen Reingreso", sede: SEDES.benavides, grupo: GRUPOS.tiendas, activo: true },
  { dni: "99900014", nombre: "Luis Pendiente", sede: SEDES.benavides, grupo: GRUPOS.tiendas, activo: true },
];

// Relaciones laborales: todas las personas de demo tienen una relación confirmada desde esta fecha,
// salvo las de los tres casos de arriba (ver `registrarRelacionesLaborales`).
const INGRESO_DE_DEMO = "2020-01-06";
const DNI_CON_RELACION_ESPECIAL = ["99900012", "99900013", "99900014"];

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
    DELETE FROM horas_extra WHERE asistencia_id IN (SELECT id FROM asistencias_esperadas WHERE dni LIKE '${PATRON_DNI_DEMO}');
    DELETE FROM tardanzas WHERE asistencia_id IN (SELECT id FROM asistencias_esperadas WHERE dni LIKE '${PATRON_DNI_DEMO}');
    DELETE FROM estados_manuales WHERE asistencia_id IN (SELECT id FROM asistencias_esperadas WHERE dni LIKE '${PATRON_DNI_DEMO}');
    DELETE FROM ajustes_de_asistencia WHERE asistencia_id IN (SELECT id FROM asistencias_esperadas WHERE dni LIKE '${PATRON_DNI_DEMO}');
    DELETE FROM asistencias_esperadas WHERE dni LIKE '${PATRON_DNI_DEMO}';
    DELETE FROM incidencias_de_importacion WHERE dni LIKE '${PATRON_DNI_DEMO}';
    DELETE FROM marcas_crudas WHERE dni LIKE '${PATRON_DNI_DEMO}';
    DELETE FROM importaciones_semanales WHERE sede IN (${sedes});
    DELETE FROM historial_turnos_publicados WHERE turno_publicado_id IN (SELECT id FROM turnos_publicados WHERE dni LIKE '${PATRON_DNI_DEMO}');
    DELETE FROM turnos_publicados WHERE dni LIKE '${PATRON_DNI_DEMO}';
    DELETE FROM horarios_semanales_procesados WHERE dni LIKE '${PATRON_DNI_DEMO}';
    DELETE FROM celdas_planes_semanales_en_borrador WHERE dni LIKE '${PATRON_DNI_DEMO}';
    DELETE FROM planes_semanales_en_borrador WHERE semana IN ('${SEMANA_ACTUAL}', '${SEMANA_ANTERIOR}');
    DELETE FROM auditoria_modelos_de_horario WHERE modelo_id IN (SELECT id FROM modelos_de_horario WHERE sede IN (${sedes}));
    DELETE FROM modelos_de_horario WHERE sede IN (${sedes});
    DELETE FROM politicas_de_penalizacion_por_tardanzas WHERE sede IN (${sedes});
    DELETE FROM auditoria_periodos_planilla WHERE periodo_id IN (SELECT id FROM periodos_planilla WHERE inicio IN ('${PERIODO_ACTUAL.inicio}', '${PERIODO_ANTERIOR.inicio}'));
    DELETE FROM periodos_planilla WHERE inicio IN ('${PERIODO_ACTUAL.inicio}', '${PERIODO_ANTERIOR.inicio}');
    DELETE FROM relaciones_laborales WHERE dni LIKE '${PATRON_DNI_DEMO}';
    DELETE FROM colaboradores WHERE dni LIKE '${PATRON_DNI_DEMO}';
    DELETE FROM sedes WHERE nombre IN (${sedes});
    DELETE FROM gerentes_de_grupo WHERE cuenta_id IN (SELECT id FROM cuentas_locales WHERE nombre_usuario IN (${usuarios}));
    DELETE FROM grupos WHERE nombre IN (${NOMBRES_DE_GRUPO.map((nombre) => `'${nombre.replace(/'/g, "''")}'`).join(", ")});
    DELETE FROM sesiones WHERE cuenta_id IN (SELECT id FROM cuentas_locales WHERE nombre_usuario IN (${usuarios}));
    DELETE FROM cuentas_locales WHERE nombre_usuario IN (${usuarios});
    COMMIT;
  `);
}

async function registrarRelacionesLaborales(db: Db, actor: Actor): Promise<void> {
  const repositorio = new RepositorioPostgresDeRelacionesLaborales(db);
  const lunes = diasDeLaSemana(SEMANA_ACTUAL);
  const confirmada = async (dni: string, ingreso: string, cese?: string) => {
    const relacion = await registrarIngreso(repositorio, actor, { dni, ingreso });
    await confirmarIngreso(repositorio, actor, relacion.id);
    if (cese) {
      await registrarCese(repositorio, actor, relacion.id, cese);
      await confirmarCese(repositorio, actor, relacion.id);
    }
    return relacion;
  };
  for (const { dni } of COLABORADORES.filter(({ dni }) => !DNI_CON_RELACION_ESPECIAL.includes(dni))) await confirmada(dni, INGRESO_DE_DEMO);
  // Julia ingresa el miércoles de la semana de actividad: lunes y martes quedan «Sin relación laboral».
  await confirmada("99900012", lunes[2]);
  // Karen tuvo una relación que terminó y reingresó el martes de la semana de actividad (mismo DNI, otra relación).
  await confirmada("99900013", "2024-02-05", "2025-12-31");
  await confirmada("99900013", lunes[1]);
  // Luis tiene el ingreso registrado pero Recursos Humanos aún no lo confirmó: no se le pueden publicar horarios.
  await registrarIngreso(repositorio, actor, { dni: "99900014", ingreso: lunes[0] });
}

function turnosDeSemana(dni: string, sede: string, semana: string) {
  const modelo = modeloApertura(sede);
  return diasDeLaSemana(semana).map((fecha, indice) => indice === 6
    ? { dni, fecha, sede: null, modeloHorarioId: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "descanso" as const }
    : { dni, fecha, sede, modeloHorarioId: modelo.id, entradaProgramada: modelo.entrada, salidaProgramada: modelo.salida, descanso: false, motivoNoAsistencia: null });
}

async function marcarConfirmada(
  db: Db,
  dni: string,
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
    .where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, fecha)))
    .returning({ id: schema.asistenciasEsperadas.id });
  if (!fila) return;
  if (extras.tardanzaMin) {
    await db.insert(schema.tardanzas).values({ asistenciaId: fila.id, minutosDeTardanza: extras.tardanzaMin, minutosPenalizados: 0, politicaVersion: 1 });
  }
  if (extras.horaExtra) {
    await db.insert(schema.horasExtra).values({ asistenciaId: fila.id, minutosAl25: 45, minutosAl35: 0, estado: extras.horaExtra });
  }
}

async function confirmarSemanaLaboral(db: Db, dni: string, modelo: { entrada: string; salida: string }, semana: string): Promise<void> {
  for (const fecha of diasDeLaSemana(semana).slice(0, 6)) {
    await marcarConfirmada(db, dni, fecha, modelo, {});
  }
}

async function marcarManual(
  db: Db,
  dni: string,
  fecha: string,
  tipo: "falta" | "descanso" | "feriado" | "vacaciones" | "permiso" | "suspension",
  responsableId: string,
): Promise<void> {
  const [fila] = await db.update(schema.asistenciasEsperadas)
    .set({ estado: "manual" })
    .where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, fecha)))
    .returning({ id: schema.asistenciasEsperadas.id });
  if (!fila) return;
  await db.insert(schema.estadosManuales).values({ asistenciaId: fila.id, tipo, comentario: "Sembrado por sembrar-base", responsableId });
}

// Marcas del huellero incompletas para un día que sigue `pendiente`: en el calendario
// de asistencias se ve como "Pendiente de revisión" (hay marcas, pero no permiten
// proponer entrada y salida completas).
async function marcarPendienteDeRevision(db: Db, dni: string, fecha: string, sede: string, usuarioId: string): Promise<void> {
  const [importacion] = await db.insert(schema.importacionesSemanales).values({
    sede, semana: SEMANA_ACTUAL, archivoNombre: "demo-huellero.xlsx",
    archivoUbicacion: "demo/demo-huellero.xlsx", archivoHashSha256: "0".repeat(64), usuarioId,
  }).returning({ id: schema.importacionesSemanales.id });
  await db.insert(schema.marcasCrudas).values({ importacionId: importacion.id, dni, fecha, instante: `${fecha}T08:57:00` });
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

  for (const dni of ["99900002", "99900003", "99900004", "99900006"]) {
    const { rows: [turnos] } = await pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM turnos_publicados WHERE dni = $1 AND fecha >= $2 AND fecha <= $3",
      [dni, SEMANA_ACTUAL, ultimoDiaSemana],
    );
    if (Number(turnos.n) !== 7) fallos.push(`${dni} debería tener 7 turnos en la semana actual, tiene ${turnos.n}`);
  }

  const { rows: [procesados] } = await pool.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM horarios_semanales_procesados WHERE dni IN ('99900004', '99900005')",
  );
  if (Number(procesados.n) !== 2) fallos.push(`se esperaban 2 semanas procesadas, hay ${procesados.n}`);

  const { rows: [relaciones] } = await pool.query<{ confirmadas: string; porConfirmar: string; karen: string }>(
    `SELECT count(*) FILTER (WHERE ingreso_confirmado_en IS NOT NULL)::text AS confirmadas,
            count(*) FILTER (WHERE ingreso_confirmado_en IS NULL)::text AS "porConfirmar",
            count(*) FILTER (WHERE dni = '99900013')::text AS karen
       FROM relaciones_laborales WHERE dni LIKE '${PATRON_DNI_DEMO}'`,
  );
  if (Number(relaciones.porConfirmar) !== 1) fallos.push(`se esperaba 1 ingreso por confirmar, hay ${relaciones.porConfirmar}`);
  if (Number(relaciones.karen) !== 2) fallos.push(`Karen debería tener 2 relaciones laborales, tiene ${relaciones.karen}`);
  if (Number(relaciones.confirmadas) !== COLABORADORES.length) fallos.push(`se esperaban ${COLABORADORES.length} relaciones con ingreso confirmado (una por persona más el reingreso, menos Luis), hay ${relaciones.confirmadas}`);

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
    "  Eva Confirmable  -> Lista para confirmar por rango",
    `Período ${PERIODO_ANTERIOR.inicio}..${PERIODO_ANTERIOR.fin}: cerrado (Elena publicada + procesada)`,
    `Período ${PERIODO_ACTUAL.inicio}..${PERIODO_ACTUAL.fin}: abierto`,
    "",
    "Relaciones laborales (rrhh / rrhh):",
    "  Julia Ingreso    -> ingresa el miércoles de la semana de actividad (lun/mar = «Sin relación laboral»)",
    "  Karen Reingreso  -> dos relaciones con el mismo DNI; reingresó el martes de la semana de actividad",
    "  Luis Pendiente   -> ingreso sin confirmar: no se le puede publicar el horario",
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
    const gerenteTiendas = await cuentas.buscarPorNombreUsuario("gerente-tiendas");
    if (!admin || !finanzas || !gerenteTiendas) throw new Error("No se pudieron leer las cuentas recién creadas.");
    const actorAdmin: Actor = { id: admin.id, rol: "administrador" };
    const actorFinanzas: Actor = { id: finanzas.id, rol: "finanzas" };
    const rrhh = await cuentas.buscarPorNombreUsuario("rrhh");
    if (!rrhh) throw new Error("No se pudo leer la cuenta de Recursos Humanos.");
    const actorRrhh: Actor = { id: rrhh.id, rol: "recursos_humanos" };
    const actorGerenteDeTiendas: Actor = { id: gerenteTiendas.id, rol: "gerente_de_area", grupos: GERENTES_POR_GRUPO.filter(({ gerente }) => gerente === "gerente-tiendas").map(({ grupo }) => ({ nombre: grupo, gestionaAsistencia: true })) };

    // --- Sedes (mismo camino que `configuracion/actions.ts`: insert directo) ---
    // Administración entra en planilla pero no marca: queda fuera de horarios y asistencias (ADR 0012).
    await db.insert(schema.grupos).values(NOMBRES_DE_GRUPO.map((nombre) => ({ nombre, gestionaAsistencia: nombre !== GRUPOS.administracion })));
    await db.insert(schema.sedes).values([
      { nombre: SEDES.benavides, activa: true, grupo: GRUPOS.tiendas },
      { nombre: SEDES.sanIsidro, activa: true, grupo: GRUPOS.tiendas },
      { nombre: SEDES.taller, activa: true, grupo: GRUPOS.taller },
      { nombre: SEDES.administracion, activa: true, grupo: GRUPOS.administracion },
      { nombre: SEDES.depositoInactivo, activa: false, grupo: null }, // sede inactiva, sin colaboradores: no necesita grupo
    ]);

    // --- Gerentes por grupo (caso de uso: Finanzas asigna) ---
    for (const { gerente, grupo } of GERENTES_POR_GRUPO) {
      const cuenta = await cuentas.buscarPorNombreUsuario(gerente);
      if (!cuenta) throw new Error(`No se pudo leer la cuenta ${gerente}.`);
      await asignarGerenteAGrupo(cuentas, actorFinanzas, grupo, cuenta.id);
    }

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

    // --- Relaciones laborales (casos de uso: las registra y confirma Recursos Humanos) ---
    await registrarRelacionesLaborales(db, actorRrhh);

    // --- Períodos: ambos abiertos al principio para poder publicar dentro ---
    await db.insert(schema.periodosPlanilla).values([
      { inicio: PERIODO_ANTERIOR.inicio, fin: PERIODO_ANTERIOR.fin, estado: "abierto" },
      { inicio: PERIODO_ACTUAL.inicio, fin: PERIODO_ACTUAL.fin, estado: "abierto" },
    ]);

    // --- Actividad: semana del mes actual, grupo tiendas ---
    // Beto -> Publicado ; Carla -> Publicado con una celda editada ; Darío -> Liquidado
    await turnos.publicarEnLote(turnosDeSemana("99900002", SEDES.benavides, SEMANA_ACTUAL), actorGerenteDeTiendas);
    await turnos.publicarEnLote(turnosDeSemana("99900003", SEDES.benavides, SEMANA_ACTUAL), actorGerenteDeTiendas);
    await turnos.publicarEnLote(turnosDeSemana("99900004", SEDES.sanIsidro, SEMANA_ACTUAL), actorGerenteDeTiendas);
    await turnos.publicarEnLote(turnosDeSemana("99900006", SEDES.benavides, SEMANA_ACTUAL), actorGerenteDeTiendas);
    for (const fecha of diasDeLaSemana(SEMANA_ACTUAL).slice(0, 6)) {
      await db.update(schema.asistenciasEsperadas).set({
        entradaPropuesta: `${fecha}T08:02:00`,
        salidaPropuesta: `${fecha}T16:20:00`,
      }).where(and(eq(schema.asistenciasEsperadas.dni, "99900006"), eq(schema.asistenciasEsperadas.fecha, fecha)));
    }
    // `registrarProcesamiento` exige la semana con las asistencias laborales resueltas.
    await confirmarSemanaLaboral(db, "99900004", modeloApertura(SEDES.sanIsidro), SEMANA_ACTUAL);
    await turnos.registrarProcesamiento({ dni: "99900004", semana: SEMANA_ACTUAL, equipo: "Tiendas", responsableId: finanzas.id });

    // Plan borrador del grupo tiendas: Ana (6 celdas, sin publicar -> Borrador editable) y
    // Carla (6 celdas = publicado salvo el miércoles con otro modelo -> Cambios sin publicar).
    const plan = await turnos.obtenerOCrear(SEMANA_ACTUAL, "Tiendas");
    const diasActual = diasDeLaSemana(SEMANA_ACTUAL);
    const aperturaBenavides = modeloApertura(SEDES.benavides);
    const cierreBenavides = modeloCierre(SEDES.benavides);
    const celdasAna = diasActual.slice(0, 6).map((fecha) => ({
      planId: plan.id, dni: "99900001", fecha, sede: SEDES.benavides,
      modeloHorarioId: aperturaBenavides.id, entradaProgramada: aperturaBenavides.entrada, salidaProgramada: aperturaBenavides.salida, descanso: false,
    }));
    const celdasCarla = diasActual.slice(0, 6).map((fecha, indice) => {
      const modelo = indice === 2 ? cierreBenavides : aperturaBenavides; // miércoles editado
      return {
        planId: plan.id, dni: "99900003", fecha, sede: SEDES.benavides,
        modeloHorarioId: modelo.id, entradaProgramada: modelo.entrada, salidaProgramada: modelo.salida, descanso: false,
      };
    });
    await turnos.guardarCeldas([...celdasAna, ...celdasCarla]);

    // --- Mes anterior con período cerrado (Elena publicada + procesada, luego se cierra) ---
    await turnos.publicarEnLote(turnosDeSemana("99900005", SEDES.sanIsidro, SEMANA_ANTERIOR), actorGerenteDeTiendas);
    await confirmarSemanaLaboral(db, "99900005", modeloApertura(SEDES.sanIsidro), SEMANA_ANTERIOR);
    await turnos.registrarProcesamiento({ dni: "99900005", semana: SEMANA_ANTERIOR, equipo: "Tiendas", responsableId: finanzas.id });
    await db.update(schema.periodosPlanilla)
      .set({ estado: "cerrado", cerradoPorId: finanzas.id, cerradoEn: new Date() })
      .where(eq(schema.periodosPlanilla.inicio, PERIODO_ANTERIOR.inicio));

    // --- Asistencias en sus estados actuales (pendiente / confirmada / manual) + tardanza + hora extra.
    // Sin caso de uso limpio para fabricar estos estados; escritura directa.
    const [lun, mar, mie] = diasActual;
    await marcarConfirmada(db, "99900002", lun, aperturaBenavides, { tardanzaMin: 18 });
    await marcarConfirmada(db, "99900002", mar, aperturaBenavides, { horaExtra: "aprobada" });
    await marcarConfirmada(db, "99900003", lun, aperturaBenavides, { horaExtra: "pendiente" });
    await marcarManual(db, "99900002", mie, "feriado", finanzas.id);
    await marcarPendienteDeRevision(db, "99900002", diasActual[3], SEDES.benavides, finanzas.id);
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
