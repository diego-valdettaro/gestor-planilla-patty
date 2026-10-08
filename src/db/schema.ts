import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  integer,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { HechoDiarioDeAsistencia } from "@/periodos/hechos-para-pagos";
import type { ResumenDePeriodo } from "@/periodos/periodo-planilla";

export const colaboradores = pgTable("colaboradores", {
  id: uuid("id").primaryKey().defaultRandom(),
  dni: text("dni").notNull().unique(),
  nombre: text("nombre").notNull(),
  sede: text("sede").notNull(),
  grupo: text("grupo").notNull().references(() => grupos.nombre),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

// Relación laboral (ADR 0012): intervalo entre el ingreso y el cese de una persona. Solo cuenta para
// publicar horarios y para Pagos la parte que Recursos Humanos confirmó; un cese sin confirmar no corta
// la vigencia. Una persona con el mismo DNI puede tener varias relaciones sucesivas.
export const relacionesLaborales = pgTable("relaciones_laborales", {
  id: uuid("id").primaryKey().defaultRandom(),
  dni: text("dni").notNull().references(() => colaboradores.dni),
  ingreso: date("ingreso", { mode: "string" }).notNull(),
  cese: date("cese", { mode: "string" }),
  ingresoConfirmadoPorId: uuid("ingreso_confirmado_por_id").references(() => cuentasLocales.id),
  ingresoConfirmadoEn: timestamp("ingreso_confirmado_en", { withTimezone: true }),
  ceseConfirmadoPorId: uuid("cese_confirmado_por_id").references(() => cuentasLocales.id),
  ceseConfirmadoEn: timestamp("cese_confirmado_en", { withTimezone: true }),
  registradaPorId: uuid("registrada_por_id").notNull().references(() => cuentasLocales.id),
  registradaEn: timestamp("registrada_en", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("relaciones_laborales_dni").on(table.dni, table.ingreso),
  uniqueIndex("relaciones_laborales_una_sin_cese_por_dni").on(table.dni).where(sql`${table.cese} IS NULL`),
]);

export const sedes = pgTable("sedes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull().unique(),
  activa: boolean("activa").notNull().default(true),
  grupo: text("grupo").references(() => grupos.nombre),
  creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
});

export const grupos = pgTable("grupos", {
  nombre: text("nombre").primaryKey(),
  gestionaAsistencia: boolean("gestiona_asistencia").notNull().default(true),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const cuentasLocales = pgTable("cuentas_locales", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombreUsuario: text("nombre_usuario").notNull().unique(),
  hashContrasena: text("hash_contrasena").notNull(),
  rol: text("rol", { enum: ["administrador", "gerente_de_area", "recursos_humanos", "finanzas"] }).notNull(),
  creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
});

// Un grupo tiene a lo sumo un gerente de área (PK en grupo); un gerente puede tener varios grupos.
export const gerentesDeGrupo = pgTable("gerentes_de_grupo", {
  grupo: text("grupo").primaryKey().references(() => grupos.nombre),
  cuentaId: uuid("cuenta_id").notNull().references(() => cuentasLocales.id),
  asignadoEn: timestamp("asignado_en", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("gerentes_de_grupo_cuenta_id").on(table.cuentaId)]);

export const sesiones = pgTable(
  "sesiones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cuentaId: uuid("cuenta_id")
      .notNull()
      .references(() => cuentasLocales.id),
    tokenHash: text("token_hash").notNull().unique(),
    venceEn: timestamp("vence_en", { withTimezone: true }).notNull(),
    creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sesiones_cuenta_id").on(table.cuentaId)],
);

export const periodosPlanilla = pgTable("periodos_planilla", {
  id: uuid("id").primaryKey().defaultRandom(),
  inicio: date("inicio", { mode: "string" }).notNull(),
  fin: date("fin", { mode: "string" }).notNull(),
  estado: text("estado", { enum: ["abierto", "cerrado"] }).notNull(),
  cerradoPorId: uuid("cerrado_por_id").references(() => cuentasLocales.id),
  cerradoEn: timestamp("cerrado_en", { withTimezone: true }),
});

export const auditoriaPeriodosPlanilla = pgTable("auditoria_periodos_planilla", {
  id: uuid("id").primaryKey().defaultRandom(),
  periodoId: uuid("periodo_id").notNull().references(() => periodosPlanilla.id),
  accion: text("accion", { enum: ["cierre", "reapertura"] }).notNull(),
  responsableId: uuid("responsable_id").notNull().references(() => cuentasLocales.id),
  motivo: text("motivo"),
  registradoEn: timestamp("registrado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const revisionesDePeriodosPlanilla = pgTable(
  "revisiones_periodos_planilla",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    periodoId: uuid("periodo_id").notNull().references(() => periodosPlanilla.id),
    numero: integer("numero").notNull(),
    resumen: jsonb("resumen").$type<ResumenDePeriodo>().notNull(),
    // Hechos diarios que Asistencia entrega a Pagos (issue #115), congelados al cerrar. Nulo en las revisiones
    // anteriores al contrato: Pagos no las acepta como fuente.
    hechos: jsonb("hechos").$type<HechoDiarioDeAsistencia[]>(),
    responsableId: uuid("responsable_id").notNull().references(() => cuentasLocales.id),
    cerradaEn: timestamp("cerrada_en", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("revisiones_periodo_numero").on(table.periodoId, table.numero)],
);

// Aprobación de la asistencia de un grupo para un período (ADR 0012). Solo se agregan filas: una corrección
// invalida la vigente (invalidadaEn + motivo) y la renovación inserta otra, así el historial se conserva.
export const aprobacionesDeAsistencia = pgTable(
  "aprobaciones_de_asistencia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    periodoId: uuid("periodo_id").notNull().references(() => periodosPlanilla.id),
    grupo: text("grupo").notNull().references(() => grupos.nombre),
    aprobadaPorId: uuid("aprobada_por_id").notNull().references(() => cuentasLocales.id),
    aprobadaEn: timestamp("aprobada_en", { withTimezone: true }).notNull(),
    invalidadaEn: timestamp("invalidada_en", { withTimezone: true }),
    motivoDeInvalidacion: text("motivo_de_invalidacion"),
  },
  (table) => [
    index("aprobaciones_de_asistencia_periodo_grupo").on(table.periodoId, table.grupo),
    uniqueIndex("aprobaciones_de_asistencia_una_vigente").on(table.periodoId, table.grupo).where(sql`${table.invalidadaEn} IS NULL`),
    check("aprobaciones_de_asistencia_invalidacion_completa", sql`(${table.invalidadaEn} IS NULL) = (${table.motivoDeInvalidacion} IS NULL)`),
  ],
);

export const modelosDeHorario = pgTable(
  "modelos_de_horario",
  {
    id: uuid("id").primaryKey(),
    sede: text("sede").notNull().references(() => sedes.nombre),
    nombre: text("nombre").notNull(),
    entrada: text("entrada").notNull(),
    salida: text("salida").notNull(),
    activo: boolean("activo").notNull().default(true),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("modelos_horario_sede_nombre").on(table.sede, table.nombre)],
);

export const auditoriaDeModelosDeHorario = pgTable("auditoria_modelos_de_horario", {
  id: uuid("id").primaryKey().defaultRandom(),
  modeloId: uuid("modelo_id").notNull(),
  accion: text("accion", { enum: ["creacion", "edicion", "activacion", "desactivacion", "eliminacion"] }).notNull(),
  modelo: jsonb("modelo").$type<{
    sede: string;
    nombre: string;
    entrada: string;
    salida: string;
    activo: boolean;
  }>().notNull(),
  responsableId: uuid("responsable_id").notNull().references(() => cuentasLocales.id),
  registradoEn: timestamp("registrado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const turnosPublicados = pgTable(
  "turnos_publicados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dni: text("dni")
      .notNull()
      .references(() => colaboradores.dni),
    fecha: date("fecha", { mode: "string" }).notNull(),
    grupo: text("grupo").notNull().references(() => grupos.nombre),
    sede: text("sede"),
    modeloHorarioId: uuid("modelo_horario_id").references(() => modelosDeHorario.id),
    entradaProgramada: text("entrada_programada"),
    salidaProgramada: text("salida_programada"),
    descanso: boolean("descanso").notNull(),
    motivoNoAsistencia: text("motivo_no_asistencia", { enum: ["descanso", "feriado", "vacaciones", "permiso", "suspension", "sin_relacion_laboral"] }),
    publicadoEn: timestamp("publicado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("turnos_publicados_colaborador_fecha").on(table.dni, table.fecha)],
);

export const historialDeTurnosPublicados = pgTable("historial_turnos_publicados", {
  id: uuid("id").primaryKey().defaultRandom(),
  turnoPublicadoId: uuid("turno_publicado_id")
    .notNull()
    .references(() => turnosPublicados.id),
  publicadoEn: timestamp("publicado_en", { withTimezone: true }).notNull().defaultNow(),
  horario: jsonb("horario").$type<{
    dni: string;
    fecha: string;
    grupo: string;
    sede: string | null;
    modeloHorarioId: string | null;
    entradaProgramada: string | null;
    salidaProgramada: string | null;
    descanso: boolean;
    motivoNoAsistencia: "descanso" | "feriado" | "vacaciones" | "permiso" | "suspension" | "sin_relacion_laboral" | null;
  }>().notNull(),
  responsableId: uuid("responsable_id").references(() => cuentasLocales.id),
  motivo: text("motivo"),
}, (table) => [
  check("historial_republicacion_auditada", sql`${table.motivo} IS NULL OR (${table.responsableId} IS NOT NULL AND char_length(btrim(${table.motivo})) BETWEEN 1 AND 250)`),
]);

export const planesSemanalesEnBorrador = pgTable(
  "planes_semanales_en_borrador",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    semana: date("semana", { mode: "string" }).notNull(),
    equipo: text("equipo").notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("planes_borrador_semana_equipo").on(table.semana, table.equipo),
  ],
);

export const celdasDePlanesSemanalesEnBorrador = pgTable(
  "celdas_planes_semanales_en_borrador",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id").notNull().references(() => planesSemanalesEnBorrador.id),
    dni: text("dni").notNull().references(() => colaboradores.dni),
    fecha: date("fecha", { mode: "string" }).notNull(),
    grupo: text("grupo").notNull().references(() => grupos.nombre),
    sede: text("sede"),
    modeloHorarioId: uuid("modelo_horario_id").references(() => modelosDeHorario.id),
    entradaProgramada: text("entrada_programada"),
    salidaProgramada: text("salida_programada"),
    descanso: boolean("descanso").notNull(),
    motivoNoAsistencia: text("motivo_no_asistencia", { enum: ["descanso", "feriado", "vacaciones", "permiso", "suspension", "sin_relacion_laboral"] }),
  },
  (table) => [uniqueIndex("celdas_borrador_plan_colaborador_fecha").on(table.planId, table.dni, table.fecha)],
);

export const asistenciasEsperadas = pgTable(
  "asistencias_esperadas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dni: text("dni")
      .notNull()
      .references(() => colaboradores.dni),
    fecha: date("fecha", { mode: "string" }).notNull(),
    estado: text("estado", { enum: ["pendiente", "confirmada", "manual"] }).notNull().default("pendiente"),
    entradaPropuesta: text("entrada_propuesta"),
    salidaPropuesta: text("salida_propuesta"),
    entradaReal: text("entrada_real"),
    salidaReal: text("salida_real"),
    minutosTrabajados: integer("minutos_trabajados"),
    instantaneaDeTurno: jsonb("instantanea_de_turno").$type<{
      sede: string;
      entradaProgramada: string | null;
      salidaProgramada: string | null;
      descanso: boolean;
    }>(),
    confirmadoPorId: uuid("confirmado_por_id").references(() => cuentasLocales.id),
    confirmadoEn: timestamp("confirmado_en", { withTimezone: true }),
    creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("asistencias_esperadas_colaborador_fecha").on(table.dni, table.fecha),
  ],
);

export const horariosSemanalesProcesados = pgTable(
  "horarios_semanales_procesados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dni: text("dni").notNull().references(() => colaboradores.dni),
    semana: date("semana", { mode: "string" }).notNull(),
    equipo: text("equipo").notNull(),
    responsableId: uuid("responsable_id").notNull().references(() => cuentasLocales.id),
    procesadoEn: timestamp("procesado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("horarios_semanales_procesados_colaborador_semana").on(table.dni, table.semana)],
);

export const ajustesDeAsistencia = pgTable(
  "ajustes_de_asistencia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    asistenciaId: uuid("asistencia_id").notNull().references(() => asistenciasEsperadas.id),
    entradaReal: text("entrada_real").notNull(),
    salidaReal: text("salida_real").notNull(),
    motivo: text("motivo").notNull(),
    responsableId: uuid("responsable_id").notNull().references(() => cuentasLocales.id),
    ajustadoEn: timestamp("ajustado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ajustes_asistencia_id").on(table.asistenciaId)],
);

export const estadosManuales = pgTable(
  "estados_manuales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    asistenciaId: uuid("asistencia_id").notNull().references(() => asistenciasEsperadas.id),
    tipo: text("tipo", { enum: ["falta", "descanso", "feriado", "vacaciones", "permiso", "suspension"] }).notNull(),
    comentario: text("comentario").notNull(),
    responsableId: uuid("responsable_id").notNull().references(() => cuentasLocales.id),
    registradoEn: timestamp("registrado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("estados_manuales_asistencia_id").on(table.asistenciaId)],
);

export const politicasDePenalizacionPorTardanzas = pgTable(
  "politicas_de_penalizacion_por_tardanzas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sede: text("sede").notNull(),
    toleranciaEnMinutos: integer("tolerancia_en_minutos").notNull(),
    tardanzasAcumuladas: integer("tardanzas_acumuladas").notNull(),
    horasPenalizadas: integer("horas_penalizadas").notNull(),
    version: integer("version").notNull(),
    vigenteDesde: date("vigente_desde", { mode: "string" }).notNull(),
    configuradaPorId: uuid("configurada_por_id").notNull().references(() => cuentasLocales.id),
    configuradaEn: timestamp("configurada_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("politicas_tardanzas_sede_version").on(table.sede, table.version),
    uniqueIndex("politicas_tardanzas_sede_vigencia").on(table.sede, table.vigenteDesde),
  ],
);

export const tardanzas = pgTable(
  "tardanzas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    asistenciaId: uuid("asistencia_id").notNull().references(() => asistenciasEsperadas.id).unique(),
    minutosDeTardanza: integer("minutos_de_tardanza").notNull(),
    minutosPenalizados: integer("minutos_penalizados").notNull(),
    politicaVersion: integer("politica_version").notNull(),
  },
  (table) => [index("tardanzas_asistencia_id").on(table.asistenciaId)],
);

export const horasExtra = pgTable(
  "horas_extra",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    asistenciaId: uuid("asistencia_id").notNull().unique().references(() => asistenciasEsperadas.id),
    minutosAl25: integer("minutos_al_25").notNull(),
    minutosAl35: integer("minutos_al_35").notNull(),
    trabajoNocturno: boolean("trabajo_nocturno").notNull().default(false),
    estado: text("estado", { enum: ["pendiente", "aprobada", "descartada"] }).notNull().default("pendiente"),
    causaDeDescarte: text("causa_de_descarte", { enum: ["marca_erronea", "permanencia_sin_trabajo"] }),
    motivoDeDescarte: text("motivo_de_descarte"),
    decididaPorId: uuid("decidida_por_id").references(() => cuentasLocales.id),
    decididaEn: timestamp("decidida_en", { withTimezone: true }),
  },
  (table) => [index("horas_extra_asistencia_id").on(table.asistenciaId)],
);

export const importacionesSemanales = pgTable("importaciones_semanales", {
  id: uuid("id").primaryKey().defaultRandom(),
  sede: text("sede"),
  semana: date("semana", { mode: "string" }),
  archivoNombre: text("archivo_nombre").notNull(),
  archivoUbicacion: text("archivo_ubicacion").notNull(),
  archivoHashSha256: text("archivo_hash_sha256").notNull(),
  usuarioId: uuid("usuario_id").notNull().references(() => cuentasLocales.id),
  importadaEn: timestamp("importada_en", { withTimezone: true }).notNull().defaultNow(),
});

export const marcasCrudas = pgTable(
  "marcas_crudas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importacionId: uuid("importacion_id").notNull().references(() => importacionesSemanales.id),
    dni: text("dni").notNull(),
    sede: text("sede"),
    fecha: date("fecha", { mode: "string" }).notNull(),
    instante: text("instante").notNull(),
  },
  (table) => [index("marcas_crudas_importacion_id").on(table.importacionId)],
);

export const incidenciasDeImportacion = pgTable(
  "incidencias_de_importacion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importacionId: uuid("importacion_id").notNull().references(() => importacionesSemanales.id),
    dni: text("dni").notNull(),
    fecha: date("fecha", { mode: "string" }).notNull(),
    motivo: text("motivo").notNull(),
  },
  (table) => [index("incidencias_importacion_id").on(table.importacionId)],
);

export const reemplazosDeAsistenciaImportada = pgTable(
  "reemplazos_de_asistencia_importada",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    asistenciaId: uuid("asistencia_id").notNull().references(() => asistenciasEsperadas.id),
    importacionId: uuid("importacion_id").notNull().references(() => importacionesSemanales.id),
    estadoAnterior: text("estado_anterior", { enum: ["confirmada", "manual"] }).notNull(),
    valorAnterior: jsonb("valor_anterior").$type<{
      entradaReal?: string;
      salidaReal?: string;
      tipo?: string;
      comentario?: string;
    }>().notNull(),
    responsableId: uuid("responsable_id").notNull().references(() => cuentasLocales.id),
    reemplazadoEn: timestamp("reemplazado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("reemplazos_asistencia_importada_asistencia_id").on(table.asistenciaId),
    index("reemplazos_asistencia_importada_importacion_id").on(table.importacionId),
  ],
);

// Descanso semanal asignado por vigencia (issue #113). `diaSemana` es ISO: 1 = lunes … 7 = domingo. Sin fila
// vigente la persona no tiene descanso asignado: nunca se asume el domingo.
export const descansosSemanalesAsignados = pgTable(
  "descansos_semanales_asignados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dni: text("dni").notNull().references(() => colaboradores.dni),
    diaSemana: smallint("dia_semana").notNull(),
    vigenteDesde: date("vigente_desde", { mode: "string" }).notNull(),
    registradoPorId: uuid("registrado_por_id").notNull().references(() => cuentasLocales.id),
    registradoEn: timestamp("registrado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("descansos_semanales_dni_vigencia").on(table.dni, table.vigenteDesde),
    check("descansos_semanales_dia_valido", sql`${table.diaSemana} BETWEEN 1 AND 7`),
  ],
);

// Calendario de feriados. El 1 de mayo es el único con clase propia; la base ata la clase a la fecha.
export const feriados = pgTable(
  "feriados",
  {
    fecha: date("fecha", { mode: "string" }).primaryKey(),
    nombre: text("nombre").notNull(),
    clase: text("clase", { enum: ["feriado", "primero_de_mayo"] }).notNull(),
    registradoPorId: uuid("registrado_por_id").notNull().references(() => cuentasLocales.id),
    registradoEn: timestamp("registrado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("feriados_nombre_valido", sql`char_length(btrim(${table.nombre})) BETWEEN 1 AND 100`),
    check("feriados_clase_segun_fecha", sql`(${table.clase} = 'primero_de_mayo') = (EXTRACT(MONTH FROM ${table.fecha}) = 5 AND EXTRACT(DAY FROM ${table.fecha}) = 1)`),
  ],
);

// Descanso sustitutorio previsto para un descanso semanal o feriado y su verificación posterior. `origenTipo`
// congela qué se sustituye aunque el calendario o el descanso asignado cambien después.
export const descansosSustitutorios = pgTable(
  "descansos_sustitutorios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dni: text("dni").notNull().references(() => colaboradores.dni),
    origenFecha: date("origen_fecha", { mode: "string" }).notNull(),
    origenTipo: text("origen_tipo", { enum: ["descanso_semanal", "feriado", "primero_de_mayo"] }).notNull(),
    fechaPrevista: date("fecha_prevista", { mode: "string" }).notNull(),
    estado: text("estado", { enum: ["previsto", "otorgado", "no_otorgado"] }).notNull().default("previsto"),
    verificadoPorId: uuid("verificado_por_id").references(() => cuentasLocales.id),
    verificadoEn: timestamp("verificado_en", { withTimezone: true }),
    registradoPorId: uuid("registrado_por_id").notNull().references(() => cuentasLocales.id),
    registradoEn: timestamp("registrado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("descansos_sustitutorios_dni_origen").on(table.dni, table.origenFecha),
    uniqueIndex("descansos_sustitutorios_dni_fecha_prevista").on(table.dni, table.fechaPrevista).where(sql`${table.estado} <> 'no_otorgado'`),
    check("descansos_sustitutorios_otro_dia", sql`${table.fechaPrevista} <> ${table.origenFecha}`),
    check("descansos_sustitutorios_verificacion_completa", sql`(${table.estado} = 'previsto' AND ${table.verificadoPorId} IS NULL AND ${table.verificadoEn} IS NULL) OR (${table.estado} <> 'previsto' AND ${table.verificadoPorId} IS NOT NULL AND ${table.verificadoEn} IS NOT NULL)`),
  ],
);

// Condiciones laborales con vigencia por relación laboral (issue #116, ADR 0008): sueldo, jornada ordinaria diaria,
// régimen, afiliación pensionaria, esquema de comisión AFP, elegibilidad familiar y sede de adscripción. Cada fila
// es un dato con su vigencia; un valor nuevo agrega otra fila y nunca reescribe las anteriores. Exactamente una
// columna de valor está llena, la que corresponde a `dato`. Una corrección marca la fila anterior como reemplazada
// (con motivo) e inserta otra con la misma vigencia. La sede de adscripción es una FK a las sedes existentes.
export const condicionesLaborales = pgTable(
  "condiciones_laborales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relacionLaboralId: uuid("relacion_laboral_id").notNull().references(() => relacionesLaborales.id),
    dato: text("dato", { enum: ["sueldo", "jornada_ordinaria_diaria", "regimen_laboral", "afiliacion_pensionaria", "comision_afp", "elegibilidad_familiar", "sede_de_adscripcion"] }).notNull(),
    sueldoCentimos: integer("sueldo_centimos"),
    jornadaMinutos: integer("jornada_minutos"),
    regimen: text("regimen", { enum: ["general", "remype_pequena_empresa"] }),
    afiliacionPensionaria: text("afiliacion_pensionaria", { enum: ["onp", "afp_habitat", "afp_integra", "afp_prima", "afp_profuturo"] }),
    comisionAfp: text("comision_afp", { enum: ["flujo", "mixta"] }),
    elegibleAsignacionFamiliar: boolean("elegible_asignacion_familiar"),
    sedeDeAdscripcion: text("sede_de_adscripcion").references(() => sedes.nombre),
    vigenteDesde: date("vigente_desde", { mode: "string" }).notNull(),
    registradoPorId: uuid("registrado_por_id").notNull().references(() => cuentasLocales.id),
    registradoEn: timestamp("registrado_en", { withTimezone: true }).notNull().defaultNow(),
    reemplazadaEn: timestamp("reemplazada_en", { withTimezone: true }),
    motivoDeReemplazo: text("motivo_de_reemplazo"),
  },
  (table) => [
    index("condiciones_laborales_relacion_dato").on(table.relacionLaboralId, table.dato),
    uniqueIndex("condiciones_laborales_una_activa_por_vigencia").on(table.relacionLaboralId, table.dato, table.vigenteDesde).where(sql`${table.reemplazadaEn} IS NULL`),
    check("condiciones_laborales_reemplazo_con_motivo", sql`(${table.reemplazadaEn} IS NULL) = (${table.motivoDeReemplazo} IS NULL)`),
  ],
);

// Reglas legales con vigencia (issue #117, ADR 0008): tasas, topes, RMV y demás valores legales que Finanzas activa con
// fecha de vigencia, fuente oficial y responsable. Cada fila es una versión de un valor; una versión nueva agrega otra
// fila y nunca reescribe las anteriores. Exactamente una columna de valor está llena: porcentaje en centésimas de punto
// (9,00 % = 900) o importe en céntimos, según la unidad del código en el catálogo de `src/reglas-legales`. El catálogo
// de códigos vive en código para que ampliarlo no exija migración. Una corrección marca la fila anterior como
// reemplazada (con motivo) e inserta otra con la misma vigencia.
export const reglasLegales = pgTable(
  "reglas_legales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codigo: text("codigo").notNull(),
    tasaCentesimasDePunto: integer("tasa_centesimas_de_punto"),
    importeCentimos: integer("importe_centimos"),
    vigenteDesde: date("vigente_desde", { mode: "string" }).notNull(),
    fuenteOficial: text("fuente_oficial").notNull(),
    activadaPorId: uuid("activada_por_id").notNull().references(() => cuentasLocales.id),
    activadaEn: timestamp("activada_en", { withTimezone: true }).notNull().defaultNow(),
    reemplazadaEn: timestamp("reemplazada_en", { withTimezone: true }),
    motivoDeReemplazo: text("motivo_de_reemplazo"),
  },
  (table) => [
    index("reglas_legales_codigo").on(table.codigo),
    uniqueIndex("reglas_legales_una_activa_por_vigencia").on(table.codigo, table.vigenteDesde).where(sql`${table.reemplazadaEn} IS NULL`),
    check("reglas_legales_una_sola_columna", sql`num_nonnulls(${table.tasaCentesimasDePunto}, ${table.importeCentimos}) = 1`),
    check("reglas_legales_tasa_valida", sql`${table.tasaCentesimasDePunto} IS NULL OR ${table.tasaCentesimasDePunto} BETWEEN 0 AND 10000`),
    check("reglas_legales_importe_positivo", sql`${table.importeCentimos} IS NULL OR ${table.importeCentimos} > 0`),
    check("reglas_legales_fuente_valida", sql`char_length(btrim(${table.fuenteOficial})) BETWEEN 1 AND 500`),
    check("reglas_legales_reemplazo_con_motivo", sql`(${table.reemplazadaEn} IS NULL) = (${table.motivoDeReemplazo} IS NULL)`),
    check("reglas_legales_motivo_valido", sql`${table.motivoDeReemplazo} IS NULL OR char_length(btrim(${table.motivoDeReemplazo})) BETWEEN 1 AND 250`),
  ],
);

// Fuentes externas de Pagos (issue #118, ADR 0009). Un importe externo es un monto por persona de un concepto catalogado
// (`src/conceptos-de-preliquidacion`) que Finanzas carga desde fuera del huellero. Conserva el DNI, la fecha del hecho,
// el mes de devengue, el mes de aplicación (el mes de pago al que pertenece), el monto en céntimos (siempre positivo: el
// signo lo da el concepto) y su procedencia. Un importe no se edita: se anula con motivo y queda en el historial. El mes
// es texto AAAA-MM. El índice único parcial rechaza un duplicado entre importes no anulados. Los catálogos de conceptos y de
// tipos de fuente viven en código para que ampliarlos no exija migración.
export const importesExternos = pgTable(
  "importes_externos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipoDeFuente: text("tipo_de_fuente").notNull(),
    dni: text("dni").notNull().references(() => colaboradores.dni),
    concepto: text("concepto").notNull(),
    fechaDelHecho: date("fecha_del_hecho", { mode: "string" }).notNull(),
    mesDeDevengue: text("mes_de_devengue").notNull(),
    mesDeAplicacion: text("mes_de_aplicacion").notNull(),
    montoCentimos: integer("monto_centimos").notNull(),
    procedencia: text("procedencia").notNull(),
    registradoPorId: uuid("registrado_por_id").notNull().references(() => cuentasLocales.id),
    registradoEn: timestamp("registrado_en", { withTimezone: true }).notNull().defaultNow(),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    motivoDeAnulacion: text("motivo_de_anulacion"),
    /** El archivo fuente de preliquidación del que viene el importe; null en la carga manual. */
    importacionId: uuid("importacion_id").references((): AnyPgColumn => importacionesDeFuente.id),
    estadoDeIncidencia: text("estado_de_incidencia"),
    sustento: text("sustento"),
    autorizadoPor: text("autorizado_por"),
    fechaDeAutorizacion: date("fecha_de_autorizacion", { mode: "string" }),
    conceptoAjustado: text("concepto_ajustado"),
    sentidoAjuste: text("sentido_ajuste"),
    motivoDeAjuste: text("motivo_de_ajuste"),
  },
  (table) => [
    index("importes_externos_fuente").on(table.tipoDeFuente, table.mesDeAplicacion),
    index("importes_externos_dni").on(table.dni, table.mesDeAplicacion),
    uniqueIndex("importes_externos_sin_duplicados")
      .on(table.dni, table.concepto, table.fechaDelHecho, table.mesDeDevengue, table.mesDeAplicacion, table.montoCentimos)
      .where(sql`${table.anuladoEn} IS NULL AND ${table.tipoDeFuente} <> 'ajustes_de_preliquidacion'`),
    uniqueIndex("ajustes_de_preliquidacion_sin_duplicados")
      .on(table.dni, table.conceptoAjustado, table.sentidoAjuste, table.fechaDelHecho, table.mesDeDevengue, table.mesDeAplicacion, table.montoCentimos)
      .where(sql`${table.anuladoEn} IS NULL AND ${table.tipoDeFuente} = 'ajustes_de_preliquidacion'`),
    check("importes_externos_monto_positivo", sql`${table.montoCentimos} > 0`),
    check("importes_externos_meses_validos", sql`${table.mesDeDevengue} ~ '^\\d{4}-(0[1-9]|1[0-2])$' AND ${table.mesDeAplicacion} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`),
    check("importes_externos_procedencia_valida", sql`char_length(btrim(${table.procedencia})) BETWEEN 1 AND 200`),
    check("importes_externos_anulacion_con_motivo", sql`(${table.anuladoEn} IS NULL) = (${table.motivoDeAnulacion} IS NULL)`),
    check("importes_externos_motivo_valido", sql`${table.motivoDeAnulacion} IS NULL OR char_length(btrim(${table.motivoDeAnulacion})) BETWEEN 1 AND 250`),
    check("importes_externos_incidencia_completa", sql`${table.tipoDeFuente} <> 'incidencias_de_tienda' OR (${table.concepto} = 'descuento_autorizado_por_incidencia' AND ${table.estadoDeIncidencia} IS NOT NULL AND ${table.estadoDeIncidencia} IN ('sin_sustento', 'en_investigacion', 'descuento_autorizado') AND (${table.estadoDeIncidencia} <> 'descuento_autorizado' OR (nullif(btrim(${table.sustento}), '') IS NOT NULL AND nullif(btrim(${table.autorizadoPor}), '') IS NOT NULL AND ${table.fechaDeAutorizacion} IS NOT NULL)))`),
    check("importes_externos_ajuste_completo", sql`${table.tipoDeFuente} <> 'ajustes_de_preliquidacion' OR (${table.concepto} = 'ajuste_de_preliquidacion' AND nullif(btrim(${table.conceptoAjustado}), '') IS NOT NULL AND ${table.sentidoAjuste} IS NOT NULL AND ${table.sentidoAjuste} IN ('suma', 'resta') AND nullif(btrim(${table.motivoDeAjuste}), '') IS NOT NULL)`),
  ],
);

