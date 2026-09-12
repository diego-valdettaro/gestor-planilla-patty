import { expect, test, type Page } from "@playwright/test";

function observarErroresDelNavegador(page: Page): string[] {
  const errores: string[] = [];

  page.on("console", (mensaje) => {
    if (mensaje.type() === "error") errores.push(mensaje.text());
  });
  page.on("pageerror", (error) => errores.push(error.message));

  return errores;
}

function fechaDeLaSemanaDeDemo(indiceDelDia: number): string {
  const hoy = new Date();
  const primero = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  const diaDeLaSemana = primero.getUTCDay() === 0 ? 7 : primero.getUTCDay();
  primero.setUTCDate(1 + ((8 - diaDeLaSemana) % 7) + indiceDelDia);
  return primero.toISOString().slice(0, 10);
}

test("una contraseña incorrecta muestra un error recuperable", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);

  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("admin");
  await page.getByLabel("Contraseña").fill("incorrecta");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Las credenciales no son válidas." }))
    .toHaveText("Las credenciales no son válidas.");
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
  expect(errores).toEqual([]);
});

test("Administración abre los recorridos críticos sin errores de navegador", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);

  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("admin");
  await page.getByLabel("Contraseña").fill("admin");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/turnos$/);

  const recorridos = [
    { ruta: "/configuracion", titulo: "Configuración" },
    { ruta: "/turnos", titulo: "Planificación de horarios" },
    { ruta: "/asistencias", titulo: "Asistencias" },
    { ruta: "/periodos", titulo: "Liquidaciones" },
  ];

  for (const recorrido of recorridos) {
    const respuesta = await page.goto(recorrido.ruta);
    expect(respuesta?.ok(), `${recorrido.ruta} debe responder sin error`).toBe(true);
    await expect(page.getByRole("heading", { name: recorrido.titulo, level: 1 })).toBeVisible();
    expect(errores, `${recorrido.ruta} no debe registrar errores de navegador`).toEqual([]);
  }
});

test("un horario personalizado conserva sede y horas al reabrirlo", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("operaciones");
  await page.getByLabel("Contraseña").fill("operaciones");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/turnos$/);

  const semana = fechaDeLaSemanaDeDemo(0);
  const jueves = fechaDeLaSemanaDeDemo(3);
  await page.goto(`/turnos?semana=${semana}&equipo=Tiendas`);
  const celda = page.getByRole("button", { name: new RegExp(`Horario de Ana Borrador para ${jueves}`) });
  await expect(celda).toContainText("Tienda Benavides");
  await expect(celda).toContainText("08:00–16:00");
  await celda.click();
  const dialogoDeCelda = page.getByRole("dialog", { name: "Turno de Ana Borrador" });
  await dialogoDeCelda.getByLabel("Horario personalizado…").check();
  await dialogoDeCelda.getByRole("button", { name: "Usar" }).click();

  const dialogoPersonalizado = page.getByRole("dialog", { name: "Horario personalizado" });
  await expect(dialogoPersonalizado.getByLabel("Sede")).toHaveValue("Tienda Benavides");
  await expect(dialogoPersonalizado.getByLabel("Entrada")).toHaveValue("08:00");
  await expect(dialogoPersonalizado.getByLabel("Salida")).toHaveValue("16:00");
  await dialogoPersonalizado.getByLabel("Sede").selectOption("Tienda San Isidro");
  await dialogoPersonalizado.getByLabel("Entrada").fill("10:00");
  await dialogoPersonalizado.getByLabel("Salida").fill("19:00");
  await dialogoPersonalizado.getByRole("button", { name: "Usar horario" }).click();
  await expect(page.getByText("Sin guardar", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Guardar borrador" }).first().click();
  await expect(page.getByText("Borrador guardado", { exact: true })).toBeVisible();
  await expect(celda).toContainText("Tienda San Isidro");
  await expect(celda).toContainText("10:00–19:00");

  await celda.click();
  await expect(dialogoDeCelda.getByLabel("Horario personalizado…")).toBeChecked();
  await dialogoDeCelda.getByRole("button", { name: "Usar" }).click();

  await expect(dialogoPersonalizado.getByLabel("Sede")).toHaveValue("Tienda San Isidro");
  await expect(dialogoPersonalizado.getByLabel("Entrada")).toHaveValue("10:00");
  await expect(dialogoPersonalizado.getByLabel("Salida")).toHaveValue("19:00");
});

