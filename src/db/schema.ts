import {
  boolean,
  date,
  integer,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
    entradaProgramada: text("entrada_programada").notNull(),
    salidaProgramada: text("salida_programada").notNull(),
    minutosDeAlmuerzo: integer("minutos_de_almuerzo").notNull(),
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
});

export const asistenciasEsperadas = pgTable(
  "asistencias_esperadas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idHuellero: text("id_huellero")
      .notNull()
      .references(() => colaboradores.idHuellero),
    fecha: date("fecha", { mode: "string" }).notNull(),
    estado: text("estado", { enum: ["pendiente"] }).notNull().default("pendiente"),
    creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("asistencias_esperadas_colaborador_fecha").on(table.idHuellero, table.fecha),
  ],
);
