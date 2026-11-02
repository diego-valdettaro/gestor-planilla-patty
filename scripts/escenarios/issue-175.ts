import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { confirmarAsistencia } from "@/asistencias/confirmar-y-ajustar-asistencia";
import { RepositorioPostgresDeAsistencias } from "@/asistencias/repositorio-postgres";
import type { Actor } from "@/autenticacion/permisos";
import { confirmarFuente } from "@/fuentes-externas/gestionar-fuentes-externas";
import { RepositorioPostgresDeFuentesExternas } from "@/fuentes-externas/repositorio-postgres";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";
import * as schema from "@/db/schema";
import { construirHechosDiarios } from "@/periodos/hechos-de-asistencia-postgres";
import { aprobarAsistenciaDelGrupo, cerrarPeriodo } from "@/periodos/periodo-planilla";
import { RepositorioPostgresDePeriodos } from "@/periodos/repositorio-postgres";
import { activarReglaLegal } from "@/reglas-legales/gestionar-reglas-legales";
import { RepositorioPostgresDeReglasLegales } from "@/reglas-legales/repositorio-postgres";
import { configurarPoliticaDePenalizacionPorTardanzas } from "@/tardanzas/politica-de-penalizacion";
import { RepositorioPostgresDeTardanzas } from "@/tardanzas/repositorio-postgres";
import { RepositorioPostgresDeModelosDeHorario } from "@/turnos/repositorio-postgres-modelos-de-horario";
import { RepositorioPostgresDeTurnos } from "@/turnos/repositorio-postgres";
// Fixture sintético de issue #175. Solo se admite la base desechable de `pnpm revisar`.
// Es de una sola aplicación: si ya existe cualquiera de sus DNIs, borrar y recrear esa
// base de revisión. Las claves de las cuentas son exclusivamente las del seed local.
const GRUPO_ASISTENCIA = "QA 175 Taller";
const GRUPO_SIN_ASISTENCIA = "QA 175 Administración";
// Lista blanca de los grupos attendance-enabled del seed conocido más el grupo QA. Un grupo
// inesperado detiene la fixture: no se deben aprobar grupos añadidos por otros ensayos.
const GRUPOS_CON_ASISTENCIA_ESPERADOS = ["Tiendas", "Taller", GRUPO_ASISTENCIA] as const;
const SEDE_TALLER = "QA 175 Taller Norte";
const SEDE_TALLER_DOS = "QA 175 Taller Sur";
const SEDE_ADMIN = "QA 175 Administración";
const CIERRE_HISTORICO = { inicio: "2018-12-26", fin: "2019-01-25" };
const PERIODO_ABIERTO = { inicio: "2019-01-26", fin: "2019-02-25" };
const MODELO_TALLER_ID = randomUUID();
const MODELO_TALLER_DOS_ID = randomUUID();
const MODELO_ADMIN_ID = randomUUID();
const PERSONAS = [
  { dni: "99917501", nombre: "Ada Movilidad QA", grupo: GRUPO_ASISTENCIA, sede: null, ingreso: "2019-02-15", movilidadCentimos: 28000 },
  { dni: "99917502", nombre: "Marta Incidencias QA", grupo: GRUPO_SIN_ASISTENCIA, sede: null, ingreso: "2019-01-01", movilidadCentimos: 0 },
  { dni: "99917503", nombre: "Elio Historial QA", grupo: GRUPO_ASISTENCIA, sede: null, ingreso: "2018-12-01", movilidadCentimos: 0 },
] as const;

