import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { and, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { hashDeContrasena } from "@/autenticacion/contrasenas";
import { provisionarCuentaLocal } from "@/autenticacion/provisionar-cuenta-local";
import { RepositorioPostgresDeCuentas } from "@/autenticacion/repositorio-postgres";
import { asignarGerenteAGrupo } from "@/autenticacion/gestionar-cuentas";
import type { Actor } from "@/autenticacion/permisos";
import { registrarColaborador } from "@/colaboradores/registrar-colaborador";
import { registrarCondicionLaboral } from "@/condiciones-laborales/gestionar-condiciones-laborales";
import { RepositorioPostgresDeCondicionesLaborales } from "@/condiciones-laborales/repositorio-postgres";
import { registrarAbonoVacacional } from "@/fuentes-externas/abonos-vacacionales";
import { confirmarFuente, registrarImporte } from "@/fuentes-externas/gestionar-fuentes-externas";
import { RepositorioPostgresDeFuentesExternas } from "@/fuentes-externas/repositorio-postgres";
import { activarReglaLegal } from "@/reglas-legales/gestionar-reglas-legales";
import { RepositorioPostgresDeReglasLegales } from "@/reglas-legales/repositorio-postgres";
import { confirmarCese, confirmarIngreso, registrarCese, registrarIngreso } from "@/relaciones-laborales/gestionar-relaciones-laborales";
import { RepositorioPostgresDeRelacionesLaborales } from "@/relaciones-laborales/repositorio-postgres";
import { RepositorioPostgresDeColaboradores } from "@/colaboradores/repositorio-postgres";
import * as schema from "@/db/schema";
import { RepositorioPostgresDePeriodos } from "@/periodos/repositorio-postgres";
import { construirHechosDiarios } from "@/periodos/hechos-de-asistencia-postgres";
import { configurarPoliticaDePenalizacionPorTardanzas } from "@/tardanzas/politica-de-penalizacion";
import { RepositorioPostgresDeTardanzas } from "@/tardanzas/repositorio-postgres";
import { crearModeloDeHorario } from "@/turnos/gestionar-modelos-de-horario";
import { RepositorioPostgresDeModelosDeHorario } from "@/turnos/repositorio-postgres-modelos-de-horario";
import { RepositorioPostgresDeTurnos } from "@/turnos/repositorio-postgres";
import { desplazarFecha, diasDeLaSemana } from "@/turnos/semana";

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
const DNI_DE_TALLER = ["99900007", "99900008"];

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

// Franco Díaz sale de vacaciones los dos últimos días del mes anterior y los cuatro primeros del mes actual (#125). Se publican
// como jornadas «vacaciones» en el calendario, como las aprobaría su gerente; el abono se entregó dos días antes de empezar.
const DNI_DE_VACACIONES = "99900007";
const INICIO_DEL_DESCANSO = desplazarFecha(PERIODO_ANTERIOR.fin, -1);
const ABONO_VACACIONAL = { fecha: desplazarFecha(PERIODO_ANTERIOR.fin, -2), monto: "300" };
const CAMBIO_DE_SUELDO_DE_FRANCO = desplazarFecha(PERIODO_ACTUAL.inicio, 2);
const DIAS_DE_VACACIONES_EN_EL_MES_ACTUAL = 4;

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
    DELETE FROM aprobaciones_de_asistencia WHERE periodo_id IN (SELECT id FROM periodos_planilla WHERE inicio IN ('${PERIODO_ACTUAL.inicio}', '${PERIODO_ANTERIOR.inicio}'));
    DELETE FROM revisiones_periodos_planilla WHERE periodo_id IN (SELECT id FROM periodos_planilla WHERE inicio IN ('${PERIODO_ACTUAL.inicio}', '${PERIODO_ANTERIOR.inicio}'));
    DELETE FROM auditoria_periodos_planilla WHERE periodo_id IN (SELECT id FROM periodos_planilla WHERE inicio IN ('${PERIODO_ACTUAL.inicio}', '${PERIODO_ANTERIOR.inicio}'));
    DELETE FROM periodos_planilla WHERE inicio IN ('${PERIODO_ACTUAL.inicio}', '${PERIODO_ANTERIOR.inicio}');
    DELETE FROM importes_externos WHERE dni LIKE '${PATRON_DNI_DEMO}' OR registrado_por_id IN (SELECT id FROM cuentas_locales WHERE nombre_usuario IN (${usuarios}));
    DELETE FROM importaciones_de_fuente WHERE usuario_id IN (SELECT id FROM cuentas_locales WHERE nombre_usuario IN (${usuarios}));
    DELETE FROM confirmaciones_de_fuente WHERE confirmada_por_id IN (SELECT id FROM cuentas_locales WHERE nombre_usuario IN (${usuarios}));
    DELETE FROM condiciones_laborales WHERE relacion_laboral_id IN (SELECT id FROM relaciones_laborales WHERE dni LIKE '${PATRON_DNI_DEMO}');
    DELETE FROM relaciones_laborales WHERE dni LIKE '${PATRON_DNI_DEMO}';
    DELETE FROM colaboradores WHERE dni LIKE '${PATRON_DNI_DEMO}';
    DELETE FROM sedes WHERE nombre IN (${sedes});
    DELETE FROM reglas_legales WHERE activada_por_id IN (SELECT id FROM cuentas_locales WHERE nombre_usuario IN (${usuarios}));
    DELETE FROM gerentes_de_grupo WHERE cuenta_id IN (SELECT id FROM cuentas_locales WHERE nombre_usuario IN (${usuarios}));
    DELETE FROM grupos WHERE nombre IN (${NOMBRES_DE_GRUPO.map((nombre) => `'${nombre.replace(/'/g, "''")}'`).join(", ")});
    DELETE FROM sesiones WHERE cuenta_id IN (SELECT id FROM cuentas_locales WHERE nombre_usuario IN (${usuarios}));
    DELETE FROM cuentas_locales WHERE nombre_usuario IN (${usuarios});
    COMMIT;
  `);
}

function fechasDelRango(inicio: string, fin: string): string[] {
  const fechas: string[] = [];
  for (let instante = Date.parse(inicio); instante <= Date.parse(fin); instante += 86_400_000) fechas.push(iso(new Date(instante)));
  return fechas;
}

/**
 * Taller queda con la situación resuelta todo el período abierto (lunes a viernes confirmados, fines de semana de descanso):
 * el gerente puede aprobar su asistencia. Tiendas, en cambio, queda bloqueada por personas sin horario o pendientes.
 */
async function resolverAsistenciaDeTaller(db: Db, turnos: RepositorioPostgresDeTurnos, actor: Actor): Promise<void> {
  const fechas = fechasDelRango(PERIODO_ACTUAL.inicio, PERIODO_ACTUAL.fin);
  for (const dni of DNI_DE_TALLER) {
    await turnos.publicarEnLote(fechas.map((fecha, indice) => {
      const finDeSemana = [0, 6].includes(new Date(`${fecha}T00:00:00Z`).getUTCDay());
      if (dni === DNI_DE_VACACIONES && indice < DIAS_DE_VACACIONES_EN_EL_MES_ACTUAL) {
        return { dni, fecha, sede: null, entradaProgramada: null, salidaProgramada: null, motivoNoAsistencia: "vacaciones" as const };
      }
      return finDeSemana
        ? { dni, fecha, sede: null, entradaProgramada: null, salidaProgramada: null, motivoNoAsistencia: "descanso" as const }
        : { dni, fecha, sede: SEDES.taller, entradaProgramada: "07:00", salidaProgramada: "16:00", descanso: false };
    }), actor);
    await db.update(schema.asistenciasEsperadas).set({
      estado: "confirmada",
      entradaReal: sql`${schema.asistenciasEsperadas.fecha}::text || 'T07:00:00'`,
      salidaReal: sql`${schema.asistenciasEsperadas.fecha}::text || 'T16:00:00'`,
      minutosTrabajados: 540,
      instantaneaDeTurno: { sede: SEDES.taller, entradaProgramada: "07:00", salidaProgramada: "16:00", descanso: false },
      confirmadoPorId: actor.id,
      confirmadoEn: new Date(),
    }).where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.estado, "pendiente")));
  }
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

/**
 * Condiciones laborales con vigencia (#116), registradas por Finanzas con el caso de uso real. Ana tiene un cambio de
 * sueldo el día 16 del mes actual (dos vigencias en el mismo mes; antes del 16 la segunda aparece como «Programado»);
 * Beto usa AFP con esquema de comisión; Carla, REMYPE y elegibilidad familiar; Darío y Elena quedan incompletos y el
 * resto sin ningún dato, para ver «Pendiente» y «Falta: …». Karen conserva un historial por cada relación laboral.
 */
async function registrarCondicionesLaborales(db: Db, actor: Actor): Promise<void> {
  const repositorio = new RepositorioPostgresDeCondicionesLaborales(db);
  const relaciones = await repositorio.listarRelaciones();
  const sedeDe = (dni: string) => COLABORADORES.find((colaborador) => colaborador.dni === dni)!.sede;
  const relacionDe = (dni: string, ingreso?: string) => {
    const relacion = relaciones.find((candidata) => candidata.dni === dni && (!ingreso || candidata.ingreso === ingreso));
    if (!relacion) throw new Error(`El seed no encontró la relación laboral de ${dni}.`);
    return relacion;
  };
  const registrar = (relacion: { id: string; ingreso: string }, dato: string, valor: string, vigenteDesde = relacion.ingreso) =>
    registrarCondicionLaboral(repositorio, actor, { relacionId: relacion.id, dato, valor, vigenteDesde });
  const completar = async (dni: string, perfil: { afiliacion: string; esquema?: string; regimen?: string; elegible?: string; sueldo: string }) => {
    const relacion = relacionDe(dni);
    await registrar(relacion, "sueldo", perfil.sueldo);
    await registrar(relacion, "jornada_ordinaria_diaria", "8");
    await registrar(relacion, "regimen_laboral", perfil.regimen ?? "general");
    await registrar(relacion, "afiliacion_pensionaria", perfil.afiliacion);
    if (perfil.esquema) await registrar(relacion, "comision_afp", perfil.esquema);
    await registrar(relacion, "elegibilidad_familiar", perfil.elegible ?? "no");
    await registrar(relacion, "sede_de_adscripcion", sedeDe(dni));
  };

  await completar("99900001", { sueldo: "1500", afiliacion: "onp" });
  const DIA_16_DEL_MES = 15; // índice 0-based dentro del período
  const cambioDeSueldo = fechasDelRango(PERIODO_ACTUAL.inicio, PERIODO_ACTUAL.fin)[DIA_16_DEL_MES];
  await registrar(relacionDe("99900001"), "sueldo", "1800", cambioDeSueldo);
  await completar("99900002", { sueldo: "1650,50", afiliacion: "afp_integra", esquema: "mixta", elegible: "si" });
  await completar("99900003", { sueldo: "1300", afiliacion: "afp_prima", esquema: "flujo", regimen: "remype_pequena_empresa", elegible: "si" });
  await completar("99900007", { sueldo: "2200", afiliacion: "onp" });
  // Franco sube de sueldo durante su descanso vacacional: la remuneración vacacional usa 2200 y el resto de los días deja un ajuste.
  await registrar(relacionDe("99900007"), "sueldo", "2400", CAMBIO_DE_SUELDO_DE_FRANCO);
  await completar("99900009", { sueldo: "3500", afiliacion: "afp_habitat", esquema: "flujo" });
  // Incompletos: ven «Pendiente» y «Falta: …».
  await registrar(relacionDe("99900004"), "sueldo", "1400");
  await registrar(relacionDe("99900005"), "sueldo", "1450");
  await registrar(relacionDe("99900005"), "jornada_ordinaria_diaria", "7,5");
  // Karen: una relación que terminó y su reingreso, cada una con su propio historial.
  await registrar(relacionDe("99900013", "2024-02-05"), "sueldo", "1200");
  await registrar(relacionDe("99900013", diasDeLaSemana(SEMANA_ACTUAL)[1]), "sueldo", "1700");
}

const FUENTE_DE_DEMOSTRACION = "Dato de demostración (seed de revisión), no es una fuente oficial";

/**
 * Reglas legales con vigencia (#117), activadas por Finanzas con el caso de uso real. Los valores son de DEMOSTRACIÓN
 * (la fuente lo dice) y solo sirven para revisar la pantalla: la Tasa de EsSalud tiene dos vigencias, la de ONP tiene una
 * versión programada para el mes siguiente. La asignación familiar y ambas sobretasas de horas extra tienen valores
 * ficticios para que el borrador de Beto muestre el cálculo; los demás valores legales quedan pendientes.
 */
async function activarReglasLegales(db: Db, actor: Actor): Promise<void> {
  const repositorio = new RepositorioPostgresDeReglasLegales(db);
  const activar = (codigo: string, valor: string, vigenteDesde: string) =>
    activarReglaLegal(repositorio, actor, { codigo, valor, vigenteDesde, fuenteOficial: FUENTE_DE_DEMOSTRACION });
  const primeraDelMesSiguiente = desplazarFecha(PERIODO_ACTUAL.fin, 1);

  await activar("rmv", "1000", PERIODO_ANTERIOR.inicio);
  await activar("essalud_tasa", "8", PERIODO_ANTERIOR.inicio);
  await activar("essalud_tasa", "9", PERIODO_ACTUAL.inicio);
  await activar("onp_tasa", "12", PERIODO_ANTERIOR.inicio);
  await activar("onp_tasa", "13", primeraDelMesSiguiente);
  await activar("asignacion_familiar_porcentaje_de_rmv", "10", PERIODO_ANTERIOR.inicio);
  await activar("horas_extra_sobretasa_primeras_dos_horas", "25", PERIODO_ANTERIOR.inicio);
  await activar("horas_extra_sobretasa_horas_posteriores", "35", PERIODO_ANTERIOR.inicio);
}

/**
 * Fuentes externas del mes de pago actual (#118), cargadas con los casos de uso reales de Finanzas: Comisiones de ventas
 * confirmada con importes (uno con devengue del mes anterior), Adelantos confirmada sin importes (cero confirmado),
 * Movilidad con un importe sin confirmar y las demás fuentes pendientes.
 */
async function cargarFuentesExternas(db: Db, actor: Actor): Promise<void> {
  const repositorio = new RepositorioPostgresDeFuentesExternas(db);
  const mesDePago = PERIODO_ACTUAL.inicio.slice(0, 7);
  const mesDevengado = PERIODO_ANTERIOR.inicio.slice(0, 7);
  const cargar = (tipoDeFuente: string, dni: string, concepto: string, fechaDelHecho: string, mesDeDevengue: string, monto: string) =>
    registrarImporte(repositorio, actor, { tipoDeFuente, dni, concepto, fechaDelHecho, mesDeDevengue, mesDeAplicacion: mesDePago, monto });

  await cargar("comisiones_de_ventas", "99900001", "comision_de_ventas", PERIODO_ANTERIOR.fin, mesDevengado, "320,50");
  await cargar("comisiones_de_ventas", "99900002", "comision_de_ventas", PERIODO_ACTUAL.inicio, mesDePago, "150");
  await cargar("movilidad_supeditada_a_asistencia", "99900002", "movilidad_supeditada_a_asistencia", PERIODO_ACTUAL.inicio, mesDePago, "90");
  await registrarAbonoVacacional(repositorio, actor, { dni: DNI_DE_VACACIONES, fechaDelAbono: ABONO_VACACIONAL.fecha, mesDeAplicacion: mesDePago, monto: ABONO_VACACIONAL.monto });
  await confirmarFuente(repositorio, actor, { tipoDeFuente: "comisiones_de_ventas", mes: mesDePago });
  await confirmarFuente(repositorio, actor, { tipoDeFuente: "adelantos", mes: mesDePago });
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
  extras: { tardanzaMin?: number; horaExtra?: "pendiente" | "aprobada"; minutosExtra?: number },
): Promise<void> {
  const entradaReal = extras.tardanzaMin ? sumarMinutos(modelo.entrada, extras.tardanzaMin) : modelo.entrada;
  const salidaReal = extras.minutosExtra ? sumarMinutos(modelo.salida, extras.minutosExtra) : modelo.salida;
  // Como al confirmar de verdad, la asistencia conserva la instantánea del horario publicado: sin ella no se podría ajustar.
  const [turno] = await db.select().from(schema.turnosPublicados)
    .where(and(eq(schema.turnosPublicados.dni, dni), eq(schema.turnosPublicados.fecha, fecha)));
  const [fila] = await db.update(schema.asistenciasEsperadas)
    .set({
      estado: "confirmada",
      ...(turno?.sede ? { instantaneaDeTurno: { sede: turno.sede, entradaProgramada: turno.entradaProgramada, salidaProgramada: turno.salidaProgramada, descanso: false } } : {}),
      entradaReal: `${fecha}T${entradaReal}:00`,
      salidaReal: `${fecha}T${salidaReal}:00`,
      minutosTrabajados: minutosEntre(entradaReal, salidaReal),
    })
    .where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, fecha)))
    .returning({ id: schema.asistenciasEsperadas.id });
  if (!fila) return;
  if (extras.tardanzaMin) {
    await db.insert(schema.tardanzas).values({ asistenciaId: fila.id, minutosDeTardanza: extras.tardanzaMin, minutosPenalizados: 0, politicaVersion: 1 });
  }
  if (extras.horaExtra) {
    const minutosExtra = extras.minutosExtra ?? 45;
    await db.insert(schema.horasExtra).values({ asistenciaId: fila.id, minutosAl25: Math.min(minutosExtra, 120), minutosAl35: Math.max(0, minutosExtra - 120), estado: extras.horaExtra });
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

  const { rows: [condiciones] } = await pool.query<{ sueldosDeAna: string; completas: string }>(
    `SELECT count(*) FILTER (WHERE c.dato = 'sueldo' AND r.dni = '99900001' AND c.reemplazada_en IS NULL)::text AS "sueldosDeAna",
            count(DISTINCT r.id) FILTER (WHERE c.dato = 'sede_de_adscripcion')::text AS completas
       FROM condiciones_laborales c JOIN relaciones_laborales r ON r.id = c.relacion_laboral_id WHERE r.dni LIKE '${PATRON_DNI_DEMO}'`,
  );
  if (Number(condiciones.sueldosDeAna) !== 2) fallos.push(`Ana debería tener 2 vigencias de sueldo, tiene ${condiciones.sueldosDeAna}`);
  if (Number(condiciones.completas) !== 5) fallos.push(`se esperaban 5 relaciones con condiciones completas, hay ${condiciones.completas}`);

  const { rows: [reglas] } = await pool.query<{ essalud: string; onp: string }>(
    `SELECT count(*) FILTER (WHERE codigo = 'essalud_tasa' AND reemplazada_en IS NULL)::text AS essalud,
            count(*) FILTER (WHERE codigo = 'onp_tasa' AND reemplazada_en IS NULL AND vigente_desde > $1)::text AS onp
       FROM reglas_legales WHERE fuente_oficial = '${FUENTE_DE_DEMOSTRACION}'`,
    [PERIODO_ACTUAL.fin],
  );
  if (Number(reglas.essalud) !== 2) fallos.push(`la Tasa de EsSalud debería tener 2 vigencias, tiene ${reglas.essalud}`);
  if (Number(reglas.onp) !== 1) fallos.push(`la Tasa de ONP debería tener 1 versión programada, tiene ${reglas.onp}`);
  const { rows: [horaExtraDeBeto] } = await pool.query<{ minutosAl25: number; minutosAl35: number; salidaReal: string }>(
    `SELECT h.minutos_al_25 AS "minutosAl25", h.minutos_al_35 AS "minutosAl35", a.salida_real AS "salidaReal"
       FROM horas_extra h JOIN asistencias_esperadas a ON a.id = h.asistencia_id
      WHERE a.dni = '99900002' AND h.estado = 'aprobada'`,
  );
  if (horaExtraDeBeto?.minutosAl25 !== 120 || horaExtraDeBeto.minutosAl35 !== 30 || !horaExtraDeBeto.salidaReal.endsWith("18:30:00")) {
    fallos.push("Beto debería tener una hora extra aprobada de 120 minutos al 25 % y 30 al 35 %, con salida real 18:30");
  }

  const { rows: [fuentes] } = await pool.query<{ importes: string; confirmadas: string; sinImportes: string }>(
    `SELECT (SELECT count(*) FROM importes_externos WHERE dni LIKE '${PATRON_DNI_DEMO}' AND anulado_en IS NULL)::text AS importes,
            (SELECT count(*) FROM confirmaciones_de_fuente WHERE mes_de_aplicacion = $1)::text AS confirmadas,
            (SELECT count(*) FROM confirmaciones_de_fuente c WHERE mes_de_aplicacion = $1 AND NOT EXISTS (SELECT 1 FROM importes_externos i WHERE i.tipo_de_fuente = c.tipo_de_fuente AND i.mes_de_aplicacion = c.mes_de_aplicacion AND i.anulado_en IS NULL))::text AS "sinImportes"`,
    [PERIODO_ACTUAL.inicio.slice(0, 7)],
  );
  if (Number(fuentes.importes) !== 4) fallos.push(`se esperaban 4 importes externos de demo (con el abono vacacional de Franco), hay ${fuentes.importes}`);
  if (Number(fuentes.confirmadas) !== 2) fallos.push(`se esperaban 2 fuentes confirmadas, hay ${fuentes.confirmadas}`);
  if (Number(fuentes.sinImportes) !== 1) fallos.push(`se esperaba 1 fuente confirmada sin importes, hay ${fuentes.sinImportes}`);

  if (fallos.length) throw new Error(`Invariantes del seed no se cumplen:\n- ${fallos.join("\n- ")}`);
}

async function verificarAprobaciones(db: Db): Promise<void> {
  const periodos = new RepositorioPostgresDePeriodos(db);
  const fallos: string[] = [];
  const [abierto] = await db.select({ id: schema.periodosPlanilla.id }).from(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.inicio, PERIODO_ACTUAL.inicio));
  const [cerrado] = await db.select({ id: schema.periodosPlanilla.id }).from(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.inicio, PERIODO_ANTERIOR.inicio));
  const delAbierto = new Map((await periodos.listarAprobaciones(abierto.id)).map((aprobacion) => [aprobacion.grupo, aprobacion]));
  if (delAbierto.has(GRUPOS.administracion)) fallos.push("Administración no gestiona asistencia y no debería pedir aprobación");
  if (delAbierto.get(GRUPOS.taller)?.bloqueos.length !== 0) fallos.push("Taller debería poder aprobarse en el período abierto");
  if (!delAbierto.get(GRUPOS.tiendas)?.bloqueos.length) fallos.push("Tiendas debería tener personas que bloquean la aprobación");
  const delCerrado = await periodos.listarAprobaciones(cerrado.id);
  if (delCerrado.some(({ estado }) => estado !== "aprobada")) fallos.push("el período cerrado debería tener todos sus grupos aprobados");
  if (fallos.length) throw new Error(`Invariantes de aprobación no se cumplen:\n- ${fallos.join("\n- ")}`);
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
    "Aprobación de asistencia (#114; entre con gerente-tiendas / gerente-tiendas, finanzas / finanzas o admin / admin):",
    `  Período abierto: Taller lista para aprobar; Tiendas bloqueada (personas sin horario o con asistencia pendiente); Administración no gestiona asistencia`,
    `  Período cerrado ${PERIODO_ANTERIOR.inicio}..${PERIODO_ANTERIOR.fin}: Tiendas y Taller aprobadas`,
    "  Finanzas ve el cierre explicado: no puede cerrar el período abierto hasta que ambos grupos estén aprobados",
    "",
    "Relaciones laborales (rrhh / rrhh):",
    "  Julia Ingreso    -> ingresa el miércoles de la semana de actividad (lun/mar = «Sin relación laboral»)",
    "  Karen Reingreso  -> dos relaciones con el mismo DNI; reingresó el martes de la semana de actividad",
    "  Luis Pendiente   -> ingreso sin confirmar: no se le puede publicar el horario",
    "",
    "Pagos · Condiciones laborales (finanzas / finanzas; el Administrador no tiene acceso):",
    "  Ana Borrador     -> dos vigencias de sueldo en el mes actual (cambio el día 16; antes del 16 la segunda es «Programado»)",
    "  Beto Publicado   -> AFP Integra con esquema mixto y asignación familiar otorgada; Carla Cambios -> REMYPE con beneficio familiar otorgado",
    "  Darío / Elena    -> datos incompletos («Pendiente» y «Falta: …»); el resto, sin ningún dato",
    "  Karen Reingreso  -> un historial por cada una de sus dos relaciones laborales",
    "",
    "Pagos · Reglas legales (finanzas / finanzas; valores de DEMOSTRACIÓN, no oficiales):",
    "  Tasa de EsSalud  -> dos vigencias (anterior y la del mes actual)",
    "  Tasa de ONP      -> una versión «Programado» para el mes siguiente; RMV con una vigencia",
    "  Asignación familiar y sobretasas 25 %/35 % -> valores ficticios vigentes para revisar horas extra de Beto",
    "  Los demás valores legales (AFP, etc.) quedan sin regla vigente: «Pendiente»",
    "",
    "Pagos · Fuentes externas (finanzas / finanzas; importes de DEMOSTRACIÓN, mes de pago actual):",
    "  Comisiones de ventas -> Confirmada con importes (Ana con devengue del mes anterior, Beto del mes actual)",
    "  Adelantos            -> Confirmada sin importes (cero confirmado)",
    "  Movilidad            -> un importe de Beto, sin confirmar (Pendiente)",
    "  Abonos anticipados de remuneración vacacional -> un abono de Franco Díaz entregado dos días antes del descanso, sin confirmar (Pendiente)",
    "  Préstamos, retención de quinta, gratificación y bonificación -> Pendiente",
    "",
    "Pagos · Vacaciones entre meses (#125; mes de pago actual, finanzas / finanzas; Franco Díaz, 99900007):",
    `  Descanso aprobado en el calendario del ${INICIO_DEL_DESCANSO} al ${desplazarFecha(PERIODO_ACTUAL.inicio, DIAS_DE_VACACIONES_EN_EL_MES_ACTUAL - 1)}: días del mes anterior y ${DIAS_DE_VACACIONES_EN_EL_MES_ACTUAL} del mes actual`,
    `  Abono de S/ ${ABONO_VACACIONAL.monto} del ${ABONO_VACACIONAL.fecha}, repartido por días entre ambos meses; sueldo de 2200 a 2400 desde ${CAMBIO_DE_SUELDO_DE_FRANCO} (ajuste trazable)`,
    "  Detalle de Franco en Pagos -> «Vacaciones del mes»; Administración no tiene calendario y queda fuera de este desglose",
    "",
    "Calendario de asistencias de Beto Publicado (mes actual):",
    "  lun/mar -> Registrada ; mar -> 120 min extra al 25 % y 30 min al 35 % aprobados ; mié -> Registrada (Feriado)",
    "  jue -> Pendiente de revisión ; vie/sáb -> Esperada",
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

    // --- Condiciones laborales con vigencia (caso de uso: las registra Finanzas) ---
    await registrarCondicionesLaborales(db, actorFinanzas);

    // --- Reglas legales con vigencia (caso de uso: las activa Finanzas) ---
    await activarReglasLegales(db, actorFinanzas);

    // --- Fuentes externas de Pagos (caso de uso: las carga y confirma Finanzas) ---
    await cargarFuentesExternas(db, actorFinanzas);

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

    // --- Vacaciones de Franco que empiezan en el mes anterior (antes de cerrarlo, para que su revisión las congele) ---
    await turnos.publicarEnLote(fechasDelRango(INICIO_DEL_DESCANSO, PERIODO_ANTERIOR.fin).map((fecha) => (
      { dni: DNI_DE_VACACIONES, fecha, sede: null, entradaProgramada: null, salidaProgramada: null, motivoNoAsistencia: "vacaciones" as const }
    )), actorAdmin);

    // --- Mes anterior con período cerrado (Elena publicada + procesada, luego se cierra) ---
    await turnos.publicarEnLote(turnosDeSemana("99900005", SEDES.sanIsidro, SEMANA_ANTERIOR), actorGerenteDeTiendas);
    await confirmarSemanaLaboral(db, "99900005", modeloApertura(SEDES.sanIsidro), SEMANA_ANTERIOR);
    await turnos.registrarProcesamiento({ dni: "99900005", semana: SEMANA_ANTERIOR, equipo: "Tiendas", responsableId: finanzas.id });
    await db.update(schema.periodosPlanilla)
      .set({ estado: "cerrado", cerradoPorId: finanzas.id, cerradoEn: new Date() })
      .where(eq(schema.periodosPlanilla.inicio, PERIODO_ANTERIOR.inicio));

    // --- Aprobación de asistencia por grupo (#114) ---
    // Período abierto: Taller con todo resuelto (el gerente puede aprobar) y Tiendas bloqueada por personas sin horario o pendientes.
    await resolverAsistenciaDeTaller(db, turnos, actorAdmin);
    // Período cerrado: sus aprobaciones quedaron vigentes cuando lo cerró Finanzas (escritura directa: el cierre de arriba también lo es).
    const [periodoAnterior] = await db.select({ id: schema.periodosPlanilla.id }).from(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.inicio, PERIODO_ANTERIOR.inicio));
    await db.insert(schema.aprobacionesDeAsistencia).values([GRUPOS.tiendas, GRUPOS.taller].map((grupo) => ({
      periodoId: periodoAnterior.id, grupo, aprobadaPorId: gerenteTiendas.id, aprobadaEn: new Date(),
    })));
    // Pagos lee hechos congelados de la revisión cerrada. El cierre directo de demo también debe dejar esa revisión.
    const periodosDeDemo = new RepositorioPostgresDePeriodos(db);
    await db.insert(schema.revisionesDePeriodosPlanilla).values({
      periodoId: periodoAnterior.id, numero: 1,
      resumen: await periodosDeDemo.listarResumen({ periodoId: periodoAnterior.id }),
      hechos: await construirHechosDiarios(db, PERIODO_ANTERIOR),
      responsableId: finanzas.id, cerradaEn: new Date(),
    });

    // --- Asistencias en sus estados actuales (pendiente / confirmada / manual) + tardanza + hora extra.
    // Sin caso de uso limpio para fabricar estos estados; escritura directa.
    const [lun, mar, mie] = diasActual;
    await marcarConfirmada(db, "99900002", lun, aperturaBenavides, { tardanzaMin: 18 });
    await marcarConfirmada(db, "99900002", mar, aperturaBenavides, { horaExtra: "aprobada", minutosExtra: 150 });
    await marcarConfirmada(db, "99900003", lun, aperturaBenavides, { horaExtra: "pendiente", minutosExtra: 45 });
    await marcarManual(db, "99900002", mie, "feriado", finanzas.id);
    await marcarPendienteDeRevision(db, "99900002", diasActual[3], SEDES.benavides, finanzas.id);
    // Beto: lun/mar Registrada, mié Registrada (feriado), jue Pendiente de revisión, vie/sáb Esperada.
    // Darío ya quedó todo confirmado (semana liquidada).

    await verificarInvariantes(pool);
    await verificarAprobaciones(db);
    console.log(resumen());
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
