import { expect, test, type Page } from "@playwright/test";
import { crearFixtureConflictoPolitica } from "./fixture-conflicto-politica";

async function iniciarSesion(page: Page) {
  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("admin");
  await page.getByLabel("Contraseña").fill("admin");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/turnos$/);
}

async function iniciarSesionComo(page: Page, usuario: string) {
  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill(usuario);
  await page.getByLabel("Contraseña").fill(usuario);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(turnos|asistencias|configuracion|pagos)$/);
}

test("G21 cambia filtros semanales y mensuales al elegirlos, sin botón de actualización", async ({ page }) => {
  test.setTimeout(60_000);
  await iniciarSesion(page);
  await page.goto("/asistencias?vista=semanal&grupo=Tiendas&fecha=2026-10-05");

  await page.getByLabel("Grupo operativo").selectOption("Taller");
  await expect(page).toHaveURL(/grupo=Taller/);
  await expect(page.getByRole("heading", { name: "Taller", level: 2 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualizar vista" })).toHaveCount(0);

  await page.getByLabel("Fecha de referencia").fill("2026-10-19");
  await expect(page).toHaveURL(/fecha=2026-10-19/);
  await expect(page.getByText("19 oct", { exact: false })).toBeVisible();

  await page.getByRole("link", { name: "Vista mensual" }).click();
  await expect(page).toHaveURL(/vista=mensual/);
  const grupo = page.getByLabel("Grupo operativo");
  await grupo.selectOption("Tiendas");
  await expect(page).toHaveURL(/grupo=Tiendas/);
  await page.getByLabel("Colaborador", { exact: true }).selectOption("99900002");
  await expect(page).toHaveURL(/colaborador=99900002/);
});

test("G21 ofrece el mismo selector semanal accesible en Asistencias y Horarios", async ({ page }) => {
  test.setTimeout(60_000);
  await iniciarSesion(page);

  for (const ruta of ["/asistencias?grupo=Tiendas&fecha=2026-10-05", "/turnos?equipo=Tiendas&semana=2026-10-05"]) {
    await page.goto(ruta);
    const abrir = page.locator(".selector-semanal .boton-fecha-semanal");
    await expect(abrir).toBeVisible();
    await expect(abrir).toBeEnabled();
    await abrir.focus();
    await page.keyboard.press("Enter");
    const selector = page.getByRole("dialog", { name: "Elegir semana" });
    await expect(selector).toBeVisible();
    const dia = selector.getByRole("button", { name: "Elegir la semana del 2026-10-19" });
    await dia.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/(fecha|semana)=2026-10-19/);
    await expect(page.locator(".selector-semanal .boton-fecha-semanal")).toBeFocused();
  }
});

test("S-01 protege saltos reales de varias entradas y conserva la navegación SPA", async ({ page }) => {
  test.setTimeout(90_000);
  await iniciarSesion(page);
  await page.goto("/configuracion");
  const cdp = await page.context().newCDPSession(page);
  const cargarDocumento = async () => (await cdp.send("Page.getFrameTree")).frameTree.frame.loaderId;
  const loaderInicial = await cargarDocumento();
  const historialInicial = await cdp.send("Page.getNavigationHistory");
  const destino = historialInicial.entries[historialInicial.currentIndex];
  const nav = page.getByRole("navigation", { name: "Navegación principal" });

  await nav.getByRole("link", { name: /Planificación de horarios/ }).click();
  await expect(page).toHaveURL(/\/turnos$/);
  await expect.poll(cargarDocumento).toBe(loaderInicial);
  await page.goBack();
  await expect(page).toHaveURL(/\/configuracion$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/turnos$/);
  await expect.poll(cargarDocumento).toBe(loaderInicial);

  await nav.getByRole("link", { name: /Registro de asistencias/ }).click();
  await expect(page).toHaveURL(/\/asistencias/);
  await expect.poll(cargarDocumento).toBe(loaderInicial);
  await page.getByRole("link", { name: "Vista mensual", exact: true }).click();
  await expect(page).toHaveURL(/vista=mensual/);
  await expect.poll(cargarDocumento).toBe(loaderInicial);
  await page.getByLabel("Grupo operativo").selectOption("Tiendas");
  await expect(page).toHaveURL(/grupo=Tiendas/);
  await page.getByLabel("Fecha de referencia").fill("2026-10-05");
  await expect(page).toHaveURL(/fecha=2026-10-05/);
  await page.getByLabel("Colaborador", { exact: true }).selectOption("99900002");
  await expect(page).toHaveURL(/colaborador=99900002/);
  await expect.poll(cargarDocumento).toBe(loaderInicial);
  await page.getByRole("button", { name: /Asistencia del 2026-10-06:/ }).click();
  const editor = page.getByRole("dialog", { name: "Ajustar asistencia", exact: true });
  const motivo = editor.getByLabel("Motivo del ajuste");
  await motivo.fill("Edición sintética para salto múltiple");
  const origen = page.url();
  expect(await cargarDocumento()).toBe(loaderInicial);
  const historialAntes = await cdp.send("Page.getNavigationHistory");

  await cdp.send("Page.navigateToHistoryEntry", { entryId: destino.id });
  const aviso = page.getByRole("dialog", { name: "Cambios sin guardar", exact: true });
  await expect(aviso).toBeVisible();
  await aviso.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(motivo).toHaveValue("Edición sintética para salto múltiple");
  await expect(page).toHaveURL(origen);
  expect(await cargarDocumento()).toBe(loaderInicial);
  const historialTrasCancelar = await cdp.send("Page.getNavigationHistory");
  expect(historialTrasCancelar.entries.map(({ url }) => url)).toEqual(historialAntes.entries.map(({ url }) => url));
  expect(historialTrasCancelar.currentIndex).toBe(historialAntes.currentIndex);

  await cdp.send("Page.navigateToHistoryEntry", { entryId: destino.id });
  await expect(aviso).toBeVisible();
  await aviso.getByRole("button", { name: "Descartar cambios", exact: true }).click();
  await expect(page).toHaveURL(/\/configuracion$/);
  await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();
  await expect(editor).toHaveCount(0);
});

test("G22 Escape advierte antes de abandonar el editor y cancelar conserva la edición", async ({ page }) => {
  test.setTimeout(60_000);
  await iniciarSesion(page);
  await page.goto("/asistencias?vista=mensual&grupo=Tiendas&colaborador=99900002&fecha=2026-10-05");
  const celda = page.getByRole("button", { name: /Asistencia del 2026-10-06:/ });
  await celda.click();
  const dialogo = page.getByRole("dialog", { name: "Ajustar asistencia" });
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel("Motivo del ajuste").fill("Edición sin guardar de ensayo");

  await page.keyboard.press("Escape");
  const confirmacion = page.getByRole("dialog", { name: "Cambios sin guardar" });
  await expect(confirmacion).toBeVisible();
  await confirmacion.getByRole("button", { name: "Cancelar" }).click();
  await expect(confirmacion).toBeHidden();
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByLabel("Motivo del ajuste")).toHaveValue("Edición sin guardar de ensayo");

  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Cambios sin guardar" }).getByRole("button", { name: "Descartar cambios" }).click();
  await expect(dialogo).toBeHidden();
  await expect(celda).toBeFocused();
});

test("G22 cambia filtros de asistencia sin confirmación cuando no hay edición", async ({ page }) => {
  await iniciarSesion(page);
  await page.goto("/asistencias?vista=mensual&grupo=Tiendas&colaborador=99900002&fecha=2026-10-05");
  await page.getByLabel("Fecha de referencia").fill("2026-10-19");
  await expect(page).toHaveURL(/fecha=2026-10-19/);
  await expect(page.getByRole("dialog", { name: "Cambios sin guardar" })).toHaveCount(0);
});

test("S-01 Escape y recarga advierten antes de perder una edición y permiten cancelarla", async ({ page }) => {
  await iniciarSesion(page);
  await page.goto("/asistencias?vista=mensual&grupo=Tiendas&colaborador=99900002&fecha=2026-10-05");
  const celda = page.getByRole("button", { name: /Asistencia del 2026-10-06:/ });
  await celda.click();
  const editor = page.getByRole("dialog", { name: "Ajustar asistencia" });
  const motivo = editor.getByLabel("Motivo del ajuste");
  await motivo.fill("Motivo que debe conservarse al cancelar la advertencia");

  await page.keyboard.press("Escape");
  const advertencia = page.getByRole("dialog", { name: "Cambios sin guardar" });
  await expect(advertencia).toBeVisible();
  await advertencia.getByRole("button", { name: "Cancelar" }).click();
  await expect(editor).toBeVisible();
  await expect(motivo).toHaveValue("Motivo que debe conservarse al cancelar la advertencia");

  let seConfirmoBeforeUnload = false;
  page.once("dialog", async (dialog) => {
    seConfirmoBeforeUnload = dialog.type() === "beforeunload";
    await dialog.dismiss();
  });
  try {
    await page.reload({ timeout: 2_000 });
  } catch (error) {
    if (!(error instanceof Error) || !/Timeout 2000ms exceeded[\s\S]*waiting for navigation until "load"/.test(error.message)) {
      throw error;
    }
  }
  expect(seConfirmoBeforeUnload).toBe(true);
  await expect(editor).toBeVisible();
  await expect(motivo).toHaveValue("Motivo que debe conservarse al cancelar la advertencia");

  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Cambios sin guardar" }).getByRole("button", { name: "Descartar cambios" }).click();
  await expect(editor).toBeHidden();
  await expect(celda).toBeFocused();
});

test("S-01 Atrás SPA advierte, cancelar conserva la edición y descartar permite Atrás y Adelante", async ({ page }) => {
  test.setTimeout(60_000);
  await iniciarSesion(page);
  await page.goto("/asistencias?vista=semanal&grupo=Tiendas&colaborador=99900002&fecha=2026-10-05");

  // El enlace visible crea una entrada SPA mensual donde existen las celdas editables.
  await page.getByRole("link", { name: "Vista mensual" }).click();
  await expect(page).toHaveURL(/vista=mensual/);
  const celda = page.getByRole("button", { name: /Asistencia del 2026-10-06:/ });
  await celda.click();
  const editor = page.getByRole("dialog", { name: "Ajustar asistencia" });
  await expect(editor).toBeVisible();
  const motivo = editor.getByLabel("Motivo del ajuste");
  await motivo.fill("Edición conservada tras cancelar Atrás SPA");

  let seConfirmoBeforeUnload = false;
  page.once("dialog", async (dialog) => {
    seConfirmoBeforeUnload = dialog.type() === "beforeunload";
    await dialog.dismiss();
  });
  try {
    await page.goBack({ timeout: 5_000 });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "TimeoutError") throw error;
  }
  const advertencia = page.getByRole("dialog", { name: "Cambios sin guardar" });
  await expect(advertencia).toBeVisible({ timeout: 5_000 });
  expect(seConfirmoBeforeUnload).toBe(false);
  await expect(page).toHaveURL(/vista=mensual/);
  await advertencia.getByRole("button", { name: "Cancelar" }).click();
  await expect(advertencia).toBeHidden();
  await expect(editor).toBeVisible();
  await expect(motivo).toHaveValue("Edición conservada tras cancelar Atrás SPA");
  await expect(page).toHaveURL(/vista=mensual/);

  try {
    await page.goBack({ timeout: 5_000 });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "TimeoutError") throw error;
  }
  await expect(page.getByRole("dialog", { name: "Cambios sin guardar" })).toBeVisible({ timeout: 5_000 });
  await page.getByRole("dialog", { name: "Cambios sin guardar" }).getByRole("button", { name: "Descartar cambios" }).click();
  await expect(editor).toBeHidden();
  await expect(page).toHaveURL(/vista=semanal/);

  // La entrada hacia delante preexistía; se debe conservar y poder recorrer.
  await page.goForward({ timeout: 5_000 });
  await expect(page).toHaveURL(/vista=mensual/);
  await expect(page.getByRole("dialog", { name: "Cambios sin guardar" })).toHaveCount(0);
});

