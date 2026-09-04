import {
  boolean,
  check,
  date,
  integer,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const colaboradores = pgTable("colaboradores", {
  id: uuid("id").primaryKey().defaultRandom(),
  idHuellero: text("id_huellero").notNull().unique(),
  nombre: text("nombre").notNull(),
  sede: text("sede").notNull(),
  centroDeCosto: text("centro_de_costo").notNull(),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const sedes = pgTable("sedes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull().unique(),
  activa: boolean("activa").notNull().default(true),
  equipoOperativo: text("equipo_operativo", { enum: ["tiendas", "taller"] }),
  creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
});

export const cuentasLocales = pgTable("cuentas_locales", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombreUsuario: text("nombre_usuario").notNull().unique(),
  hashContrasena: text("hash_contrasena").notNull(),
  rol: text("rol", { enum: ["operaciones", "administracion", "finanzas"] }).notNull(),
  creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
});

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
    idHuellero: text("id_huellero")
      .notNull()
      .references(() => colaboradores.idHuellero),
    fecha: date("fecha", { mode: "string" }).notNull(),
    sede: text("sede").notNull(),
    modeloHorarioId: uuid("modelo_horario_id").references(() => modelosDeHorario.id),
    entradaProgramada: text("entrada_programada"),
    salidaProgramada: text("salida_programada"),
    descanso: boolean("descanso").notNull(),
    publicadoEn: timestamp("publicado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("turnos_publicados_colaborador_fecha").on(table.idHuellero, table.fecha)],
);

export const historialDeTurnosPublicados = pgTable("historial_turnos_publicados", {
  id: uuid("id").primaryKey().defaultRandom(),
  turnoPublicadoId: uuid("turno_publicado_id")
    .notNull()
    .references(() => turnosPublicados.id),
  publicadoEn: timestamp("publicado_en", { withTimezone: true }).notNull().defaultNow(),
  horario: jsonb("horario").$type<{
    idHuellero: string;
    fecha: string;
    sede: string;
    modeloHorarioId: string | null;
    entradaProgramada: string | null;
    salidaProgramada: string | null;
    descanso: boolean;
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
    equipo: text("equipo", { enum: ["tiendas", "taller"] }).notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("planes_borrador_equipo_valido", sql`${table.equipo} IN ('tiendas', 'taller')`),
    uniqueIndex("planes_borrador_semana_equipo").on(table.semana, table.equipo),
  ],
);

export const celdasDePlanesSemanalesEnBorrador = pgTable(
  "celdas_planes_semanales_en_borrador",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id").notNull().references(() => planesSemanalesEnBorrador.id),
    idHuellero: text("id_huellero").notNull().references(() => colaboradores.idHuellero),
    fecha: date("fecha", { mode: "string" }).notNull(),
    sede: text("sede").notNull(),
    modeloHorarioId: uuid("modelo_horario_id").references(() => modelosDeHorario.id),
    entradaProgramada: text("entrada_programada"),
    salidaProgramada: text("salida_programada"),
    descanso: boolean("descanso").notNull(),
  },
  (table) => [uniqueIndex("celdas_borrador_plan_colaborador_fecha").on(table.planId, table.idHuellero, table.fecha)],
);

export const asistenciasEsperadas = pgTable(
  "asistencias_esperadas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idHuellero: text("id_huellero")
      .notNull()
      .references(() => colaboradores.idHuellero),
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
    uniqueIndex("asistencias_esperadas_colaborador_fecha").on(table.idHuellero, table.fecha),
  ],
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
    estado: text("estado", { enum: ["pendiente", "aprobada", "rechazada"] }).notNull().default("pendiente"),
    decididaPorId: uuid("decidida_por_id").references(() => cuentasLocales.id),
    decididaEn: timestamp("decidida_en", { withTimezone: true }),
  },
  (table) => [index("horas_extra_asistencia_id").on(table.asistenciaId)],
);

export const importacionesSemanales = pgTable("importaciones_semanales", {
  id: uuid("id").primaryKey().defaultRandom(),
  sede: text("sede").notNull(),
  semana: date("semana", { mode: "string" }).notNull(),
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
    idHuellero: text("id_huellero").notNull(),
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
    idHuellero: text("id_huellero").notNull(),
    fecha: date("fecha", { mode: "string" }).notNull(),
    motivo: text("motivo").notNull(),
  },
  (table) => [index("incidencias_importacion_id").on(table.importacionId)],
);