function urlDeArgumentos(): string {
  const indice = process.argv.indexOf("--url");
  const raw = indice >= 0 ? process.argv[indice + 1] : process.env.DATABASE_URL;
  if (!raw) throw new Error("Falta DATABASE_URL o --url.");
  const url = new URL(raw);
  const nombre = url.pathname.replace(/^\//, "");
  if (url.hostname !== "127.0.0.1" || !/^planilla_rev_\d+$/.test(nombre)) {
    throw new Error("El escenario #175 solo acepta una base planilla_rev_<n> en 127.0.0.1.");
  }
  return raw;
}

function fechas(inicio: string, fin: string): string[] {
  const resultado: string[] = [];
  for (let dia = Date.parse(`${inicio}T00:00:00Z`); dia <= Date.parse(`${fin}T00:00:00Z`); dia += 86_400_000) {
    resultado.push(new Date(dia).toISOString().slice(0, 10));
  }
  return resultado;
}

function esFinDeSemana(fecha: string): boolean {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  return dia === 0 || dia === 6;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: urlDeArgumentos() });
  const client = await pool.connect();
  try {
    const db = drizzle(client, { schema });
    const cuenta = async (usuario: string) => {
      const result = await pool.query<{ id: string }>("SELECT id FROM cuentas_locales WHERE nombre_usuario = $1", [usuario]);
      if (!result.rows[0]) throw new Error(`Falta la cuenta de seed ${usuario}.`);
      return result.rows[0].id;
    };
    const [adminId, finanzasId, gerenteTallerId, gerenteAdminId] = await Promise.all([
      cuenta("admin"), cuenta("finanzas"), cuenta("gerente-tiendas"), cuenta("gerente-administracion"),
    ]);
    const actorAdmin: Actor = { id: adminId, rol: "administrador" };
    const existente = await pool.query("SELECT dni FROM colaboradores WHERE dni = ANY($1::text[])", [PERSONAS.map(({ dni }) => dni)]);
    if (existente.rowCount) throw new Error("El escenario #175 ya existe en esta base; recrea la base desechable para volver a sembrar.");

    await client.query("BEGIN");
    try {
      await client.query("INSERT INTO grupos (nombre, gestiona_asistencia) VALUES ($1, true), ($2, false)", [GRUPO_ASISTENCIA, GRUPO_SIN_ASISTENCIA]);
      await client.query("INSERT INTO sedes (nombre, grupo, activa) VALUES ($1, $2, true), ($3, $2, true), ($4, $5, true)",
        [SEDE_TALLER, GRUPO_ASISTENCIA, SEDE_TALLER_DOS, SEDE_ADMIN, GRUPO_SIN_ASISTENCIA]);
      await client.query("INSERT INTO gerentes_de_grupo (grupo, cuenta_id) VALUES ($1, $2), ($3, $4)",
        [GRUPO_ASISTENCIA, gerenteTallerId, GRUPO_SIN_ASISTENCIA, gerenteAdminId]);
      await client.query(`INSERT INTO modelos_de_horario (id, sede, nombre, entrada, salida, activo)
        VALUES ($1, $2, 'QA Apertura', '08:00', '16:00', true), ($3, $4, 'QA Apertura', '08:00', '16:00', true), ($5, $6, 'QA Administrativo', '09:00', '17:00', true)`,
        [MODELO_TALLER_ID, SEDE_TALLER, MODELO_TALLER_DOS_ID, SEDE_TALLER_DOS, MODELO_ADMIN_ID, SEDE_ADMIN]);

      for (const persona of PERSONAS) {
        await client.query("INSERT INTO colaboradores (dni, nombre, sede, grupo, activo) VALUES ($1, $2, $3, $4, true)",
          [persona.dni, persona.nombre, persona.sede, persona.grupo]);
        await client.query(`INSERT INTO relaciones_laborales
          (dni, ingreso, ingreso_confirmado_por_id, ingreso_confirmado_en, registrada_por_id)
          VALUES ($1, $2, $3, now(), $3)`, [persona.dni, persona.ingreso, adminId]);
        const [{ id: relacionId }] = (await client.query<{ id: string }>("SELECT id FROM relaciones_laborales WHERE dni = $1 ORDER BY ingreso DESC LIMIT 1", [persona.dni])).rows;
        const condiciones = [
          ["sueldo", "sueldo_centimos", 200000], ["banco_de_pago", "banco_de_pago", "Banco QA"],
          ["movilidad_fija", "movilidad_fija_centimos", persona.movilidadCentimos], ["jornada_ordinaria_diaria", "jornada_minutos", 480],
          ["regimen_laboral", "regimen", "general"], ["afiliacion_pensionaria", "afiliacion_pensionaria", "onp"],
          ["elegibilidad_familiar", "elegible_asignacion_familiar", false], ["sede_de_adscripcion", "sede_de_adscripcion", persona.grupo === GRUPO_ASISTENCIA ? SEDE_TALLER : SEDE_ADMIN],
        ] as const;
        for (const [dato, columna, valor] of condiciones) {
          const columnas = {
            sueldo_centimos: "sueldo_centimos", banco_de_pago: "banco_de_pago", movilidad_fija_centimos: "movilidad_fija_centimos",
            jornada_minutos: "jornada_minutos", regimen: "regimen", afiliacion_pensionaria: "afiliacion_pensionaria",
            elegible_asignacion_familiar: "elegible_asignacion_familiar", sede_de_adscripcion: "sede_de_adscripcion",
          } as const;
          const permitida = columnas[columna as keyof typeof columnas];
          await client.query(`INSERT INTO condiciones_laborales (relacion_laboral_id, dato, ${permitida}, vigente_desde, registrado_por_id) VALUES ($1, $2, $3, $4, $5)`,
            [relacionId, dato, valor, persona.ingreso, finanzasId]);
        }
      }

      await client.query(`INSERT INTO politicas_tardanzas_grupo
        (grupo, tolerancia_en_minutos, tardanzas_acumuladas, horas_penalizadas, conflicto, configurada_por_id, configurada_en)
        VALUES ($1, 10, 1, 1, false, $2, now())`, [GRUPO_ASISTENCIA, adminId]);
      // El cierre histórico se crea abierto y se cerrará después por el caso de uso real.
      await client.query("INSERT INTO periodos_planilla (inicio, fin, estado) VALUES ($1, $2, 'abierto'), ($3, $4, 'abierto')",
        [CIERRE_HISTORICO.inicio, CIERRE_HISTORICO.fin, PERIODO_ABIERTO.inicio, PERIODO_ABIERTO.fin]);

      // Estado histórico sintético: turnos completos en rango, descansos publicados y marcas laborales confirmadas.
      // Esta preparación usa SQL directo como el seed para estados de asistencia sin un caso de alta limpio; el cierre sí
      // se realizará mediante `cerrarPeriodo`, que genera resumen y snapshot desde estos hechos.
      for (const fecha of fechas(CIERRE_HISTORICO.inicio, CIERRE_HISTORICO.fin)) {
        const descanso = esFinDeSemana(fecha);
        const turno = await client.query<{ id: string }>(`INSERT INTO turnos_publicados
          (dni, fecha, grupo, sede, modelo_horario_id, entrada_programada, salida_programada, descanso, motivo_no_asistencia)
          VALUES ('99917503', $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [fecha, GRUPO_ASISTENCIA, descanso ? null : SEDE_TALLER, descanso ? null : MODELO_TALLER_ID,
            descanso ? null : "08:00", descanso ? null : "16:00", descanso, descanso ? "descanso" : null]);
        await client.query(`INSERT INTO historial_turnos_publicados (turno_publicado_id, horario, responsable_id, motivo)
          VALUES ($1, $2::jsonb, $3, 'Fixture sintético QA 175')`, [turno.rows[0].id, JSON.stringify({
          dni: "99917503", fecha, grupo: GRUPO_ASISTENCIA, sede: descanso ? null : SEDE_TALLER,
          modeloHorarioId: descanso ? null : MODELO_TALLER_ID, entradaProgramada: descanso ? null : "08:00",
          salidaProgramada: descanso ? null : "16:00", descanso, motivoNoAsistencia: descanso ? "descanso" : null,
        }), gerenteTallerId]);
        if (!descanso) {
          const tarde = fecha === "2019-01-21";
          const asistencia = await client.query<{ id: string }>(`INSERT INTO asistencias_esperadas
            (dni, fecha, estado, entrada_real, salida_real, minutos_trabajados, instantanea_de_turno, confirmado_por_id, confirmado_en)
            VALUES ('99917503', $1, 'confirmada', $2, $3, $4, $5::jsonb, $6, now()) RETURNING id`,
            [fecha, `${fecha}T${tarde ? "08:15" : "08:00"}:00`, `${fecha}T16:00:00`,
              tarde ? 465 : 480, JSON.stringify({ sede: SEDE_TALLER, entradaProgramada: "08:00", salidaProgramada: "16:00", descanso: false }), gerenteTallerId]);
          if (tarde) await client.query("INSERT INTO tardanzas (asistencia_id, minutos_de_tardanza, minutos_penalizados, politica_version) VALUES ($1, 15, 60, 1)", [asistencia.rows[0].id]);
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    // Materializar snapshot cerrado mediante el mismo caso de uso de producción, una vez fuera de la transacción de seed.
    const actorFinanzas: Actor = { id: finanzasId, rol: "finanzas", nombreUsuario: "finanzas" };
    const actorGerente: Actor = { id: gerenteTallerId, rol: "gerente_de_area", grupos: [{ nombre: GRUPO_ASISTENCIA, gestionaAsistencia: true }] };
    const periodos = new RepositorioPostgresDePeriodos(db);
    const periodoCerrado = await client.query<{ id: string }>("SELECT id FROM periodos_planilla WHERE inicio = $1", [CIERRE_HISTORICO.inicio]);
    if (!periodoCerrado.rows[0]) throw new Error("No se creó el período histórico sintético.");
    // Lista blanca exacta para el cierre real: los dos grupos attendance-enabled del seed conocido y el QA nuevo.
    // Las personas del seed ingresaron después del corte; comprobar además ausencia de turnos históricos allí.
    const gruposActivos = await client.query<{ nombre: string; gerenteId: string | null; usuario: string | null; rol: string | null }>(`SELECT g.nombre, c.id AS "gerenteId", c.nombre_usuario AS usuario, c.rol
      FROM grupos g LEFT JOIN gerentes_de_grupo gg ON gg.grupo = g.nombre LEFT JOIN cuentas_locales c ON c.id = gg.cuenta_id
      WHERE g.gestiona_asistencia = true ORDER BY g.nombre`);
    const esperados = [...GRUPOS_CON_ASISTENCIA_ESPERADOS].sort();
    const encontrados = gruposActivos.rows.map(({ nombre }) => nombre).sort();
    if (JSON.stringify(encontrados) !== JSON.stringify(esperados)) {
      throw new Error(`Cierre QA detenido: grupos con asistencia encontrados [${encontrados.join(", ")}] no coinciden con lista blanca [${esperados.join(", ")}].`);
    }
    for (const fila of gruposActivos.rows) {
      if (!fila.gerenteId || fila.rol !== "gerente_de_area") throw new Error(`Cierre QA detenido: ${fila.nombre} no tiene gerente de área asignado.`);
    }
    const datosPreviosDeSeed = await client.query<{ grupo: string; personas: string; turnos: string }>(`SELECT g.nombre AS grupo,
      (SELECT count(*)::text FROM colaboradores c JOIN relaciones_laborales r ON r.dni = c.dni
        WHERE c.grupo = g.nombre AND r.ingreso_confirmado_en IS NOT NULL AND r.ingreso <= $2
          AND coalesce(r.cese, '9999-12-31') >= $1) AS personas,
      (SELECT count(*)::text FROM turnos_publicados t WHERE t.grupo = g.nombre AND t.fecha BETWEEN $1 AND $2) AS turnos
      FROM grupos g WHERE g.nombre IN ('Tiendas', 'Taller')`, [CIERRE_HISTORICO.inicio, CIERRE_HISTORICO.fin]);
    if (datosPreviosDeSeed.rows.some(({ personas, turnos: turnosPrevios }) => Number(personas) || Number(turnosPrevios))) {
      throw new Error("Cierre QA detenido: hay relaciones o turnos preexistentes de grupos seed en el período histórico; base no exclusiva para esta fixture.");
    }
    for (const fila of gruposActivos.rows) {
      const actorGerenteDelGrupo: Actor = {
        id: fila.gerenteId!, rol: "gerente_de_area",
        grupos: [{ nombre: fila.nombre, gestionaAsistencia: true }],
      };
      await aprobarAsistenciaDelGrupo(periodos, actorGerenteDelGrupo, { periodoId: periodoCerrado.rows[0].id, grupo: fila.nombre });
    }
    await cerrarPeriodo(periodos, actorFinanzas, periodoCerrado.rows[0].id);

    // Resolver todo el período abierto por APIs reales para que el gerente pueda aprobar el grupo.
    // Incluye la semana de Q4; Ada empieza a mitad de febrero y Elio cubre todo el corte.
    const turnos = new RepositorioPostgresDeTurnos(db);
    const asistenciaInicio = new Map([["99917501", "2019-02-15"], ["99917503", PERIODO_ABIERTO.inicio]]);
    const publicarPeriodoDePersona = async (dni: string) => {
      const jornadas = fechas(asistenciaInicio.get(dni)!, PERIODO_ABIERTO.fin).map((fecha) => esFinDeSemana(fecha)
        ? { dni, fecha, sede: null, entradaProgramada: null, salidaProgramada: null, motivoNoAsistencia: "descanso" as const }
        : { dni, fecha, sede: SEDE_TALLER, modeloHorarioId: MODELO_TALLER_ID, entradaProgramada: "08:00", salidaProgramada: "16:00", descanso: false });
      await turnos.publicarEnLote(jornadas, actorGerente);
    };
    await publicarPeriodoDePersona("99917501");
    await publicarPeriodoDePersona("99917503");
    const asistencias = new RepositorioPostgresDeAsistencias(db);
    for (const dni of ["99917501", "99917503"]) {
      for (const fecha of fechas(asistenciaInicio.get(dni)!, PERIODO_ABIERTO.fin).filter((dia) => !esFinDeSemana(dia))) {
        const tarde = dni === "99917501" && fecha === "2019-02-20";
        await confirmarAsistencia(asistencias, actorGerente, {
          dni, fecha, sede: SEDE_TALLER, entradaReal: `${fecha}T${tarde ? "08:15" : "08:02"}:00`, salidaReal: `${fecha}T16:00:00`,
        });
      }
    }

    // Reglas y confirmaciones sintéticas para abrir el borrador 2019-02 y observar el bloqueo de movilidad sin clasificar.
    const reglas = new RepositorioPostgresDeReglasLegales(db);
    for (const [codigo, valor] of [["rmv", "1000"], ["essalud_tasa", "9"], ["essalud_base_minima", "1000"], ["onp_tasa", "13"]] as const) {
      await activarReglaLegal(reglas, actorFinanzas, { codigo, valor, vigenteDesde: "2019-01-01", fuenteOficial: "Dato de demostración sintético QA 175; no es fuente oficial" });
    }
    const tardanzas = new RepositorioPostgresDeTardanzas(db);
    await configurarPoliticaDePenalizacionPorTardanzas(tardanzas, actorAdmin, {
      grupo: GRUPO_ASISTENCIA, toleranciaEnMinutos: 10, tardanzasAcumuladas: 1, horasPenalizadas: 1,
    });
    const periodoAbierto = await client.query<{ id: string }>("SELECT id FROM periodos_planilla WHERE inicio = $1", [PERIODO_ABIERTO.inicio]);
    if (!periodoAbierto.rows[0]) throw new Error("No se creó el período abierto sintético.");
    await aprobarAsistenciaDelGrupo(periodos, actorGerente, { periodoId: periodoAbierto.rows[0].id, grupo: GRUPO_ASISTENCIA });
    const fuentes = new RepositorioPostgresDeFuentesExternas(db);
    for (const { codigo } of TIPOS_DE_FUENTE) await confirmarFuente(fuentes, actorFinanzas, { tipoDeFuente: codigo, mes: "2019-02" });

    console.log("Escenario #175 sintético preparado: semana 2019-02-18 publicable con tardanza confirmada, y período 2018-12-26–2019-01-25 cerrado por el caso de uso, con revisión y hechos congelados.");
    console.log("Q1–Q2: dos grupos QA (uno sin asistencia), sedes, gerentes y política inicial; se aprobaron Tiendas, Taller y QA Taller con sus gerentes reales en el corte histórico. La aprobación QA del corte abierto también se creó por caso de uso: cambiar la penalización recalcula la tardanza del 20/02, invalida esa aprobación y conserva el snapshot cerrado de enero.");
    console.log("Q3–Q4: personas sintéticas sin sede fija y semana 2019-02-18 lista para navegador; probar selector y descarte de cambios allí.");
    console.log("Q5: `/pagos/condiciones-laborales` tiene banco, sueldo y movilidad; Ada inicia 2019-02-15 para mostrar S/140 en febrero de 28 días. Reglas y fuentes 2019-02 se registran como datos sintéticos.");
    console.log("Q6: usar gerente de Taller para Ada y gerente de Administración para Marta; probar fechas 2019-02-25/26. Registrar incidencia elimina la confirmación previa de incidencias_de_tienda; tras decidir, Finanzas debe confirmarla otra vez antes de revisar el efecto en Pagos.");
    console.log("Cierre histórico: snapshot generado por `cerrarPeriodo`; aprobaciones de Tiendas, Taller y QA Taller se registran por sus gerentes asignados y la lista blanca validada. Turnos y marcas históricos son datos sintéticos preparados por SQL.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Falló la preparación sintética del escenario #175.");
  process.exitCode = 1;
});