test("S-01 Adelante SPA con edición conserva el historial de fechas mensuales", async ({ page }) => {
  test.setTimeout(60_000);
  await iniciarSesion(page);
  await page.goto("/asistencias?vista=mensual&grupo=Tiendas&colaborador=99900002&fecha=2026-10-05");

  await page.getByLabel("Fecha de referencia").fill("2026-10-19");
  await expect(page).toHaveURL(/fecha=2026-10-19/);
  await page.goBack({ timeout: 5_000 });
  await expect(page).toHaveURL(/fecha=2026-10-05/);

  const celda = page.getByRole("button", { name: /Asistencia del 2026-10-06:/ });
  await celda.click();
  const editor = page.getByRole("dialog", { name: "Ajustar asistencia" });
  await expect(editor).toBeVisible();
  const motivo = editor.getByLabel("Motivo del ajuste");
  await motivo.fill("Edición mensual antes de Adelante SPA");

  try {
    await page.goForward({ timeout: 5_000 });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "TimeoutError") throw error;
  }
  const advertencia = page.getByRole("dialog", { name: "Cambios sin guardar" });
  await expect(advertencia).toBeVisible({ timeout: 5_000 });
  await expect(page).toHaveURL(/fecha=2026-10-05/);
  await advertencia.getByRole("button", { name: "Cancelar" }).click();
  await expect(editor).toBeVisible();
  await expect(motivo).toHaveValue("Edición mensual antes de Adelante SPA");
  await expect(page).toHaveURL(/fecha=2026-10-05/);

  try {
    await page.goForward({ timeout: 5_000 });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "TimeoutError") throw error;
  }
  await expect(page.getByRole("dialog", { name: "Cambios sin guardar" })).toBeVisible({ timeout: 5_000 });
  await page.getByRole("dialog", { name: "Cambios sin guardar" }).getByRole("button", { name: "Descartar cambios" }).click();
  await expect(editor).toBeHidden();
  await expect(page).toHaveURL(/fecha=2026-10-19/);

  await page.goBack({ timeout: 5_000 });
  await expect(page).toHaveURL(/fecha=2026-10-05/);
  await expect(page.getByRole("dialog", { name: "Cambios sin guardar" })).toHaveCount(0);
  await page.goForward({ timeout: 5_000 });
  await expect(page).toHaveURL(/fecha=2026-10-19/);
  await expect(page.getByRole("dialog", { name: "Cambios sin guardar" })).toHaveCount(0);
});

