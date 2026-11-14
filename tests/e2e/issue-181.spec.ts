import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { crearEscenario181, limpiarEscenario181, urlEscenario181 } from "../../scripts/escenarios/issue-181";

test.beforeEach(async () => { const pool = new Pool({ connectionString: urlEscenario181() }); try { await crearEscenario181(pool); } finally { await pool.end(); } });
test.afterEach(async () => { const pool = new Pool({ connectionString: urlEscenario181() }); try { await limpiarEscenario181(pool); } finally { await pool.end(); } });

function semanaDemo() {
  const hoy = new Date();
  const primerDia = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  const dia = primerDia.getUTCDay() || 7;
  primerDia.setUTCDate(1 + ((8 - dia) % 7));
  return primerDia.toISOString().slice(0, 10);
}

test("G4a completar y republicar guarda grupo, publica persona y conserva historial", async ({ page }) => {
  test.setTimeout(120_000);
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw || new URL(raw).hostname !== "127.0.0.1" || new URL(raw).pathname !== "/planilla_test" || process.env.DATABASE_URL !== raw) throw new Error("Base de prueba no aislada");
  const pool = new Pool({ connectionString: raw });
  const semana = semanaDemo();
  async function estado() {
    const turnos = await pool.query(`SELECT dni, fecha::text, entrada_programada, salida_programada, motivo_no_asistencia FROM turnos_publicados WHERE dni IN ('99918102','99918103') AND fecha >= $1::date AND fecha <= $1::date + 6 ORDER BY dni, fecha`, [semana]);
    const historial = await pool.query(`SELECT t.dni, t.fecha::text, h.id, h.motivo FROM historial_turnos_publicados h JOIN turnos_publicados t ON t.id = h.turno_publicado_id WHERE t.dni IN ('99918102','99918103') AND t.fecha >= $1::date AND t.fecha <= $1::date + 6 ORDER BY t.dni,t.fecha,h.id`, [semana]);
    return { turnos: turnos.rows, historial: historial.rows };
  }
  try {
    const antes = await estado();
    await page.goto("/iniciar-sesion");
    await page.getByLabel("Usuario").fill("gerente-tiendas");
    await page.getByLabel("Contraseña").fill("gerente-tiendas");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/turnos$/);
    await page.goto(`/turnos?semana=${semana}&equipo=QA%20181%20Horarios`);
    for (const nombre of ["Ana QA 181", "Beto QA 181"]) {
      const fila = page.locator("tr", { hasText: nombre });
      await fila.getByRole("button", { name: `Acciones de ${nombre}` }).click();
      await fila.getByRole("menuitem", { name: /Completar semana/ }).click();
      const dialogo = page.getByRole("dialog", { name: `Completar semana de ${nombre}` });
      await dialogo.locator(".dias-completar-semana select").first().selectOption("permiso");
      await dialogo.getByRole("button", { name: "Completar semana" }).click();
      await expect(dialogo).toBeHidden();
    }
    const beto = page.locator("tr", { hasText: "Beto QA 181" });
    await beto.getByRole("button", { name: "Acciones de Beto QA 181" }).click();
    await beto.getByRole("menuitem", { name: /Republicar cambios/ }).click();
    const dialogo = page.getByRole("dialog", { name: /Republicar los cambios de Beto/ });
    await dialogo.getByLabel("Motivo de la republicación").fill("Corrección de prueba 181");
    await dialogo.getByRole("button", { name: "Republicar cambios" }).click();
    await expect(beto.locator("th .est-etiqueta")).toHaveText("Publicado", { timeout: 15_000 });
    await page.reload();
    await expect(beto.locator("th .est-etiqueta")).toHaveText("Publicado");
    await expect(beto.getByRole("button", { name: new RegExp(`Horario de Beto QA 181 para ${semana}`) })).toContainText("Permiso");
    const despues = await estado();
    expect(despues.turnos.find(row => row.dni === "99918102" && row.fecha === semana)?.motivo_no_asistencia).toBe("permiso");
    expect(despues.turnos.filter(row => row.dni === "99918103")).toEqual(antes.turnos.filter(row => row.dni === "99918103"));
    expect(despues.historial.filter(row => row.dni === "99918103")).toEqual(antes.historial.filter(row => row.dni === "99918103"));
    expect(despues.historial).toEqual(expect.arrayContaining(antes.historial));
    expect(despues.historial.some(row => row.dni === "99918102" && row.motivo === "Corrección de prueba 181")).toBe(true);
    const borrador = await pool.query(`SELECT c.motivo_no_asistencia FROM celdas_planes_semanales_en_borrador c JOIN planes_semanales_en_borrador p ON p.id=c.plan_id WHERE p.semana=$1 AND p.equipo='QA 181 Horarios' AND c.dni='99918101' AND c.fecha=$1`, [semana]);
    expect(borrador.rows[0]?.motivo_no_asistencia).toBe("permiso");
  } finally { await pool.end(); }
});

