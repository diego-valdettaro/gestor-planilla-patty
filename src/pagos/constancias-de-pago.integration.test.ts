import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import * as schema from "@/db/schema";

import { MENSAJE_DE_VERSION_OBSOLETA } from "./confirmar-pago";
import { ErrorDeMesYaConfirmado, ErrorDeVersionNoFinalizada, type NuevaConstanciaDePago } from "./constancias-de-pago";
import { MENSAJE_DE_PAGO_CONFIRMADO, type NuevaVersionDePago } from "./finalizar-mes";
import { RepositorioPostgresDeConstancias } from "./repositorio-postgres-de-constancias";
import { RepositorioPostgresDeVersiones } from "./repositorio-postgres-de-versiones";

// Persistencia de la constancia del pago realizado (#130, ADR 0013, contrato C1, C2, C4 y C5) contra PostgreSQL real, sin dobles de
// repositorio. Meses sintéticos 2095-10 y 2095-11, cada uno con su versión 1 (o más) guardada por el adaptador de versiones. Las
// constancias y las versiones son inmutables, así que cada prueba arma su mundo y lo retira al terminar con una conexión de
// superusuario de la base de PRUEBA (session_replication_role = replica). El SQL directo se usa solo para contar filas y para intentar
// romper la inmutabilidad, como lo haría un cliente externo. Cada grupo es una prueba por tabla de casos: `-t "G1"`, `-t "G2"`…
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

const MESES = ["2095-10", "2095-11"];
const CONFIRMADA_EN = new Date("2019-12-02T15:00:00Z");