test("S-01 Atrás y Adelante SPA no atrapan navegación sin una edición pendiente", async ({ page }) => {
  test.setTimeout(60_000);
  await iniciarSesion(page);
  await page.goto("/asistencias?vista=mensual&grupo=Tiendas&colaborador=99900002&fecha=2026-10-05");
  await page.getByRole("link", { name: "Vista semanal" }).click();
  await expect(page).toHaveURL(/vista=semanal/);

  await page.goBack({ timeout: 5_000 });
  await expect(page).toHaveURL(/vista=mensual/);
  await expect(page.getByRole("dialog", { name: "Cambios sin guardar" })).toHaveCount(0);
  await page.goForward({ timeout: 5_000 });
  await expect(page).toHaveURL(/vista=semanal/);
  await expect(page.getByRole("dialog", { name: "Cambios sin guardar" })).toHaveCount(0);
});

test("G28 el gerente de grupo sin gestión de asistencia registra incidencias sin ver datos salariales", async ({ page }) => {
  test.setTimeout(60_000);
  await iniciarSesion(page);
  await page.goto("/personal");
  await page.getByText("+ Nuevo colaborador").click();
  const dni = String(99000000 + Date.now() % 999999).slice(-8);
  const formulario = page.locator("form").filter({ has: page.getByLabel("DNI", { exact: true }) });
  await formulario.getByLabel("DNI").fill(dni);
  await formulario.getByLabel("Nombre", { exact: true }).fill("Persona G28 sintética");
  await formulario.locator('select[name="grupo"]').selectOption("Administración");
  await formulario.getByRole("button", { name: "Crear colaborador" }).click();
  await expect(page.getByRole("row", { name: new RegExp(dni) })).toBeVisible();

  await page.context().clearCookies();
  await iniciarSesionComo(page, "gerente-administracion");
  const respuesta = await page.goto("/asistencias");
  expect(respuesta?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Registrar incidencia de tienda" })).toBeVisible();
  await expect(page.getByLabel("Persona")).toContainText("Persona G28 sintética");
  await expect(page.getByText("Sin permiso", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Sueldo|AFP|Banco de pago/)).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("G28 el recorrido desde el menú persiste incidencias de grupos propios y excluye personas ajenas", async ({ page }) => {
  test.setTimeout(120_000);
  await iniciarSesion(page);
  await page.goto("/configuracion");
  const sufijo = String(Date.now()).slice(-6);
  const grupoMixto = `No asistencia G28 ${sufijo}`;
  const grupoAjeno = `Ajeno G28 ${sufijo}`;

  async function crearGrupo(nombre: string) {
    await page.goto("/configuracion");
    await page.getByText("+ Nuevo grupo", { exact: true }).click();
    const formularioGrupo = page.locator("form").filter({ has: page.getByLabel("Nombre del grupo", { exact: true }) });
    await formularioGrupo.getByLabel("Nombre del grupo").fill(nombre);
    await formularioGrupo.getByLabel("Gestiona asistencia y horarios").uncheck();
    await formularioGrupo.getByRole("button", { name: "Crear grupo" }).click();
    await expect(page.getByRole("list", { name: "Grupos operativos" })).toContainText(nombre);
  }

  async function crearPersona(dni: string, nombre: string, grupo: string) {
    await page.goto("/personal");
    await page.getByText("+ Nuevo colaborador").click();
    const formularioPersona = page.locator("form").filter({ has: page.getByLabel("DNI", { exact: true }) });
    await formularioPersona.getByLabel("DNI", { exact: true }).fill(dni);
    await formularioPersona.getByLabel("Nombre", { exact: true }).fill(nombre);
    await formularioPersona.locator('select[name="grupo"]').selectOption(grupo);
    await formularioPersona.getByRole("button", { name: "Crear colaborador" }).click();
    await expect(page.getByRole("row", { name: new RegExp(dni) })).toBeVisible();
  }

  const dniSolo = String(98000000 + Date.now() % 999999).slice(-8);
  const dniMixto = String(97000000 + Date.now() % 999999).slice(-8);
  const dniAjeno = String(96000000 + Date.now() % 999999).slice(-8);
  await crearPersona(dniSolo, `Persona G28 solo ${sufijo}`, "Administración");
  await crearGrupo(grupoMixto);
  await crearPersona(dniMixto, `Persona G28 mixta ${sufijo}`, grupoMixto);
  await crearGrupo(grupoAjeno);
  await crearPersona(dniAjeno, `Persona G28 ajena ${sufijo}`, grupoAjeno);

  await page.goto("/cuentas");
  const filaDeGrupoMixto = page.getByRole("row", { name: new RegExp(grupoMixto) });
  await filaDeGrupoMixto.getByRole("combobox").selectOption({ label: "gerente-tiendas" });
  await filaDeGrupoMixto.getByRole("button", { name: "Asignar" }).click();
  await expect(filaDeGrupoMixto).toContainText("gerente-tiendas");

  await page.context().clearCookies();
  await iniciarSesionComo(page, "gerente-administracion");
  const enlaceSolo = page.getByRole("link", { name: /Registro de asistencias/ });
  await expect(enlaceSolo).toBeVisible();
  await enlaceSolo.click();
  await expect(page.getByRole("heading", { name: "Registrar incidencia de tienda" })).toBeVisible();
  await expect(page.locator('select[name="dni"]')).toContainText(`Persona G28 solo ${sufijo}`);
  await expect(page.getByText(/Sueldo|AFP|Banco de pago/)).toHaveCount(0);

  async function registrarIncidencia(dni: string, motivo: string) {
    // Con la matriz o el calendario a la vista, el formulario queda plegado detrás de «+ Registrar incidencia de tienda».
    const plegable = page.getByText("+ Registrar incidencia de tienda", { exact: true });
    if (await plegable.isVisible() && !(await page.locator('select[name="dni"]').isVisible())) await plegable.click();
    await page.locator('select[name="dni"]').selectOption(dni);
    await page.getByLabel("Fecha del hecho").fill("2026-10-20");
    await page.getByLabel("Monto (S/)").fill("80,50");
    await page.getByLabel("Motivo").fill(motivo);
    await page.getByRole("button", { name: "Registrar incidencia de tienda" }).click();
    await expect(page.getByRole("status").filter({ hasText: "La incidencia quedó registrada para revisión." })).toBeVisible();
  }

  await registrarIncidencia(dniSolo, `Motivo solo ${sufijo}`);

  await page.context().clearCookies();
  await iniciarSesionComo(page, "gerente-tiendas");
  await page.getByRole("link", { name: /Registro de asistencias/ }).click();
  const personasDisponibles = page.locator('select[name="dni"]');
  await expect(personasDisponibles).toContainText(`Persona G28 mixta ${sufijo}`);
  await expect(personasDisponibles).not.toContainText(`Persona G28 ajena ${sufijo}`);
  await expect(page.getByText(/Sueldo|AFP|Banco de pago/)).toHaveCount(0);
  await registrarIncidencia(dniMixto, `Motivo mixto ${sufijo}`);

  await page.context().clearCookies();
  await iniciarSesionComo(page, "finanzas");
  await page.goto("/pagos/fuentes-externas?mes=2026-10");
  const filaDeIncidencias = page.getByRole("row", { name: /Incidencias de tienda/ });
  await expect(filaDeIncidencias).toContainText("2");
  await filaDeIncidencias.getByRole("link", { name: /Ver filas de Incidencias de tienda/ }).click();
  await expect(page).toHaveURL(/\/pagos\/fuentes-externas\/incidencias_de_tienda\?mes=2026-10/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /Incidencias de tienda · mes de pago 10\/2026/ })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(dniSolo) })).toContainText(`Motivo solo ${sufijo}`);
  await expect(page.getByRole("row", { name: new RegExp(dniMixto) })).toContainText(`Motivo mixto ${sufijo}`);
});

