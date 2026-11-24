import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { crearEscenario185, limpiarEscenario185, urlEscenario185, GRUPO_185, PERSONAS_185, NOMBRES_185, FECHAS_185, SEMANA_185 } from "../../scripts/escenarios/issue-185";

async function conBase<T>(accion: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: urlEscenario185() });
  try { return await accion(pool); } finally { await pool.end(); }
}

test.beforeEach(async () => { await conBase(async pool => { await limpiarEscenario185(pool); await crearEscenario185(pool); }); });
test.afterEach(async () => { await conBase(limpiarEscenario185); });

async function entrar(page: Page, vista: "semanal" | "mensual" = "semanal") {
  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("gerente-tiendas");
  await page.getByLabel("Contraseña").fill("gerente-tiendas");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/turnos$/, { timeout: 30_000 });
  const parametros = new URLSearchParams({ fecha: SEMANA_185, grupo: GRUPO_185, colaborador: PERSONAS_185.ana, vista });
  await page.goto(`/asistencias?${parametros}`);
  await expect(page.getByLabel("Grupo operativo", { exact: true })).toBeEnabled();
}

async function instantanea() {
  return conBase(async pool => ({
    jornadas: (await pool.query("SELECT fecha::text,estado,entrada_propuesta,salida_propuesta,entrada_real,salida_real FROM asistencias_esperadas WHERE dni=$1 ORDER BY fecha", [PERSONAS_185.ana])).rows,
    ajustes: (await pool.query("SELECT a.motivo,a.entrada_real,a.salida_real FROM ajustes_de_asistencia a JOIN asistencias_esperadas e ON e.id=a.asistencia_id WHERE e.dni=$1 ORDER BY a.id", [PERSONAS_185.ana])).rows,
    marcas: (await pool.query("SELECT fecha::text,instante FROM marcas_crudas WHERE dni=$1 ORDER BY fecha,instante", [PERSONAS_185.ana])).rows,
  }));
}

const casos = ["registrar con teclado", "ajustar con ratón", "cancelar desde resumen", "solo lectura"] as const;
for (const caso of casos) {
  test(`185 editor semanal: ${caso}`, async ({ page }) => {
    test.setTimeout(90_000);
    await entrar(page);
    const fecha = caso === "registrar con teclado" ? FECHAS_185.registrar : caso === "solo lectura" ? FECHAS_185.cerrada : FECHAS_185.ajustar;
    const estado = caso === "registrar con teclado" ? "Pendiente de revisión" : caso === "solo lectura" ? "Liquidado" : "Registrada";
    const boton = page.getByRole("button", { name: `Asistencia de ${NOMBRES_185.ana} para ${fecha}: ${estado}`, exact: true });
    // Todos los casos observan primero la capacidad semanal ausente en base; no anticipar implementación compartida.
    await expect(boton).toBeVisible({ timeout: 5_000 });
    const antes = await instantanea();
    if (caso === "registrar con teclado") { await boton.focus(); await page.keyboard.press("Enter"); }
    else await boton.click();
    const dialogo = page.locator("dialog[open]");
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByRole("heading", { name: caso === "registrar con teclado" ? "Registrar asistencia" : caso === "solo lectura" ? "Día liquidado" : "Ajustar asistencia", exact: true })).toBeVisible();
    if (caso === "solo lectura") {
      await expect(dialogo).toContainText("No se puede editar");
      await expect(dialogo.getByLabel("Hora de ingreso")).toHaveCount(0);
      await dialogo.getByRole("button", { name: "Cerrar", exact: true }).click();
      await expect(boton).toBeFocused();
      expect(await instantanea()).toEqual(antes);
      return;
    }
    await expect(dialogo.getByRole("region", { name: "Marcas importadas originales" })).toContainText("09:00");
    await expect(dialogo.getByRole("region", { name: "Marcas importadas originales" })).toContainText("17:00");
    if (caso === "registrar con teclado") {
      await expect(dialogo.getByLabel("Hora de ingreso")).toHaveValue("09:00");
      await expect(dialogo.getByLabel("Hora de salida")).toHaveValue("17:00");
      await dialogo.getByRole("button", { name: "Guardar asistencia", exact: true }).click();
    } else {
      await dialogo.getByLabel("Hora de salida").fill("16:30");
      await dialogo.getByLabel("Motivo del ajuste").fill("Corrección ficticia QA185");
      await dialogo.getByRole("button", { name: "Revisar ajuste", exact: true }).click();
      const resumen = dialogo.getByRole("region", { name: "Resumen del ajuste" });
      for (const texto of [NOMBRES_185.ana, fecha, "17:00", "16:30", "Corrección ficticia QA185", "conserva confirmada", "aprobación del grupo"]) await expect(resumen).toContainText(texto);
      if (caso === "cancelar desde resumen") {
        await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
        await expect(dialogo).toBeHidden();
        await expect(boton).toBeFocused();
        await page.reload();
        expect(await instantanea()).toEqual(antes);
        return;
      }
      await dialogo.getByRole("button", { name: "Confirmar ajuste", exact: true }).click();
    }
    await expect(dialogo).toBeHidden();
    await expect(page.getByRole("link", { name: "Vista semanal", exact: true })).toHaveAttribute("aria-current", "page");
    const registrada = page.getByRole("button", { name: `Asistencia de ${NOMBRES_185.ana} para ${fecha}: Registrada`, exact: true });
    await expect(registrada).toContainText(caso === "registrar con teclado" ? "09:00–17:00" : "09:00–16:30");
    await page.reload();
    await expect(registrada).toContainText(caso === "registrar con teclado" ? "09:00–17:00" : "09:00–16:30");
    await registrada.click();
    const ajuste = page.getByRole("dialog", { name: "Ajustar asistencia", exact: true });
    await expect(ajuste.getByRole("region", { name: "Marcas importadas originales" })).toContainText("17:00");
    await expect(ajuste.getByLabel("Hora de salida")).toHaveValue(caso === "registrar con teclado" ? "17:00" : "16:30");
    const despues = await instantanea();
    expect(despues.marcas).toEqual(antes.marcas);
    expect(despues.jornadas.find(j => j.fecha === fecha)?.estado).toBe("confirmada");
    expect(despues.jornadas.find(j => j.fecha === fecha)?.salida_propuesta).toBe(`${fecha}T17:00`);
    if (caso === "ajustar con ratón") expect(despues.ajustes).toEqual([{ motivo: "Corrección ficticia QA185", entrada_real: `${fecha}T09:00`, salida_real: `${fecha}T16:30` }]);
  });
}