describe.skipIf(!databaseUrl)("persistencia de la constancia del pago realizado en PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const versiones = new RepositorioPostgresDeVersiones(db);
  const constancias = new RepositorioPostgresDeConstancias(db);
  let cuentas: Array<{ id: string; nombreUsuario: string }>;
  let grupo: string;
  let sede: string;
  let dni: string;
  let relacionId: string;

  const cuentaNueva = async () => {
    const id = randomUUID();
    const cuenta = { id, nombreUsuario: `finanzas-${id}` };
    await db.insert(schema.cuentasLocales).values({ id, nombreUsuario: cuenta.nombreUsuario, hashContrasena: "prueba", rol: "finanzas" });
    cuentas.push(cuenta);
    return cuenta;
  };
  const versionNueva = (mes: string): NuevaVersionDePago => ({
    mesDePago: mes, finalizadaPorId: cuentas[0].id, finalizadaPor: cuentas[0].nombreUsuario, finalizadaEn: new Date("2095-10-26T15:00:00Z"),
    reglas: [], revisiones: [], fuentes: [],
    personas: [{ relacionId, dni, nombre: "Ana", subtotalCentimos: 200000, lineas: [], bases: [] }],
  });
  /** Guarda `cuantas` versiones finalizadas del mes (1, 2…), con una persona y sin líneas: lo único que la constancia necesita es que existan. */
  const versionar = async (mes: string, cuantas = 1) => {
    for (let i = 0; i < cuantas; i += 1) await versiones.guardarVersion(versionNueva(mes));
  };
  const solicitud = (mes: string, cuentaId: string, fechaDelPago: string, numeroDeVersion = 1): NuevaConstanciaDePago =>
    ({ mesDePago: mes, numeroDeVersion, fechaDelPago, confirmadaPorId: cuentaId, confirmadaEn: CONFIRMADA_EN });
  const filasDeConstancia = async (mes: string) => {
    const [{ cuenta }] = await db.select({ cuenta: sql<number>`count(*)::int` }).from(schema.constanciasDePago).where(eq(schema.constanciasDePago.mesDePago, mes));
    return cuenta;
  };

  beforeEach(async () => {
    cuentas = [];
    await cuentaNueva();
    grupo = `Grupo constancias ${randomUUID()}`;
    sede = `Sede constancias ${randomUUID()}`;
    dni = dniDePrueba();
    relacionId = randomUUID();
    await db.insert(schema.grupos).values({ nombre: grupo, gestionaAsistencia: false });
    await db.insert(schema.sedes).values({ nombre: sede, grupo });
    await db.insert(schema.colaboradores).values({ dni, nombre: "Ana", grupo, sede });
    await db.insert(schema.relacionesLaborales).values({
      id: relacionId, dni, ingreso: "2095-01-01", ingresoConfirmadoPorId: cuentas[0].id, ingresoConfirmadoEn: new Date(), registradaPorId: cuentas[0].id });
  });

  afterEach(async () => {
    const cliente = await pool.connect();
    try {
      // Ni las constancias ni las versiones se borran por la vía normal: solo la base de prueba, con permisos de superusuario, las retira.
      await cliente.query("SET session_replication_role = replica");
      await cliente.query("DELETE FROM constancias_de_pago WHERE mes_de_pago = ANY($1)", [MESES]);
      await cliente.query("DELETE FROM versiones_de_pago_personas WHERE version_id IN (SELECT id FROM versiones_de_pago WHERE mes_de_pago = ANY($1))", [MESES]);
      await cliente.query("DELETE FROM versiones_de_pago WHERE mes_de_pago = ANY($1)", [MESES]);
    } finally {
      await cliente.query("RESET session_replication_role");
      cliente.release();
    }
    await db.delete(schema.relacionesLaborales).where(eq(schema.relacionesLaborales.id, relacionId));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(inArray(schema.cuentasLocales.id, cuentas.map(({ id }) => id)));
  });

  // G1 · Una constancia por mes: la segunda confirmación del mismo mes se rechaza aunque llegue a la vez que otras (contrato C1 y C5, ADR 0013).
  const casosG1: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "P1", descripcion: "la segunda confirmación del mismo mes se rechaza y la constancia leída sigue siendo la primera",
      comprobar: async () => {
        const [primera, segunda] = [cuentas[0], await cuentaNueva()];
        await versionar("2095-10");
        await constancias.confirmar(solicitud("2095-10", primera.id, "2019-12-02"));

        await expect(constancias.confirmar(solicitud("2095-10", segunda.id, "2019-12-03"))).rejects.toBeInstanceOf(ErrorDeMesYaConfirmado);

        expect(await constancias.buscar("2095-10")).toMatchObject({ fechaDelPago: "2019-12-02", confirmadaPorId: primera.id });
        expect(await filasDeConstancia("2095-10")).toBe(1);
      },
    },
    {
      fila: "P2", descripcion: "cinco confirmaciones simultáneas del mismo mes: gana una y las otras cuatro se rechazan",
      comprobar: async () => {
        await versionar("2095-10");
        const responsables = [cuentas[0], ...(await Promise.all([1, 2, 3, 4].map(() => cuentaNueva())))];

        const resultados = await Promise.allSettled(responsables.map(({ id }, i) => constancias.confirmar(solicitud("2095-10", id, `2019-12-0${i + 1}`))));

        const ganadoras = resultados.filter((resultado) => resultado.status === "fulfilled");
        const rechazadas = resultados.filter((resultado) => resultado.status === "rejected");
        expect(ganadoras).toHaveLength(1);
        expect(rechazadas).toHaveLength(4);
        for (const rechazo of rechazadas) expect(rechazo.reason).toBeInstanceOf(ErrorDeMesYaConfirmado);
        expect(await filasDeConstancia("2095-10")).toBe(1);
        const ganadora = ganadoras[0].value;
        expect(await constancias.buscar("2095-10")).toMatchObject({ fechaDelPago: ganadora.fechaDelPago, confirmadaPorId: ganadora.confirmadaPorId });
      },
    },
    {
      fila: "P3", descripcion: "dos meses distintos conviven y cada uno devuelve la suya",
      comprobar: async () => {
        await versionar("2095-10");
        await versionar("2095-11");
        await constancias.confirmar(solicitud("2095-10", cuentas[0].id, "2019-12-02"));
        await constancias.confirmar(solicitud("2095-11", cuentas[0].id, "2019-12-09"));

        expect(await constancias.buscar("2095-10")).toMatchObject({ mesDePago: "2095-10", fechaDelPago: "2019-12-02" });
        expect(await constancias.buscar("2095-11")).toMatchObject({ mesDePago: "2095-11", fechaDelPago: "2019-12-09" });
      },
    },
  ];
  it.each(casosG1)("G1 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G2 · Fidelidad de lo guardado: la constancia se lee como se guardó, el mes pagado se distingue de los demás y solo se confirma una versión que existe (contrato C1 y C2).
  const casosG2: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "P4", descripcion: "la constancia se lee tal como se guardó: mes, versión, fecha del pago sin corrimiento, responsable e instante",
      comprobar: async () => {
        await versionar("2095-10");
        const devuelta = await constancias.confirmar(solicitud("2095-10", cuentas[0].id, "2019-12-02"));

        const esperada = {
          mesDePago: "2095-10", numeroDeVersion: 1, fechaDelPago: "2019-12-02", confirmadaPorId: cuentas[0].id,
          confirmadaPor: cuentas[0].nombreUsuario, confirmadaEn: CONFIRMADA_EN,
        };
        expect(devuelta).toEqual(esperada);
        expect(await constancias.buscar("2095-10")).toEqual(esperada);
      },
    },
    {
      fila: "P5", descripcion: "mesConPagoConfirmado es verdadero solo para el mes confirmado y buscar de un mes sin constancia no devuelve nada",
      comprobar: async () => {
        await versionar("2095-10");
        await versionar("2095-11");
        await constancias.confirmar(solicitud("2095-10", cuentas[0].id, "2019-12-02"));

        expect(await constancias.mesConPagoConfirmado("2095-10")).toBe(true);
        expect(await constancias.mesConPagoConfirmado("2095-11")).toBe(false);
        expect(await constancias.buscar("2095-11")).toBeUndefined();
      },
    },
    {
      fila: "P6", descripcion: "confirmar la versión 2 de un mes que solo tiene la 1 se rechaza y no queda ninguna fila",
      comprobar: async () => {
        await versionar("2095-10");

        await expect(constancias.confirmar(solicitud("2095-10", cuentas[0].id, "2019-12-02", 2))).rejects.toBeInstanceOf(ErrorDeVersionNoFinalizada);

        expect(await constancias.buscar("2095-10")).toBeUndefined();
        expect(await filasDeConstancia("2095-10")).toBe(0);
      },
    },
  ];
  it.each(casosG2)("G2 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G3 · La constancia es inmutable: la base rechaza modificarla o borrarla, también fuera del caso de uso (ADR 0013 «irreversible», patrón de la migración 0041).
  const INTEGRIDAD = { code: "23000" };
  const casosG3: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "P7", descripcion: "modificar la fecha, el responsable o la versión de la constancia se rechaza y la fila queda intacta",
      comprobar: async () => {
        const otra = await cuentaNueva();
        await versionar("2095-10", 2);
        const original = await constancias.confirmar(solicitud("2095-10", cuentas[0].id, "2019-12-02", 2)); // con dos versiones, la vigente es la 2 (R1-SPEC-01)

        await expect(pool.query("UPDATE constancias_de_pago SET fecha_del_pago = '2019-12-09' WHERE mes_de_pago = '2095-10'")).rejects.toMatchObject(INTEGRIDAD);
        await expect(pool.query("UPDATE constancias_de_pago SET confirmada_por_id = $1 WHERE mes_de_pago = '2095-10'", [otra.id])).rejects.toMatchObject(INTEGRIDAD);
        await expect(pool.query("UPDATE constancias_de_pago SET numero_de_version = 1 WHERE mes_de_pago = '2095-10'")).rejects.toMatchObject(INTEGRIDAD);

        expect(await constancias.buscar("2095-10")).toEqual(original);
      },
    },
    {
      fila: "P8", descripcion: "borrar la constancia se rechaza y la fila sigue",
      comprobar: async () => {
        await versionar("2095-10");
        const original = await constancias.confirmar(solicitud("2095-10", cuentas[0].id, "2019-12-02"));

        await expect(pool.query("DELETE FROM constancias_de_pago WHERE mes_de_pago = '2095-10'")).rejects.toMatchObject(INTEGRIDAD);

        expect(await constancias.buscar("2095-10")).toEqual(original);
      },
    },
  ];
  it.each(casosG3)("G3 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G4 · Tras la constancia el mes no admite otra versión, ni siquiera si la finalización estaba en curso: la base lo decide, no solo el caso de uso (contrato C2, ADR 0013).
  const casosG4: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "P9", descripcion: "con constancia en el mes, guardar otra versión se rechaza y las versiones siguen siendo las mismas",
      comprobar: async () => {
        await versionar("2095-10");
        await constancias.confirmar(solicitud("2095-10", cuentas[0].id, "2019-12-02"));

        await expect(versiones.guardarVersion(versionNueva("2095-10"))).rejects.toThrow(MENSAJE_DE_PAGO_CONFIRMADO);

        expect((await versiones.listarVersiones("2095-10")).map(({ numero }) => numero)).toEqual([1]);
      },
    },
  ];
  it.each(casosG4)("G4 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G26 · Confirmar y finalizar a la vez (R1-SPEC-01, ADR 0013, contrato C1 y C5): con el bloqueo del mes retenido, las dos operaciones llegan en un orden
  // conocido; gana la primera y la segunda se rechaza. Nunca se registra el pago sobre una versión que ya no es la vigente.
  const esperar = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));
  const estadoDe = (promesa: Promise<unknown>) => Promise.race([promesa.then(() => "resuelta", () => "rechazada"), esperar(400).then(() => "pendiente")]);
  /** Mantiene el bloqueo del mes como lo haría una operación en curso, hasta que se llame a `soltar`. */
  const retenerBloqueoDelMes = async (mes: string) => {
    const cliente = await pool.connect();
    await cliente.query("BEGIN");
    await cliente.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`pago-del-mes:${mes}`]);
    let suelto = false;
    return { soltar: async () => { if (suelto) return; suelto = true; await cliente.query("COMMIT"); cliente.release(); } };
  };
  const casosG26: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "P10", descripcion: "la finalización de la versión 2 llega primero y la confirmación de la versión 1 se rechaza como obsoleta: sin constancia y con la versión 2",
      comprobar: async () => {
        await versionar("2095-10");
        const retenido = await retenerBloqueoDelMes("2095-10");
        const pendientes: Array<Promise<unknown>> = [];
        try {
          const finalizacion = versiones.guardarVersion(versionNueva("2095-10"));
          pendientes.push(finalizacion.catch(() => undefined));
          expect(await estadoDe(finalizacion)).toBe("pendiente");
          const confirmacion = constancias.confirmar(solicitud("2095-10", cuentas[0].id, "2019-12-02", 1));
          pendientes.push(confirmacion.catch(() => undefined));
          expect(await estadoDe(confirmacion)).toBe("pendiente");
          await retenido.soltar();

          await expect(finalizacion).resolves.toMatchObject({ numero: 2 });
          await expect(confirmacion).rejects.toThrow(MENSAJE_DE_VERSION_OBSOLETA);
          expect(await constancias.buscar("2095-10")).toBeUndefined();
          expect(await filasDeConstancia("2095-10")).toBe(0);
          expect((await versiones.listarVersiones("2095-10")).map(({ numero }) => numero)).toEqual([1, 2]);
        } finally {
          await retenido.soltar();
          await Promise.all(pendientes);
        }
      },
    },
    {
      fila: "P11", descripcion: "la confirmación de la versión 1 llega primero y gana: la finalización se rechaza con la causa del pago y la versión 2 no existe",
      comprobar: async () => {
        await versionar("2095-10");
        const retenido = await retenerBloqueoDelMes("2095-10");
        const pendientes: Array<Promise<unknown>> = [];
        try {
          const confirmacion = constancias.confirmar(solicitud("2095-10", cuentas[0].id, "2019-12-02", 1));
          pendientes.push(confirmacion.catch(() => undefined));
          expect(await estadoDe(confirmacion)).toBe("pendiente");
          const finalizacion = versiones.guardarVersion(versionNueva("2095-10"));
          pendientes.push(finalizacion.catch(() => undefined));
          expect(await estadoDe(finalizacion)).toBe("pendiente");
          await retenido.soltar();

          await expect(confirmacion).resolves.toMatchObject({ mesDePago: "2095-10", numeroDeVersion: 1 });
          await expect(finalizacion).rejects.toThrow(MENSAJE_DE_PAGO_CONFIRMADO);
          expect(await filasDeConstancia("2095-10")).toBe(1);
          expect((await versiones.listarVersiones("2095-10")).map(({ numero }) => numero)).toEqual([1]);
        } finally {
          await retenido.soltar();
          await Promise.all(pendientes);
        }
      },
    },
    {
      fila: "P12", descripcion: "con constancia en 2095-10, finalizar y confirmar 2095-11 siguen permitidos: el rechazo es solo del mes pagado",
      comprobar: async () => {
        await versionar("2095-10");
        await constancias.confirmar(solicitud("2095-10", cuentas[0].id, "2019-12-02"));

        await versionar("2095-11", 2);
        await constancias.confirmar(solicitud("2095-11", cuentas[0].id, "2019-12-09", 2));

        expect((await versiones.listarVersiones("2095-11")).map(({ numero }) => numero)).toEqual([1, 2]);
        expect(await constancias.buscar("2095-11")).toMatchObject({ numeroDeVersion: 2 });
        expect(await constancias.buscar("2095-10")).toMatchObject({ numeroDeVersion: 1 });
      },
    },
  ];
  it.each(casosG26)("G26 $fila $descripcion", async ({ comprobar }) => comprobar());
});