test("G29 el selector semanal y la matriz comparten lunes al cruzar de mes", async ({ page }) => {
  await iniciarSesion(page);
  await page.goto("/asistencias?grupo=Tiendas&fecha=2026-10-28");

  const selector = page.locator(".selector-semanal .boton-fecha-semanal");
  await expect(selector).toContainText(/26\s+oct.*1\s+nov/s);
  const fechasDeLaMatriz = page.locator(".tabla-asistencias thead time");
  await expect(fechasDeLaMatriz).toHaveCount(7);
  await expect(fechasDeLaMatriz.nth(0)).toHaveAttribute("datetime", "2026-10-26");
  await expect(fechasDeLaMatriz.nth(6)).toHaveAttribute("datetime", "2026-11-01");
});

test("G30 cancelar el editor permite cambiar de vista sin confirmación obsoleta", async ({ page }) => {
  await iniciarSesion(page);
  await page.goto("/asistencias?vista=mensual&grupo=Tiendas&colaborador=99900002&fecha=2026-10-05");
  await page.getByRole("button", { name: /Asistencia del 2026-10-06:/ }).click();
  const editor = page.getByRole("dialog", { name: "Ajustar asistencia" });
  await expect(editor).toBeVisible();
  const motivo = editor.getByLabel("Motivo del ajuste");
  await motivo.click();
  await page.keyboard.type("Edición descartada al cancelar");
  await editor.getByRole("button", { name: "Cancelar" }).click();
  await expect(editor).toBeHidden();

  await page.getByRole("link", { name: "Vista semanal" }).click();
  await expect(page.getByRole("dialog", { name: "Cambios sin guardar" })).toHaveCount(0);
  await expect(page).toHaveURL(/vista=semanal/);
});

