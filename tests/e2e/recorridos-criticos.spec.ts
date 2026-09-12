import { expect, test, type Page } from "@playwright/test";

function observarErroresDelNavegador(page: Page): string[] {
  const errores: string[] = [];

  page.on("console", (mensaje) => {
    if (mensaje.type() === "error") errores.push(mensaje.text());
  });
  page.on("pageerror", (error) => errores.push(error.message));

  return errores;
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