test("completar semana reemplaza los siete días con el modelo por defecto y los motivos elegidos", async ({ page }) => {
  test.setTimeout(60_000);
  const errores = observarErroresDelNavegador(page);

  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("operaciones");
  await page.getByLabel("Contraseña").fill("operaciones");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/turnos$/);

  const semana = fechaDeLaSemanaDeDemo(0);
  await page.goto(`/turnos?semana=${semana}&equipo=Tiendas`);

  const filaLiquidada = page.locator("tr", { hasText: "Darío Liquidado" });
  await expect(filaLiquidada.getByRole("button", { name: "Completar semana" })).toHaveCount(0);

  const filaAna = page.locator("tr", { hasText: "Ana Borrador" });
  const celdas = filaAna.locator("td.celda-plan-semanal");
  const botonCompletar = filaAna.getByRole("button", { name: "Completar semana" });
  const dialogo = page.getByRole("dialog", { name: "Completar semana de Ana Borrador" });

  await botonCompletar.click();
  await dialogo.getByLabel("Sede por defecto").selectOption("Tienda San Isidro");
  await dialogo.getByLabel("Modelo por defecto").selectOption({ label: "Apertura · 08:00 a 16:00" });
  const selectsDeDia = dialogo.locator(".dias-completar-semana select");
  await selectsDeDia.nth(1).selectOption("feriado");
  await selectsDeDia.nth(3).selectOption("vacaciones");
  await dialogo.getByRole("button", { name: "Completar semana" }).click();
  await expect(dialogo).toBeHidden();

  await expect(celdas.nth(0)).toContainText("Tienda San Isidro");
  await expect(celdas.nth(0)).toContainText("08:00–16:00");
  await expect(celdas.nth(1)).toContainText("Feriado");
  await expect(celdas.nth(3)).toContainText("Vacaciones");
  await expect(celdas.nth(4)).toContainText("Tienda San Isidro");
  await expect(page.getByText("Sin guardar", { exact: true })).toBeVisible();

  const textosAntesDeCancelar = await celdas.allTextContents();
  await botonCompletar.click();
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialogo).toBeHidden();
  await expect(celdas.first()).toBeVisible();
  expect(await celdas.allTextContents()).toEqual(textosAntesDeCancelar);

  const primerCelda = celdas.nth(0);
  await primerCelda.click();
  const dialogoCelda = page.getByRole("dialog", { name: "Turno de Ana Borrador" });
  await dialogoCelda.getByLabel("Permiso").check();
  await dialogoCelda.getByRole("button", { name: "Usar" }).click();
  await expect(dialogoCelda).toBeHidden();
  await expect(primerCelda).toContainText("Permiso");
  await expect(celdas.nth(1)).toContainText("Feriado");

  expect(errores).toEqual([]);
});

test("completar semana no exige un modelo por defecto cuando todos los días quedan con un motivo", async ({ page }) => {
  test.setTimeout(60_000);
  const errores = observarErroresDelNavegador(page);

  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("operaciones");
  await page.getByLabel("Contraseña").fill("operaciones");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/turnos$/);

  const semana = fechaDeLaSemanaDeDemo(0);
  await page.goto(`/turnos?semana=${semana}&equipo=Tiendas`);

  const filaElena = page.locator("tr", { hasText: "Elena Sotelo" });
  const celdas = filaElena.locator("td.celda-plan-semanal");
  const dialogo = page.getByRole("dialog", { name: "Completar semana de Elena Sotelo" });

  await filaElena.getByRole("button", { name: "Completar semana" }).click();
  for (const select of await dialogo.locator(".dias-completar-semana select").all()) await select.selectOption("descanso");
  await dialogo.getByRole("button", { name: "Completar semana" }).click();
  await expect(dialogo).toBeHidden();

  for (let indice = 0; indice < 7; indice += 1) await expect(celdas.nth(indice)).toContainText("Descanso");
  expect(errores).toEqual([]);
});

test("completar semana sobre una fila publicada deja cambios sin publicar en vez de modificar el turno publicado", async ({ page }) => {
  test.setTimeout(60_000);
  const errores = observarErroresDelNavegador(page);

  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("operaciones");
  await page.getByLabel("Contraseña").fill("operaciones");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/turnos$/);

  const semana = fechaDeLaSemanaDeDemo(0);
  await page.goto(`/turnos?semana=${semana}&equipo=Tiendas`);

  const filaBeto = page.locator("tr", { hasText: "Beto Publicado" });
  const estadoDeLaFila = filaBeto.locator(".persona small");
  await expect(estadoDeLaFila).toHaveText("Publicado");
  await expect(filaBeto.getByRole("button", { name: "Republicar cambios" })).toHaveCount(0);

  const dialogo = page.getByRole("dialog", { name: "Completar semana de Beto Publicado" });
  await filaBeto.getByRole("button", { name: "Completar semana" }).click();
  await dialogo.locator(".dias-completar-semana select").first().selectOption("permiso");
  await dialogo.getByRole("button", { name: "Completar semana" }).click();
  await expect(dialogo).toBeHidden();

  // El cambio queda pendiente de republicación: no se sobrescribe el turno publicado en silencio.
  await expect(estadoDeLaFila).toHaveText("Cambios sin publicar");
  await expect(filaBeto.getByRole("button", { name: "Republicar cambios" })).toBeVisible();
  expect(errores).toEqual([]);
});