test("G30 Escape cierra el editor sin cambios pendientes antes de cambiar de vista", async ({ page }) => {
  await iniciarSesion(page);
  await page.goto("/asistencias?vista=mensual&grupo=Tiendas&colaborador=99900002&fecha=2026-10-05");
  const celda = page.getByRole("button", { name: /Asistencia del 2026-10-06:/ });
  await celda.click();
  const editor = page.getByRole("dialog", { name: "Ajustar asistencia" });
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect(celda).toBeFocused();

  await page.getByRole("link", { name: "Vista semanal" }).click();
  await expect(page.getByRole("dialog", { name: "Cambios sin guardar" })).toHaveCount(0);
  await expect(page).toHaveURL(/vista=semanal/);
});

test("G30 cancelar y reabrir la misma fecha limpia el motivo descartado", async ({ page }) => {
  await iniciarSesion(page);
  await page.goto("/asistencias?vista=mensual&grupo=Tiendas&colaborador=99900002&fecha=2026-10-05");
  const celda = page.getByRole("button", { name: /Asistencia del 2026-10-06:/ });
  await celda.click();
  const editor = page.getByRole("dialog", { name: "Ajustar asistencia" });
  const motivo = editor.getByLabel("Motivo del ajuste");
  await motivo.click();
  await page.keyboard.type("Texto que se descarta al cancelar");
  await editor.getByRole("button", { name: "Cancelar" }).click();
  await expect(editor).toBeHidden();
  await expect(celda).toBeFocused();

  await celda.click();
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Motivo del ajuste")).toHaveValue("");
});