// Archivo fuente de preliquidación (ADR 0005 y 0009): el XLSX normalizado que aportó los importes de un tipo de fuente en un mes
// de pago, con su hash, quién lo importó y el resultado de la validación. Es todo o nada: un archivo rechazado no deja registro.
// Importar otro archivo del mismo tipo y mes reemplaza al anterior (`reemplazadaEn`); el archivo anterior se conserva.
export const importacionesDeFuente = pgTable(
  "importaciones_de_fuente",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipoDeFuente: text("tipo_de_fuente").notNull(),
    mesDeAplicacion: text("mes_de_aplicacion").notNull(),
    archivoNombre: text("archivo_nombre").notNull(),
    archivoUbicacion: text("archivo_ubicacion").notNull(),
    archivoHashSha256: text("archivo_hash_sha256").notNull(),
    usuarioId: uuid("usuario_id").notNull().references(() => cuentasLocales.id),
    importadaEn: timestamp("importada_en", { withTimezone: true }).notNull().defaultNow(),
    filas: integer("filas").notNull(),
    totalCentimos: bigint("total_centimos", { mode: "number" }).notNull(),
    validacion: jsonb("validacion").$type<{ filasValidas: number; filasConError: number; duplicadas: number; personasDesconocidas: number }>().notNull(),
    reemplazadaEn: timestamp("reemplazada_en", { withTimezone: true }),
  },
  (table) => [
    index("importaciones_de_fuente_fuente").on(table.tipoDeFuente, table.mesDeAplicacion),
    uniqueIndex("importaciones_de_fuente_vigente").on(table.tipoDeFuente, table.mesDeAplicacion).where(sql`${table.reemplazadaEn} IS NULL`),
    check("importaciones_de_fuente_mes_valido", sql`${table.mesDeAplicacion} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`),
    check("importaciones_de_fuente_hash_valido", sql`${table.archivoHashSha256} ~ '^[0-9a-f]{64}$'`),
    check("importaciones_de_fuente_filas_positivas", sql`${table.filas} > 0 AND ${table.totalCentimos} > 0`),
  ],
);

// Confirmación de un tipo de fuente para un mes de pago: Finanzas declara completo el listado para la población aplicable,
// incluso sin importes. Su existencia es el estado «Confirmada»; sin fila la fuente está pendiente. Es reversible antes
// de finalizar el mes (se borra la fila) y cualquier cambio de importes del tipo la borra.
export const confirmacionesDeFuente = pgTable(
  "confirmaciones_de_fuente",
  {
    tipoDeFuente: text("tipo_de_fuente").notNull(),
    mesDeAplicacion: text("mes_de_aplicacion").notNull(),
    confirmadaPorId: uuid("confirmada_por_id").notNull().references(() => cuentasLocales.id),
    confirmadaEn: timestamp("confirmada_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tipoDeFuente, table.mesDeAplicacion], name: "confirmaciones_de_fuente_pk" }),
    check("confirmaciones_de_fuente_mes_valido", sql`${table.mesDeAplicacion} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`),
  ],
);