test("G4b fallo al guardar impide republicar y conserva publicado e historial", async ({ page }) => {
  test.setTimeout(120_000);
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw || new URL(raw).hostname !== "127.0.0.1" || new URL(raw).pathname !== "/planilla_test" || process.env.DATABASE_URL !== raw) throw new Error("Base de prueba no aislada");
  const pool = new Pool({ connectionString: raw });
  const semana = semanaDemo();
  async function estado() {
    const publicados = await pool.query(`SELECT fecha::text, entrada_programada, salida_programada, motivo_no_asistencia FROM turnos_publicados WHERE dni='99918102' AND fecha >= $1::date AND fecha <= $1::date + 6 ORDER BY fecha`, [semana]);
    const historial = await pool.query(`SELECT h.id, h.motivo FROM historial_turnos_publicados h JOIN turnos_publicados t ON t.id=h.turno_publicado_id WHERE t.dni='99918102' AND t.fecha >= $1::date AND t.fecha <= $1::date + 6 ORDER BY h.id`, [semana]);
    return { publicados: publicados.rows, historial: historial.rows };
  }
  try {
    const antes = await estado();
    await page.goto("/iniciar-sesion");
    await page.getByLabel("Usuario").fill("gerente-tiendas");
    await page.getByLabel("Contraseña").fill("gerente-tiendas");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/turnos$/);
    await page.goto(`/turnos?semana=${semana}&equipo=QA%20181%20Horarios`);
    const beto = page.locator("tr", { hasText: "Beto QA 181" });
    await beto.getByRole("button", { name: "Acciones de Beto QA 181" }).click();
    await beto.getByRole("menuitem", { name: /Completar semana/ }).click();
    const completar = page.getByRole("dialog", { name: "Completar semana de Beto QA 181" });
    await completar.locator(".dias-completar-semana select").first().selectOption("permiso");
    await completar.getByRole("button", { name: "Completar semana" }).click();
    await expect(completar).toBeHidden();
    await beto.getByRole("button", { name: "Acciones de Beto QA 181" }).click();
    await beto.getByRole("menuitem", { name: /Republicar cambios/ }).click();
    const dialogo = page.getByRole("dialog", { name: /Republicar los cambios de Beto/ });
    await dialogo.getByLabel("Motivo de la republicación").fill("Corrección de prueba 181");
    let acciones = 0;
    await page.route("**/turnos**", async route => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
        acciones += 1;
        if (acciones === 1) return route.abort("failed");
      }
      await route.continue();
    });
    await dialogo.getByRole("button", { name: "Republicar cambios" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Failed to fetch" })).toHaveText("Failed to fetch", { timeout: 15_000 });
    await expect(page.getByRole("button", { name: /error de la planificación/ })).toBeVisible();
    expect(acciones).toBe(1);
    expect(await estado()).toEqual(antes);
  } finally { await pool.end(); }
});

test("guardas cancelar y motivo vacío no republican ni alteran historial", async ({ page }) => {
  test.setTimeout(120_000);
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw || new URL(raw).hostname !== "127.0.0.1" || new URL(raw).pathname !== "/planilla_test" || process.env.DATABASE_URL !== raw) throw new Error("Base de prueba no aislada");
  const pool = new Pool({ connectionString: raw });
  const semana = semanaDemo();
  async function estado() {
    const publicados = await pool.query(`SELECT fecha::text, entrada_programada, salida_programada, motivo_no_asistencia FROM turnos_publicados WHERE dni='99918102' AND fecha >= $1::date AND fecha <= $1::date + 6 ORDER BY fecha`, [semana]);
    const historial = await pool.query(`SELECT h.id, h.motivo FROM historial_turnos_publicados h JOIN turnos_publicados t ON t.id=h.turno_publicado_id WHERE t.dni='99918102' AND t.fecha >= $1::date AND t.fecha <= $1::date + 6 ORDER BY h.id`, [semana]);
    return { publicados: publicados.rows, historial: historial.rows };
  }
  try {
    const antes = await estado();
    await page.goto("/iniciar-sesion");
    await page.getByLabel("Usuario").fill("gerente-tiendas");
    await page.getByLabel("Contraseña").fill("gerente-tiendas");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/turnos$/);
    await page.goto(`/turnos?semana=${semana}&equipo=QA%20181%20Horarios`);
    const beto = page.locator("tr", { hasText: "Beto QA 181" });
    await beto.getByRole("button", { name: "Acciones de Beto QA 181" }).click();
    await beto.getByRole("menuitem", { name: /Completar semana/ }).click();
    const completar = page.getByRole("dialog", { name: "Completar semana de Beto QA 181" });
    await completar.locator(".dias-completar-semana select").first().selectOption("permiso");
    await completar.getByRole("button", { name: "Completar semana" }).click();
    await expect(completar).toBeHidden();
    await beto.getByRole("button", { name: "Acciones de Beto QA 181" }).click();
    await beto.getByRole("menuitem", { name: /Republicar cambios/ }).click();
    const dialogo = page.getByRole("dialog", { name: /Republicar los cambios de Beto/ });
    let acciones = 0;
    page.on("request", request => { if (request.method() === "POST" && request.headers()["next-action"]) acciones += 1; });
    await dialogo.getByRole("button", { name: "Republicar cambios" }).click();
    expect(await dialogo.getByLabel("Motivo de la republicación").evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialogo).toBeHidden();
    expect(acciones).toBe(0);
    expect(await estado()).toEqual(antes);
  } finally { await pool.end(); }
});