test("G31 el conflicto muestra las opciones vigentes y futuras de las sedes", async ({ page }) => {
  const fixture = await crearFixtureConflictoPolitica();
  try {
    await iniciarSesion(page);
    await page.goto(`/configuracion?grupo=${encodeURIComponent(fixture.grupo)}`);
    const conflicto = page.locator("form.formulario-politica").filter({ hasText: `${fixture.grupo} tiene políticas históricas en conflicto` });
    await expect(conflicto).toBeVisible();
    await expect(conflicto).toContainText(`${fixture.sedes.actual} · vigente desde 2026-09-01 · sede activa · 10 min · 3 tardanzas · 1 h`);
    await expect(conflicto).toContainText(`${fixture.sedes.futura} · futura desde 2099-11-01 · sede activa · 17 min · 2 tardanzas · 1 h`);
    await expect(conflicto.locator('input[name="politicaSeleccionada"]:checked')).toHaveCount(0);
  } finally {
    await fixture.limpiar();
  }
});

test("G31 enviar el conflicto sin política elegida muestra validación en cliente", async ({ page }) => {
  const fixture = await crearFixtureConflictoPolitica();
  try {
    await iniciarSesion(page);
    await page.goto(`/configuracion?grupo=${encodeURIComponent(fixture.grupo)}`);
    const conflicto = page.locator("form.formulario-politica").filter({ hasText: `${fixture.grupo} tiene políticas históricas en conflicto` });
    await expect(conflicto).toBeVisible();
    const radios = conflicto.locator('input[name="politicaSeleccionada"]');
    await expect(radios.first()).toBeVisible();
    await expect(conflicto.locator('input[name="politicaSeleccionada"]:checked')).toHaveCount(0);
    let postsDePolitica = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/configuracion")) postsDePolitica += 1;
    });
    await conflicto.getByRole("button", { name: "Usar política seleccionada" }).click();
    const validity = await radios.first().evaluate((radio: HTMLInputElement) => ({ valid: radio.validity.valid, message: radio.validationMessage }));
    expect(validity.valid).toBe(false);
    expect(validity.message).not.toBe("");
    await expect(page).toHaveURL(/\/configuracion/);
    expect(postsDePolitica).toBe(0);
  } finally {
    await fixture.limpiar();
  }
});

