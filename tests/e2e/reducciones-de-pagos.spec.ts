import { expect, test, type Page } from "@playwright/test";

// Recorridos de #123 sobre la persona sembrada «Gloria Reducciones» (DNI 99900015, sueldo S/ 1.800,00, jornada de 480 min).
// Importes de referencia: tardanza real de 15 min S/ 1,88; día S/ 60,00; descanso semanal S/ 2,00.
const DNI_DE_GLORIA = "99900015";

function observarErroresDelNavegador(page: Page): string[] {
  const errores: string[] = [];
  page.on("console", (mensaje) => {
    if (mensaje.type() === "error") errores.push(mensaje.text());
  });
  page.on("pageerror", (error) => errores.push(error.message));
  return errores;
}

async function iniciarSesion(page: Page, usuario: string) {
  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill(usuario);
  await page.getByLabel("Contraseña").fill(usuario);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/iniciar-sesion"), { timeout: 30_000 });
}

function mesDePagoActual(): string {
  return new Date().toISOString().slice(0, 7);
}

async function abrirDetalleDeGloria(page: Page) {
  await page.goto(`/pagos/${mesDePagoActual()}/${DNI_DE_GLORIA}`);
  await expect(page.getByRole("heading", { name: "Gloria Reducciones", level: 1 })).toBeVisible({ timeout: 60_000 });
}

test("E2E-01 Finanzas ve las reducciones separadas, con sus importes y la referencia a la jornada", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);
  await iniciarSesion(page, "finanzas");
  await abrirDetalleDeGloria(page);

  const conceptos = page.getByRole("region", { name: "Conceptos de la persona" });
  const tardanza = conceptos.locator("tr", { hasText: "Tardanza real" });
  const falta = conceptos.locator("tr", { hasText: "Reducción por falta" });
  const descanso = conceptos.locator("tr", { hasText: "Reducción por descanso semanal" });
  await expect(tardanza.getByRole("cell", { name: "15 min", exact: true })).toBeVisible();
  await expect(tardanza).toContainText("S/ 1,88");
  await expect(falta.getByRole("cell", { name: "1 día", exact: true })).toBeVisible();
  await expect(falta).toContainText("S/ 60,00");
  await expect(descanso).toContainText("S/ 2,00");

  await falta.getByText("Ver base").click();
  await expect(falta.getByRole("link", { name: "Ver jornada" })).toHaveAttribute("href", /\/asistencias\?vista=mensual&grupo=Tienda(s)?.*colaborador=99900015/);
  expect(errores).toEqual([]);
});

function fechaDeLaSemanaDeDemo(indiceDelDia: number): string {
  const hoy = new Date();
  const primero = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  const diaDeLaSemana = primero.getUTCDay() === 0 ? 7 : primero.getUTCDay();
  primero.setUTCDate(1 + ((8 - diaDeLaSemana) % 7) + indiceDelDia);
  return primero.toISOString().slice(0, 10);
}

// Gloria: el miércoles tiene un permiso y el jueves una suspensión, ambos sin clasificar en el seed.
const FECHA_DEL_PERMISO = fechaDeLaSemanaDeDemo(2);
const FECHA_DE_LA_SUSPENSION = fechaDeLaSemanaDeDemo(3);

// E2E-04 va antes que E2E-02 y E2E-03: estas clasifican las jornadas pendientes y la base se comparte dentro de la corrida.
test("E2E-04 a 375 px la clasificación pendiente es visible y bloqueante", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await iniciarSesion(page, "finanzas");
  await abrirDetalleDeGloria(page);

  await expect(page.getByText("Bloqueada", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "no tiene clasificación de goce" }).first()).toBeVisible();
  const panel = page.getByRole("region", { name: "Permisos y suspensiones" });
  const permiso = panel.getByRole("group", { name: new RegExp(`Permiso del ${FECHA_DEL_PERMISO}`) });
  await expect(permiso).toContainText("Pendiente de clasificar");
  await expect(permiso.getByLabel("Sin goce")).toBeVisible();
  await expect(permiso.getByRole("button", { name: "Guardar clasificación" })).toBeVisible();
  expect(errores).toEqual([]);
});

test("E2E-02 Finanzas clasifica un permiso sin goce y la reducción persiste tras recargar", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);
  await iniciarSesion(page, "finanzas");
  await abrirDetalleDeGloria(page);

  const panel = page.getByRole("region", { name: "Permisos y suspensiones" });
  const permiso = panel.getByRole("group", { name: new RegExp(`Permiso del ${FECHA_DEL_PERMISO}`) });
  await permiso.getByLabel("Sin goce").check();
  await permiso.getByRole("button", { name: "Guardar clasificación" }).click();
  await expect(panel.getByRole("status").filter({ hasText: "Clasificación guardada" })).toBeVisible({ timeout: 30_000 });

  for (const recarga of [false, true]) {
    if (recarga) await page.reload();
    const conceptos = page.getByRole("region", { name: "Conceptos de la persona" });
    await expect(conceptos.locator("tr", { hasText: /^Ausencia sin goce/ }).filter({ hasText: FECHA_DEL_PERMISO })).toContainText("S/ 60,00");
    await expect(conceptos.locator("tr", { hasText: /^Reducción por descanso semanal/ }).filter({ hasText: FECHA_DEL_PERMISO })).toContainText("S/ 2,00");
    await expect(panel.getByRole("group", { name: new RegExp(`Permiso del ${FECHA_DEL_PERMISO}`) })).toHaveCount(0);
    await expect(panel).toContainText(`Permiso del ${FECHA_DEL_PERMISO}`);
    await expect(panel.locator("li", { hasText: FECHA_DEL_PERMISO })).toContainText("Sin goce");
  }
  expect(errores).toEqual([]);
});

test("E2E-03 Finanzas clasifica una suspensión con goce: no reduce y persiste tras recargar", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);
  await iniciarSesion(page, "finanzas");
  await abrirDetalleDeGloria(page);

  const panel = page.getByRole("region", { name: "Permisos y suspensiones" });
  const suspension = panel.getByRole("group", { name: new RegExp(`Suspensión del ${FECHA_DE_LA_SUSPENSION}`) });
  await suspension.getByLabel("Con goce").check();
  await suspension.getByRole("button", { name: "Guardar clasificación" }).click();
  await expect(panel.getByRole("status").filter({ hasText: "Clasificación guardada" })).toBeVisible({ timeout: 30_000 });

  for (const recarga of [false, true]) {
    if (recarga) await page.reload();
    await expect(panel.locator("li", { hasText: FECHA_DE_LA_SUSPENSION })).toContainText("Con goce");
    await expect(page.getByRole("region", { name: "Conceptos de la persona" }).locator("tr", { hasText: FECHA_DE_LA_SUSPENSION })).toHaveCount(0);
  }
  expect(errores).toEqual([]);
});

// ES-01 es una prueba POSTERIOR (capa estilos, excepción declarada): a 375 px el desglose y el panel de clasificación no desbordan la página.
test("ES-01 a 375 px el desglose y el panel de clasificación caben sin desbordar la página", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await iniciarSesion(page, "finanzas");
  await abrirDetalleDeGloria(page);

  await expect(page.getByRole("region", { name: "Permisos y suspensiones" })).toBeVisible();
  const medidas = await page.evaluate(() => ({ documento: document.documentElement.scrollWidth, ventana: window.innerWidth }));
  expect(medidas.documento).toBeLessThanOrEqual(medidas.ventana);
  const conceptos = page.getByRole("region", { name: "Conceptos de la persona" });
  expect(await conceptos.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await conceptos.evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(375);
  expect(errores).toEqual([]);
});