for (const caso of ["registrar", "ajustar", "cancelar", "liquidado", "sin planificación", "manual"] as const) {
  test(`185 guarda mensual: ${caso}`, async ({ page }) => {
    test.setTimeout(90_000);
    await entrar(page, "mensual");
    const fecha = caso === "registrar" ? FECHAS_185.registrar : caso === "liquidado" ? FECHAS_185.cerrada : caso === "sin planificación" ? FECHAS_185.sinPlan : caso === "manual" ? FECHAS_185.manual : FECHAS_185.ajustar;
    const antes = await instantanea();
    await page.getByRole("button", { name: new RegExp(`^Asistencia del ${fecha}:`) }).click();
    const dialogo = page.locator("dialog[open]");
    await expect(dialogo).toBeVisible();
    if (["liquidado", "sin planificación", "manual"].includes(caso)) {
      await expect(dialogo.getByLabel("Hora de ingreso")).toHaveCount(0);
      await expect(dialogo).toContainText(caso === "liquidado" ? "No se puede editar" : caso === "sin planificación" ? "No hay un horario publicado" : "designación");
      await dialogo.getByRole("button", { name: "Cerrar", exact: true }).click();
      expect(await instantanea()).toEqual(antes);
    } else if (caso === "registrar") {
      await dialogo.getByLabel("Hora de ingreso").fill("09:00");
      await dialogo.getByLabel("Hora de salida").fill("17:00");
      await dialogo.getByRole("button", { name: "Guardar asistencia", exact: true }).click();
      await expect(dialogo).toBeHidden();
      expect((await instantanea()).jornadas.find(j => j.fecha === fecha)?.estado).toBe("confirmada");
    } else {
      await dialogo.getByLabel("Hora de salida").fill("16:30");
      await dialogo.getByLabel("Motivo del ajuste").fill("Guarda mensual QA185");
      await dialogo.getByRole("button", { name: "Revisar ajuste", exact: true }).click();
      await expect(dialogo.getByRole("region", { name: "Resumen del ajuste" })).toContainText("16:30");
      await dialogo.getByRole("button", { name: caso === "cancelar" ? "Cancelar" : "Confirmar ajuste", exact: true }).click();
      await expect(dialogo).toBeHidden();
      if (caso === "cancelar") expect(await instantanea()).toEqual(antes);
      else expect((await instantanea()).ajustes).toHaveLength(1);
    }
  });
}