test("G31 el conflicto incluye las futuras y la sede inactiva que originan opciones", async ({ page }) => {
  const fixture = await crearFixtureConflictoPolitica();
  try {
    await iniciarSesion(page);
    await page.goto(`/configuracion?grupo=${encodeURIComponent(fixture.grupo)}`);
    const conflicto = page.locator("form.formulario-politica").filter({ hasText: `${fixture.grupo} tiene políticas históricas en conflicto` });
    await expect(conflicto).toBeVisible();
    await expect(conflicto).toContainText(`${fixture.sedes.actual} · vigente desde 2026-09-01 · sede activa · 10 min · 3 tardanzas · 1 h`);
    await expect(conflicto).toContainText(`${fixture.sedes.futura} · futura desde 2099-11-01 · sede activa · 17 min · 2 tardanzas · 1 h`);
    await expect(conflicto).toContainText(`${fixture.sedes.inactiva} · vigente desde 2026-09-01 · sede inactiva · 20 min · 2 tardanzas · 1 h`);
    await expect(conflicto).toContainText("Las políticas futuras se aplicarán al elegirlas desde ahora y recalcularán las asistencias de los períodos abiertos.");
    await expect(conflicto.locator('input[name="politicaSeleccionada"]:checked')).toHaveCount(0);
  } finally {
    await fixture.limpiar();
  }
});

test("G31 al elegir una política futura se aplica como política única desde ahora", async ({ page }) => {
  const fixture = await crearFixtureConflictoPolitica();
  try {
    await iniciarSesion(page);
    await page.goto(`/configuracion?grupo=${encodeURIComponent(fixture.grupo)}`);
    const conflicto = page.locator("form.formulario-politica").filter({ hasText: `${fixture.grupo} tiene políticas históricas en conflicto` });
    await expect(conflicto).toBeVisible();
    await conflicto.locator(`input[name="politicaSeleccionada"][value="${fixture.politicas.futura}"]`).check();
    await conflicto.getByRole("button", { name: "Usar política seleccionada" }).click();

    const politicaDeGrupo = page.locator("form.formulario-politica").filter({ hasText: fixture.grupo });
    await expect(politicaDeGrupo.locator('input[name="toleranciaEnMinutos"]')).toHaveValue("17");
    await expect(politicaDeGrupo.locator('input[name="tardanzasAcumuladas"]')).toHaveValue("2");
    await expect(politicaDeGrupo.locator('input[name="horasPenalizadas"]')).toHaveValue("1");
  } finally {
    await fixture.limpiar();
  }
});


