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
  await celda.click();
  const dialogoDeCelda = page.getByRole("dialog", { name: "Turno de Ana Borrador" });
  await dialogoDeCelda.getByLabel("Quitar asignación").check();
  await dialogoDeCelda.getByRole("button", { name: "Usar" }).click();
  await expect(page.getByText("Sin guardar", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Guardar borrador" }).first().click();
  await expect(page.getByText("Borrador guardado", { exact: true })).toBeVisible();

  await celda.click();
  await dialogoDeCelda.getByLabel("Horario personalizado…").check();
  await dialogoDeCelda.getByRole("button", { name: "Usar" }).click();

  const dialogoPersonalizado = page.getByRole("dialog", { name: "Horario personalizado" });
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