const casosDeMarcasVisibles = (["semanal", "mensual"] as const).flatMap((vista) =>
  (["incompleta cancelar", "incompleta registrar", "múltiples ajustar", "múltiples cancelar ajuste"] as const).map((caso) => ({ vista, caso })),
);
for (const { vista, caso } of casosDeMarcasVisibles) {
  test(`185-SPEC-001 marcas visibles: ${vista} / ${caso}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const incompleta = caso.startsWith("incompleta");
    const fecha = incompleta ? FECHAS_185.incompleta : FECHAS_185.ajustar;
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
    page.on("response", (r) => { if (r.status() >= 400) errores.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    await conBase(async (pool) => {
      if (incompleta) {
        // Permite registrar la fecha ficticia sin cambiar el fixture general ni sus recorridos de cierre.
        await pool.query("UPDATE relaciones_laborales SET cese=$2 WHERE dni=$1", [PERSONAS_185.ana, fecha]);
      } else {
        await pool.query("INSERT INTO marcas_crudas(importacion_id,dni,fecha,instante,sede) SELECT importacion_id,dni,fecha,$3,sede FROM marcas_crudas WHERE dni=$1 AND fecha=$2 LIMIT 1", [PERSONAS_185.ana, fecha, `${fecha}T12:15:30`]);
      }
    });
    const antes = await instantanea();
    await entrar(page, vista);
    const abrir = async () => {
      const boton = page.getByRole("button", { name: vista === "semanal" ? new RegExp(`^Asistencia de ${NOMBRES_185.ana} para ${fecha}:`) : new RegExp(`^Asistencia del ${fecha}:`) });
      if (vista === "semanal") { await boton.focus(); await page.keyboard.press("Enter"); }
      else await boton.click();
      return boton;
    };
    const boton = await abrir();
    const dialogo = page.locator("dialog[open]");
    const marcas = dialogo.getByRole("region", { name: "Marcas importadas originales" });
    const comprobarMarcas = async () => {
      for (const hora of incompleta ? ["09:00"] : ["09:00", "12:15:30", "17:00"]) {
        // Texto propio de cada marca, separado de las frases de propuestas/horas confirmadas.
        await expect(marcas.getByText(hora, { exact: true })).toBeVisible();
      }
    };
    await comprobarMarcas();
    if (incompleta) {
      await expect(dialogo.getByLabel("Hora de ingreso")).toHaveValue("");
      await expect(dialogo.getByLabel("Hora de salida")).toHaveValue("");
    } else {
      await expect(marcas).toContainText("Entrada propuesta: 09:00");
      await expect(marcas).toContainText("Salida propuesta: 17:00");
    }
    if (page.viewportSize()?.width === 375) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
      expect(await dialogo.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("marcas-375.png"), fullPage: true });
    }
    if (caso === "incompleta cancelar") {
      await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(boton).toBeFocused();
      await page.reload();
      expect(await instantanea()).toEqual(antes);
    } else if (incompleta) {
      await dialogo.getByLabel("Hora de ingreso").fill("09:00");
      await dialogo.getByLabel("Hora de salida").fill("17:00");
      await dialogo.getByRole("button", { name: "Guardar asistencia", exact: true }).click();
      await expect(dialogo).toBeHidden();
    } else {
      await dialogo.getByLabel("Hora de salida").fill("16:30");
      await dialogo.getByLabel("Motivo del ajuste").fill("Conservar marcas crudas QA185");
      await dialogo.getByRole("button", { name: "Revisar ajuste", exact: true }).click();
      await comprobarMarcas();
      await expect(dialogo.getByRole("region", { name: "Resumen del ajuste" })).toContainText("conserva confirmada");
      await dialogo.getByRole("button", { name: caso === "múltiples ajustar" ? "Confirmar ajuste" : "Cancelar", exact: true }).click();
      await expect(dialogo).toBeHidden();
      if (caso === "múltiples cancelar ajuste") {
        await expect(boton).toBeFocused();
        expect(await instantanea()).toEqual(antes);
      }
    }
    await page.reload();
    await abrir();
    await comprobarMarcas();
    const despues = await instantanea();
    expect(despues.marcas).toEqual(antes.marcas);
    expect(despues.jornadas.map((j) => [j.fecha, j.entrada_propuesta, j.salida_propuesta])).toEqual(antes.jornadas.map((j) => [j.fecha, j.entrada_propuesta, j.salida_propuesta]));
    if (caso === "incompleta registrar" || caso === "múltiples ajustar") {
      expect(despues.jornadas.find((j) => j.fecha === fecha)?.estado).toBe("confirmada");
      await expect(dialogo.getByLabel("Hora de salida")).toHaveValue(caso === "múltiples ajustar" ? "16:30" : "17:00");
    }
    await testInfo.attach("diagnosticos-navegador", { body: JSON.stringify({ errores, vista, caso, viewport: page.viewportSize() }), contentType: "application/json" });
    expect(errores).toEqual([]);
  });
}
