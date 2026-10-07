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

function fechaDeLaSemanaAnteriorDeDemo(indiceDelDia: number): string {
  const hoy = new Date();
  const primero = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1));
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

test("el Administrador del sistema abre los recorridos críticos sin errores de navegador", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);

  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("admin");
  await page.getByLabel("Contraseña").fill("admin");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/turnos$/);

  const recorridos = [
    { ruta: "/configuracion", titulo: "Configuración" },
    { ruta: "/cuentas", titulo: "Cuentas" },
    { ruta: "/turnos", titulo: "Planificación de horarios" },
    { ruta: "/asistencias", titulo: "Asistencias" },
    { ruta: "/periodos", titulo: "Períodos de planilla" },
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
  await page.getByLabel("Usuario").fill("gerente-tiendas");
  await page.getByLabel("Contraseña").fill("gerente-tiendas");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/turnos$/);

  const semana = fechaDeLaSemanaDeDemo(0);
  const jueves = fechaDeLaSemanaDeDemo(3);
  await page.goto(`/turnos?semana=${semana}&equipo=Tiendas`);
  const celda = page.getByRole("button", { name: new RegExp(`Horario de Ana Borrador para ${jueves}`) });
  await expect(celda).toContainText("Tienda Benavides");
  await expect(celda).toContainText("08:00–16:00");
  await celda.click();
  const dialogoDeCelda = page.getByRole("dialog", { name: "Horario semanal de Ana Borrador" });
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
  await page.getByLabel("Usuario").fill("gerente-tiendas");
  await page.getByLabel("Contraseña").fill("gerente-tiendas");
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
  const dialogoCelda = page.getByRole("dialog", { name: "Horario semanal de Ana Borrador" });
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
  await page.getByLabel("Usuario").fill("gerente-tiendas");
  await page.getByLabel("Contraseña").fill("gerente-tiendas");
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

test("completar semana sobre una fila publicada deja cambios sin publicar en vez de modificar el horario semanal publicado", async ({ page }) => {
  test.setTimeout(60_000);
  const errores = observarErroresDelNavegador(page);

  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("gerente-tiendas");
  await page.getByLabel("Contraseña").fill("gerente-tiendas");
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

  // El cambio queda pendiente de republicación: no se sobrescribe el horario semanal publicado en silencio.
  await expect(estadoDeLaFila).toHaveText("Cambios sin publicar");
  await expect(filaBeto.getByRole("button", { name: "Republicar cambios" })).toBeVisible();
  expect(errores).toEqual([]);
});

test("publicar selección solo publica la fila marcada y respeta una deselección manual", async ({ page }) => {
  test.setTimeout(60_000);
  const errores = observarErroresDelNavegador(page);

  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("gerente-tiendas");
  await page.getByLabel("Contraseña").fill("gerente-tiendas");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/turnos$/);

  const semana = fechaDeLaSemanaDeDemo(0);
  const domingo = fechaDeLaSemanaDeDemo(6);
  await page.goto(`/turnos?semana=${semana}&equipo=Tiendas`);

  const filaAna = page.locator("tr", { hasText: "Ana Borrador" });
  const filaCarla = page.locator("tr", { hasText: "Carla Cambios" });
  const checkboxAna = filaAna.locator('input[type="checkbox"]');
  const botonPublicar = page.getByRole("button", { name: "Publicar planificación" }).first();
  const dialogoCelda = page.getByRole("dialog", { name: "Horario semanal de Ana Borrador" });

  // A Ana le falta el último día: todavía no hay ninguna fila elegible para publicar.
  await expect(checkboxAna).toHaveCount(0);
  await expect(botonPublicar).toBeDisabled();

  await filaAna.getByRole("button", { name: new RegExp(`Horario de Ana Borrador para ${domingo}`) }).click();
  await dialogoCelda.getByLabel("Descanso").check();
  await dialogoCelda.getByRole("button", { name: "Usar" }).click();

  // Al completar los siete días, la fila se autoselecciona.
  await expect(checkboxAna).toBeChecked();
  await expect(botonPublicar).toBeEnabled();

  await checkboxAna.uncheck();
  await expect(botonPublicar).toBeDisabled();

  // Una nueva edición sobre la misma fila no revierte la deselección manual.
  await filaAna.getByRole("button", { name: new RegExp(`Horario de Ana Borrador para ${semana}`) }).click();
  await dialogoCelda.getByLabel("Permiso").check();
  await dialogoCelda.getByRole("button", { name: "Usar" }).click();
  await expect(checkboxAna).not.toBeChecked();
  await expect(botonPublicar).toBeDisabled();

  await checkboxAna.check();
  await expect(botonPublicar).toBeEnabled();
  await botonPublicar.click();
  await page.getByRole("dialog", { name: "¿Publicar la selección?" }).getByRole("button", { name: "Publicar planificación" }).click();

  await expect(filaAna.locator(".persona small")).toHaveText("Publicado");
  await expect(checkboxAna).toHaveCount(0);
  // La publicación selectiva no afecta a otras filas, como los cambios sin publicar de Carla.
  await expect(filaCarla.locator(".persona small")).toHaveText("Cambios sin publicar");

  expect(errores).toEqual([]);
});

test("revisa asistencias semanales por grupo sin agrupar colaboradores por sede fija", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);

  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("admin");
  await page.getByLabel("Contraseña").fill("admin");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/turnos$/);

  const semana = fechaDeLaSemanaDeDemo(0);
  await page.goto(`/asistencias?grupo=Tiendas&semana=${semana}`);

  const matriz = page.locator(".tabla-plan-semanal");
  await expect(matriz).toBeVisible();
  await expect(matriz.getByRole("columnheader")).toHaveCount(8);
  const filaBeto = matriz.getByRole("row", { name: /Beto Publicado/ });
  await expect(filaBeto).toContainText("Tienda Benavides");
  await expect(filaBeto).toContainText("Feriado");
  await expect(filaBeto).toContainText("Pendiente de revisión");
  const filaDario = matriz.getByRole("row", { name: /Darío Liquidado/ });
  await expect(filaDario).toContainText("Tienda San Isidro");

  const semanaAnterior = fechaDeLaSemanaAnteriorDeDemo(0);
  await page.goto(`/asistencias?grupo=Tiendas&semana=${semanaAnterior}`);
  const filaElena = page.locator(".tabla-plan-semanal").getByRole("row", { name: /Elena Sotelo/ });
  await expect(filaElena).toContainText("Liquidado");
  await expect(filaElena.locator(".icono-candado")).toHaveCount(6);
  expect(errores).toEqual([]);
});

test("confirma colaboradores por un rango que corta la semana desde las vistas mensual y semanal", async ({ page }) => {
  test.setTimeout(60_000);
  const errores = observarErroresDelNavegador(page);
  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("admin");
  await page.getByLabel("Contraseña").fill("admin");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/turnos$/);

  const semana = fechaDeLaSemanaDeDemo(0);
  await page.goto(`/asistencias?vista=mensual&grupo=Tiendas&fecha=${semana}&colaborador=99900006`);
  await page.getByRole("button", { name: "Confirmar por rango" }).click();
  let dialogo = page.getByRole("dialog", { name: "Confirmar asistencias por rango" });
  await expect(dialogo.getByText("Eva Confirmable")).toBeVisible();
  await expect(dialogo.locator(".opciones-confirmacion-rango li")).toHaveCount(1);
  await dialogo.getByRole("button", { name: "Cancelar" }).click();

  await page.getByRole("link", { name: "Vista semanal" }).click();
  const botonConfirmarRango = page.getByRole("button", { name: "Confirmar por rango" });
  await expect(botonConfirmarRango).toHaveAttribute("data-rango-inicio", fechaDeLaSemanaDeDemo(0));
  await botonConfirmarRango.click();
  dialogo = page.getByRole("dialog", { name: "Confirmar asistencias por rango" });
  await expect(dialogo.getByLabel("Desde")).toHaveValue(fechaDeLaSemanaDeDemo(0));
  await expect(dialogo.getByLabel("Hasta")).toHaveValue(fechaDeLaSemanaDeDemo(6));
  const martes = fechaDeLaSemanaDeDemo(1);
  const viernes = fechaDeLaSemanaDeDemo(4);
  await dialogo.getByLabel("Desde").fill(martes);
  await dialogo.getByLabel("Hasta").fill(viernes);
  await dialogo.getByRole("button", { name: "Revisar rango" }).click();
  const opcionEva = dialogo.locator("li", { hasText: "Eva Confirmable" });
  const checkboxEva = opcionEva.locator('input[type="checkbox"]');
  await expect(checkboxEva).toBeChecked();
  await checkboxEva.uncheck();
  await expect(dialogo.getByRole("button", { name: "Confirmar selección" })).toBeDisabled();
  await checkboxEva.check();
  await dialogo.getByRole("button", { name: "Confirmar 1 colaborador" }).click();
  await expect(dialogo).toBeHidden();

  const filaEva = page.locator(".tabla-plan-semanal").getByRole("row", { name: /Eva Confirmable/ });
  await expect(filaEva).toContainText("Registrada");
  expect(errores).toEqual([]);
});

async function iniciarSesion(page: Page, usuario: string) {
  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill(usuario);
  await page.getByLabel("Contraseña").fill(usuario);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/iniciar-sesion"), { timeout: 30_000 });
}

test("Finanzas no ve Horarios y consulta Asistencias en solo lectura", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);

  await iniciarSesion(page, "finanzas");
  const menu = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(menu.getByRole("link", { name: /Horarios/ })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: /Configuración/ })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: /Cuentas/ })).toBeVisible();

  await page.goto("/turnos");
  await expect(page.getByRole("heading", { name: "Sin permiso", level: 1 })).toBeVisible();

  await page.goto(`/asistencias?grupo=Tiendas&semana=${fechaDeLaSemanaDeDemo(0)}`);
  await expect(page.getByRole("heading", { name: "Asistencias", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Importar archivo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar por rango" })).toHaveCount(0);
  expect(errores, "Asistencias en solo lectura no debe registrar errores de navegador").toEqual([]);
});

test("cada rol ve en el menú exactamente las rutas que puede abrir", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);
  const casos: Array<[string, string[]]> = [
    ["admin", ["Configuración", "Cuentas", "Horarios", "Asistencia", "Períodos de planilla", "Relaciones laborales"]],
    ["finanzas", ["Cuentas", "Asistencia", "Períodos de planilla", "Relaciones laborales", "Pagos"]],
    ["gerente-tiendas", ["Configuración", "Horarios", "Asistencia", "Períodos de planilla"]],
    ["gerente-administracion", ["Configuración"]],
    ["gerente-sin-grupos", []],
    ["rrhh", ["Relaciones laborales"]],
  ];

  for (const [usuario, enlaces] of casos) {
    await page.context().clearCookies();
    await iniciarSesion(page, usuario);
    const menu = page.getByRole("navigation", { name: "Navegación principal" });
    const etiquetas = (await menu.locator(".enlaces-navegacion a").allInnerTexts()).map((texto) => texto.replace(/\s+/g, " ").replace("(sección actual)", "").replace(/^\S+\s/, "").trim());
    expect(etiquetas.map((etiqueta) => etiqueta.replace(/^[^\p{L}]+/u, "")), `menú de ${usuario}`).toEqual(enlaces);
  }
  expect(errores).toEqual([]);
});

test("el gerente aprueba la asistencia de su grupo y Finanzas ve por qué no puede cerrar el período", async ({ page }) => {
  test.setTimeout(90_000);
  const errores = observarErroresDelNavegador(page);

  await iniciarSesion(page, "gerente-tiendas");
  await page.goto("/periodos");
  await expect(page.getByRole("heading", { name: "Períodos de planilla", level: 1 })).toBeVisible();
  // El gerente solo ve y aprueba sus grupos: sin exportación, cierre ni reapertura, y Administración no gestiona asistencia.
  await expect(page.getByRole("link", { name: "Exportar XLSX completo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cerrar período" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reabrir período" })).toHaveCount(0);
  const tabla = page.getByRole("region", { name: "Aprobación de asistencia por grupo" });
  const filaDe = (grupo: string) => tabla.locator("tbody tr").filter({ hasText: new RegExp(`^${grupo}`) });
  await expect(filaDe("Administración")).toHaveCount(0);
  await expect(filaDe("Tiendas")).toContainText("Pendiente de aprobación");
  await expect(filaDe("Tiendas").getByRole("button", { name: /Aprobar/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Personas que bloquean la aprobación de Tiendas" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ana Borrador \(99900001\): Sin horario publicado/ })).toBeVisible();

  await filaDe("Taller").getByRole("button", { name: /Aprobar asistencia/ }).click();
  await expect(filaDe("Taller")).toContainText("Aprobada por gerente-tiendas");
  await expect(filaDe("Taller").getByRole("button", { name: /Aprobar/ })).toHaveCount(0);

  await page.context().clearCookies();
  await iniciarSesion(page, "finanzas");
  await page.goto("/periodos");
  await expect(page.getByRole("button", { name: /Aprobar asistencia/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cerrar período" })).toBeDisabled();
  await expect(page.getByText("falta la aprobación de asistencia del grupo Tiendas")).toBeVisible();
  await expect(page.getByText("Finanzas no aprueba en su nombre")).toBeVisible();
  expect(errores).toEqual([]);
});

test("un rol sin pantallas explica qué esperar y el gerente del grupo Administración no entra a Horarios", async ({ page }) => {
  await iniciarSesion(page, "gerente-sin-grupos");
  await expect(page.getByText("Todavía no tiene grupos asignados.")).toBeVisible();

  await page.context().clearCookies();
  await iniciarSesion(page, "gerente-administracion");
  await expect(page).toHaveURL(/\/configuracion$/);
  await page.goto("/turnos");
  await expect(page.getByRole("heading", { name: "Sin permiso", level: 1 })).toBeVisible();
  await page.goto("/asistencias");
  await expect(page.getByRole("heading", { name: "Sin permiso", level: 1 })).toBeVisible();
});

test("Recursos Humanos confirma un ingreso y el gerente ve su efecto en Horarios", async ({ page }) => {
  test.setTimeout(90_000);
  const errores = observarErroresDelNavegador(page);
  const semana = fechaDeLaSemanaDeDemo(0);

  await iniciarSesion(page, "gerente-tiendas");
  await page.goto(`/turnos?semana=${semana}&equipo=Tiendas`);
  const filaLuis = page.locator("tr", { hasText: "Luis Pendiente" });
  await expect(filaLuis.getByText("No se puede publicar: no tiene una relación laboral confirmada en esta semana.")).toBeVisible();
  await expect(filaLuis.getByRole("checkbox", { name: "Publicar" })).toHaveCount(0);
  const filaJulia = page.locator("tr", { hasText: "Julia Ingreso" });
  await expect(filaJulia.locator("td.celda-plan-semanal.fuera-de-relacion")).toHaveCount(2);
  await expect(filaJulia.locator("td.celda-plan-semanal.fuera-de-relacion").first()).toContainText("Sin relación laboral");
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: /Relaciones laborales/ })).toHaveCount(0);
  await page.goto("/relaciones-laborales");
  await expect(page.getByRole("heading", { name: "Sin permiso", level: 1 })).toBeVisible();

  await page.context().clearCookies();
  await iniciarSesion(page, "rrhh");
  await expect(page).toHaveURL(/\/relaciones-laborales$/);
  await expect(page.getByRole("heading", { name: "Relaciones laborales", level: 1 })).toBeVisible();
  // Tras confirmar, Luis también aparece en la consulta de vigencia: la fila de la tabla de relaciones es la primera.
  const relacionDeLuis = page.locator("tr", { hasText: "Luis Pendiente" }).first();
  await expect(relacionDeLuis).toContainText("Ingreso por confirmar");
  await relacionDeLuis.getByRole("button", { name: "Confirmar ingreso" }).click();
  const dialogo = page.getByRole("dialog", { name: /Confirmar el ingreso de Luis Pendiente/ });
  await dialogo.getByRole("button", { name: "Confirmar ingreso" }).click();
  await expect(relacionDeLuis).toContainText("Vigente");

  await page.context().clearCookies();
  await iniciarSesion(page, "gerente-tiendas");
  await page.goto(`/turnos?semana=${semana}&equipo=Tiendas`);
  await expect(page.locator("tr", { hasText: "Luis Pendiente" }).getByText("No se puede publicar")).toHaveCount(0);
  expect(errores, "Relaciones laborales y Horarios no deben registrar errores de navegador").toEqual([]);
});

test("Finanzas crea una cuenta de gerente de área y la ve con su rol y sin grupos", async ({ page }) => {
  test.setTimeout(60_000);
  const errores = observarErroresDelNavegador(page);
  const usuario = `gerente-e2e-${Date.now()}`;

  await iniciarSesion(page, "finanzas");
  await page.goto("/cuentas");
  await expect(page.getByRole("heading", { name: "Cuentas", level: 1 })).toBeVisible();
  const rol = page.getByLabel("Rol");
  await expect(rol.locator("option")).toHaveText(["Rol…", "Gerente de área", "Recursos Humanos"]);

  await page.getByLabel("Nombre de usuario").fill(usuario);
  await page.getByLabel("Contraseña inicial").fill("clave-segura-1");
  await rol.selectOption("gerente_de_area");
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await expect(page.getByRole("status").filter({ hasText: "La cuenta quedó creada." })).toBeVisible();
  const fila = page.getByRole("row", { name: new RegExp(usuario) });
  await expect(fila).toContainText("Gerente de área");
  await expect(fila).toContainText("Sin grupos");
  expect(errores).toEqual([]);
});

test("el gerente de área conserva la acción principal de Horarios y ve por qué Guardar borrador está deshabilitado", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);

  await iniciarSesion(page, "gerente-tiendas");
  await page.goto("/turnos");

  const guardar = page.getByRole("button", { name: "Guardar borrador" }).first();
  await expect(guardar).toBeDisabled();
  await expect(guardar).toHaveAccessibleDescription(/no hay cambios sin guardar/);
  await expect(page.getByRole("button", { name: "Publicar planificación" }).first()).toHaveClass(/boton-principal/);
  await expect(page.getByRole("button", { name: "Completar semana" }).first()).toHaveClass(/boton-secundario/);
  expect(errores, "Horarios no debe registrar errores de navegador").toEqual([]);
});

test("el selector semanal y el panel de feedback se operan con teclado y devuelven el foco", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);
  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("gerente-tiendas");
  await page.getByLabel("Contraseña").fill("gerente-tiendas");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/turnos$/);
  await page.goto(`/turnos?semana=${fechaDeLaSemanaDeDemo(0)}&equipo=Tiendas`);

  const disparador = page.locator(".boton-fecha-semanal");
  await disparador.focus();
  await page.keyboard.press("Enter");
  const calendario = page.getByRole("dialog", { name: "Elegir semana" });
  await expect(calendario).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const fecha = page.locator(".fechas-calendario-semanal button").first();
  await fecha.focus();
  await expect(fecha).toBeFocused();
  const contorno = await fecha.evaluate((elemento) => getComputedStyle(elemento).outlineStyle);
  expect(contorno).not.toBe("none");
  await page.keyboard.press("Escape");
  await expect(calendario).toBeHidden();
  await expect(disparador).toBeFocused();

  await disparador.press("Enter");
  await page.getByRole("button", { name: "Cancelar" }).first().click();
  await expect(disparador).toBeFocused();

  const feedback = page.getByRole("button", { name: "Enviar feedback" });
  await feedback.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "Enviar feedback" });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Comentario")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(feedback).toBeFocused();

  await feedback.press("Enter");
  await panel.getByRole("button", { name: "Cancelar" }).click();
  await expect(panel).toBeHidden();
  await expect(feedback).toBeFocused();
  expect(errores).toEqual([]);
});

test("Administración confirma o cancela el ajuste de una asistencia confirmada", async ({ page }) => {
  test.setTimeout(60_000);
  const errores = observarErroresDelNavegador(page);

  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("admin");
  await page.getByLabel("Contraseña").fill("admin");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/turnos$/);

  // Eva queda confirmada con instantánea de horario semanal por el recorrido de confirmación por rango anterior.
  const martes = fechaDeLaSemanaDeDemo(1);
  await page.goto(`/asistencias?vista=mensual&grupo=Tiendas&fecha=${martes}&colaborador=99900006`);
  const celda = page.getByRole("button", { name: new RegExp(`Asistencia del ${martes}`) });
  await celda.click();
  const dialogo = page.getByRole("dialog", { name: "Ajustar asistencia" });
  await dialogo.getByLabel("Hora de salida").fill("15:00");
  await dialogo.getByLabel("Motivo del ajuste").fill("Salida anticipada autorizada");
  await dialogo.getByRole("button", { name: "Revisar ajuste" }).click();

  const confirmacion = page.getByRole("dialog", { name: "¿Confirmar el ajuste de asistencia?" });
  await expect(confirmacion.getByRole("heading", { name: "¿Confirmar el ajuste de asistencia?" })).toBeFocused();
  await expect(confirmacion).toContainText(martes);
  await expect(confirmacion).toContainText("Eva Confirmable");
  await expect(confirmacion).toContainText("15:00");
  await expect(confirmacion).toContainText("ya está confirmada");
  await confirmacion.getByRole("button", { name: "Cancelar" }).click();
  await expect(confirmacion).toBeHidden();
  await expect(celda).toBeFocused();
  await expect(celda).not.toContainText("15:00");

  await celda.click();
  await dialogo.getByLabel("Hora de salida").fill("15:00");
  await dialogo.getByLabel("Motivo del ajuste").fill("Salida anticipada autorizada");
  await dialogo.getByRole("button", { name: "Revisar ajuste" }).click();
  await confirmacion.getByRole("button", { name: "Confirmar ajuste" }).click();
  await expect(confirmacion).toBeHidden();
  await expect(celda).toContainText("15:00");
  expect(errores).toEqual([]);
});

test("Finanzas cancela y luego confirma la reapertura de un período cerrado", async ({ page }) => {
  test.setTimeout(60_000);
  const errores = observarErroresDelNavegador(page);

  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("finanzas");
  await page.getByLabel("Contraseña").fill("finanzas");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/iniciar-sesion/);
  await page.goto("/periodos");
  const cerrado = await page.locator('select[name="periodoId"] option', { hasText: "(cerrado)" }).getAttribute("value");
  await page.goto(`/periodos?periodoId=${cerrado}`);

  const boton = page.getByRole("button", { name: "Reabrir período" });
  await boton.click();
  const dialogo = page.getByRole("dialog", { name: "¿Reabrir este período de planilla?" });
  await expect(dialogo).toContainText("volverá a estar abierto");
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialogo).toBeHidden();
  await expect(boton).toBeFocused();
  await expect(page.getByText("Cerrado", { exact: true })).toBeVisible();

  await boton.click();
  await dialogo.getByLabel("Motivo de reapertura").fill("Corrección de una asistencia");
  await dialogo.getByRole("button", { name: "Reabrir período" }).click();
  await expect(page.getByRole("button", { name: "Reabrir período" })).toHaveCount(0);
  expect(errores).toEqual([]);
});

async function iniciarSesionComoAdministracion(page: Page): Promise<void> {
  await page.goto("/iniciar-sesion");
  await page.getByLabel("Usuario").fill("admin");
  await page.getByLabel("Contraseña").fill("admin");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/turnos$/);
}

async function desbordeHorizontalDeLaPagina(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function elementosQueDesbordan(page: Page): Promise<string> {
  return page.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const medida = () => document.documentElement.scrollWidth - ancho;
    const resultado: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("main *")) {
      const previo = el.style.display;
      el.style.display = "none";
      const nueva = medida();
      el.style.display = previo;
      if (nueva < 1) resultado.push(`${el.tagName.toLowerCase()}.${String(el.className)}`);
      if (resultado.length >= 4) break;
    }
    return resultado.join(" | ");
  });
}

const rutasAutenticadas = ["/configuracion", "/cuentas", "/turnos", "/asistencias", "/asistencias/importar", "/periodos", "/relaciones-laborales"];

for (const [nombre, ancho, alto] of [["375 px", 375, 812], ["escritorio", 1280, 800]] as const) {
  test(`las rutas autenticadas caben en ${nombre} sin errores de consola`, async ({ page }) => {
    const errores = observarErroresDelNavegador(page);
    await page.setViewportSize({ width: ancho, height: alto });

    await page.goto("/iniciar-sesion");
    expect(await desbordeHorizontalDeLaPagina(page)).toBeLessThanOrEqual(0);
    await iniciarSesionComoAdministracion(page);

    for (const ruta of rutasAutenticadas) {
      await page.goto(ruta);
      const desborde = await desbordeHorizontalDeLaPagina(page);
      expect(desborde, `desborde en ${ruta}: ${desborde > 0 ? await elementosQueDesbordan(page) : ""}`).toBeLessThanOrEqual(0);

      const navegacion = await page.getByRole("navigation", { name: "Navegación principal" }).boundingBox();
      const contenido = await page.locator("main").first().boundingBox();
      expect(navegacion && contenido, `medidas en ${ruta}`).toBeTruthy();
      if (ancho <= 900) expect(contenido!.y, `solapamiento en ${ruta}`).toBeGreaterThanOrEqual(navegacion!.y + navegacion!.height - 1);
      else expect(contenido!.x, `solapamiento en ${ruta}`).toBeGreaterThanOrEqual(navegacion!.x + navegacion!.width - 1);
    }
    expect(errores).toEqual([]);
  });
}

test("en ancho estrecho el menú se opera con teclado e identifica la sección por texto", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await iniciarSesionComoAdministracion(page);
  await page.goto("/asistencias");

  const navegacion = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(navegacion.getByText("Asistencia", { exact: true })).toBeVisible();
  const menu = navegacion.getByRole("button", { name: "Menú" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(navegacion.getByRole("link", { name: /Configuración/ })).toBeHidden();

  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(navegacion.getByRole("button", { name: "Cerrar menú" })).toHaveAttribute("aria-expanded", "true");
  await expect(navegacion.getByRole("link", { name: /Asistencia.*sección actual/ })).toHaveAttribute("aria-current", "page");
  await expect(navegacion.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(navegacion.getByRole("button", { name: "Menú" })).toHaveAttribute("aria-expanded", "false");

  await navegacion.getByRole("button", { name: "Menú" }).click();
  await navegacion.getByRole("link", { name: /Horarios/ }).click();
  await expect(page).toHaveURL(/\/turnos$/);
  await expect(navegacion.getByRole("button", { name: "Menú" })).toHaveAttribute("aria-expanded", "false");
  expect(errores).toEqual([]);
});

test("las tablas de /periodos se desplazan dentro de su región a 375 px sin truncar datos ni errores de consola", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await iniciarSesionComoAdministracion(page);
  await page.goto("/periodos");
  await page.locator("details > summary").evaluateAll((resumenes) => resumenes.forEach((resumen) => resumen.parentElement?.setAttribute("open", "")));

  const regiones = page.locator(".panel-tabla");
  const cantidad = await regiones.count();
  expect(cantidad).toBeGreaterThanOrEqual(5);
  await expect(page.getByRole("region", { name: "Totales del período completo" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Horas extra del período completo" })).toBeVisible();
  await expect(page.getByRole("region", { name: /^Detalle diario de / }).first()).toBeVisible();
  expect(await desbordeHorizontalDeLaPagina(page)).toBeLessThanOrEqual(0);

  for (let indice = 0; indice < cantidad; indice++) {
    const region = regiones.nth(indice);
    const nombre = await region.getAttribute("aria-label");
    const medidas = await region.evaluate((el) => {
      const caja = el.getBoundingClientRect();
      const antes = el.scrollLeft;
      el.scrollLeft = el.scrollWidth;
      const celdas = [...el.querySelectorAll<HTMLElement>("th, td")];
      const ultima = el.querySelector("thead th:last-child")!.getBoundingClientRect();
      return {
        izquierda: caja.left,
        derecha: caja.right,
        desplazable: el.scrollWidth > el.clientWidth,
        desplazadoA: el.scrollLeft - antes,
        ultimaColumnaVisible: ultima.right <= caja.right + 1 && ultima.left >= caja.left - 1,
        celdasTruncadas: celdas.filter((celda) => celda.scrollWidth > celda.clientWidth + 1 || getComputedStyle(celda).textOverflow === "ellipsis").length,
        alineacionesNumericas: [...el.querySelectorAll<HTMLElement>(".numerico")].map((celda) => getComputedStyle(celda).textAlign),
        alineacionesDeEtiquetas: [...el.querySelectorAll<HTMLElement>("tbody th[scope=row]")].map((celda) => getComputedStyle(celda).textAlign),
      };
    });

    expect(medidas.izquierda, nombre ?? "").toBeGreaterThanOrEqual(0);
    expect(medidas.derecha, nombre ?? "").toBeLessThanOrEqual(375);
    expect(medidas.desplazable, `${nombre} se desplaza horizontalmente`).toBe(true);
    expect(medidas.desplazadoA, `${nombre} llega a su última columna`).toBeGreaterThan(0);
    expect(medidas.ultimaColumnaVisible, `${nombre} muestra su última columna al final`).toBe(true);
    expect(medidas.celdasTruncadas, `${nombre} sin celdas truncadas`).toBe(0);
    expect(medidas.alineacionesNumericas.length, `${nombre} tiene cifras`).toBeGreaterThan(0);
    expect(medidas.alineacionesNumericas.every((alineacion) => alineacion === "right"), `${nombre} alinea cifras a la derecha`).toBe(true);
    expect(medidas.alineacionesDeEtiquetas.every((alineacion) => alineacion === "left" || alineacion === "start")).toBe(true);
  }

  await regiones.first().focus();
  await expect(regiones.first()).toBeFocused();
  expect(await desbordeHorizontalDeLaPagina(page)).toBeLessThanOrEqual(0);
  expect(errores).toEqual([]);
});

test("Finanzas registra un segundo sueldo con vigencia en Condiciones laborales y el Administrador no entra", async ({ page }) => {
  test.setTimeout(90_000);
  const errores = observarErroresDelNavegador(page);

  await iniciarSesion(page, "finanzas");
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: /Pagos/ }).click();
  await expect(page).toHaveURL(/\/pagos\/condiciones-laborales$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Condiciones laborales", level: 1 })).toBeVisible({ timeout: 30_000 });
  const lista = page.getByRole("region", { name: "Condiciones laborales vigentes hoy" });
  await expect(lista.locator("tbody tr").filter({ hasText: "Beto Publicado" })).toContainText("AFP Integra · comisión mixta");
  await expect(lista.locator("tbody tr").filter({ hasText: "Carla Cambios" })).toContainText("REMYPE pequeña empresa");
  await expect(lista.locator("tbody tr").filter({ hasText: "Eva Confirmable" })).toContainText("Falta: sueldo");
  await expect(lista.locator("tbody tr").filter({ hasText: "Eva Confirmable" })).not.toContainText("S/ 0,00");

  await lista.getByRole("link", { name: "Darío Liquidado" }).click();
  await expect(page.getByRole("heading", { name: "Condiciones laborales de Darío Liquidado", level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Registrar nuevo valor" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Sueldo mensual (S/)").fill("1600");
  await dialogo.getByLabel("Vigente desde").fill("2030-01-16");
  await expect(dialogo.getByRole("heading", { name: "¿Registrar el nuevo sueldo de Darío Liquidado desde el 16/01/2030?" })).toBeVisible();
  await expect(dialogo.getByText("El valor anterior queda vigente hasta el 15/01/2030 y no se reescribe.")).toBeVisible();
  await dialogo.getByRole("button", { name: "Registrar valor" }).click();
  await expect(dialogo).toBeHidden();

  const historial = page.getByRole("region", { name: "Historial de sueldo" });
  await expect(historial.locator("tbody tr")).toHaveCount(2);
  await expect(historial.locator("tbody tr").first()).toContainText("S/ 1.400,00");
  await expect(historial.locator("tbody tr").first()).toContainText("15/01/2030");
  await expect(historial.locator("tbody tr").last()).toContainText("S/ 1.600,00");
  await expect(historial.locator("tbody tr").last()).toContainText("Programado");

  await page.getByRole("button", { name: "Registrar nuevo valor" }).click();
  await dialogo.getByLabel("Sueldo mensual (S/)").fill("1700");
  await dialogo.getByLabel("Vigente desde").fill("2030-01-16");
  await dialogo.getByRole("button", { name: "Registrar valor" }).click();
  // El campo «Vigente desde» no admite una fecha igual o anterior a la última vigencia: el formulario no se envía.
  await expect(dialogo).toBeVisible();
  await expect(historial.locator("tbody tr")).toHaveCount(2);
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  await expect(historial.locator("tbody tr")).toHaveCount(2);

  await page.context().clearCookies();
  await iniciarSesion(page, "admin");
  await page.goto("/pagos/condiciones-laborales");
  await expect(page.getByRole("heading", { name: "Sin permiso" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("S/ ")).toHaveCount(0);
  expect(errores).toEqual([]);
});

test("Condiciones laborales cabe en 375 px: las tablas se desplazan dentro de su región", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await iniciarSesion(page, "finanzas");

  await page.goto("/pagos/condiciones-laborales");
  await expect(page.getByRole("heading", { name: "Condiciones laborales", level: 1 })).toBeVisible({ timeout: 30_000 });
  expect(await desbordeHorizontalDeLaPagina(page)).toBeLessThanOrEqual(0);
  const lista = page.getByRole("region", { name: "Condiciones laborales vigentes hoy" });
  expect(await lista.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);

  await lista.getByRole("link", { name: "Beto Publicado" }).click();
  await expect(page.getByRole("heading", { name: "Condiciones laborales de Beto Publicado", level: 1 })).toBeVisible({ timeout: 30_000 });
  expect(await desbordeHorizontalDeLaPagina(page)).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Registrar nuevo valor" }).click();
  const cajaDelDialogo = await page.getByRole("dialog").boundingBox();
  expect(cajaDelDialogo!.x).toBeGreaterThanOrEqual(0);
  expect(cajaDelDialogo!.x + cajaDelDialogo!.width).toBeLessThanOrEqual(375);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(errores).toEqual([]);
});

/** Abre un diálogo de Pagos; si el clic llega antes de la hidratación de la página, lo repite hasta que el diálogo se vea. */
async function abrirDialogo(page: Page, boton: ReturnType<Page["getByRole"]>): Promise<void> {
  await expect(async () => {
    await boton.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
}

test("Finanzas activa una regla legal con su fuente, la corrige con motivo y consulta una fecha; el Administrador no entra", async ({ page }) => {
  test.setTimeout(90_000);
  const errores = observarErroresDelNavegador(page);

  await iniciarSesion(page, "finanzas");
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: /Pagos/ }).click();
  await page.getByRole("navigation", { name: "Secciones de Pagos" }).getByRole("link", { name: "Reglas legales" }).click();
  await expect(page).toHaveURL(/\/pagos\/reglas-legales$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Reglas legales", level: 1 })).toBeVisible({ timeout: 30_000 });
  const lista = page.getByRole("region", { name: "Reglas legales vigentes hoy" });
  await expect(lista.locator("tbody tr").filter({ hasText: "Tasa de EsSalud" })).toContainText("9,00 %");
  await expect(lista.locator("tbody tr").filter({ hasText: "RMV (remuneración mínima vital)" })).toContainText("S/ 1.000,00");
  await expect(lista.locator("tbody tr").filter({ hasText: "Tasa de ONP" })).toContainText("Programado: 13,00 %");
  await expect(lista.locator("tbody tr").filter({ hasText: "Comisión AFP Habitat sobre flujo" })).toContainText("Pendiente");
  await expect(lista.locator("tbody tr").filter({ hasText: "Comisión AFP Habitat sobre flujo" })).not.toContainText("0,00 %");

  // Activar un valor que todavía no tiene regla, con fecha y fuente.
  const dialogo = page.getByRole("dialog");
  await abrirDialogo(page, page.getByRole("button", { name: "Activar nuevo valor" }));
  await dialogo.getByLabel("Valor legal").selectOption({ label: "Comisión AFP Habitat sobre flujo" });
  await dialogo.getByLabel("Valor (%)").fill("1,5");
  await dialogo.getByLabel("Vigente desde").fill("2030-01-01");
  await dialogo.getByLabel("Fuente oficial (norma o enlace)").fill("Resolución sintética de prueba");
  await expect(dialogo.getByRole("heading", { name: "¿Activar la Comisión AFP Habitat sobre flujo de 1,50 % desde el 01/01/2030?" })).toBeVisible();
  await expect(dialogo.getByText("Quedará registrado a nombre de finanzas.")).toBeVisible();
  await dialogo.getByRole("button", { name: "Activar valor" }).click();
  await expect(dialogo).toBeHidden();
  await expect(lista.locator("tbody tr").filter({ hasText: "Comisión AFP Habitat sobre flujo" })).toContainText("Programado: 1,50 % desde el 01/01/2030");

  // Historial, consulta por fecha y corrección con motivo.
  await lista.getByRole("link", { name: "Comisión AFP Habitat sobre flujo" }).click();
  await expect(page.getByRole("heading", { name: "Comisión AFP Habitat sobre flujo", level: 1 })).toBeVisible({ timeout: 30_000 });
  const historial = page.getByRole("region", { name: "Historial de Comisión AFP Habitat sobre flujo" });
  await expect(historial.locator("tbody tr")).toHaveCount(1);
  await expect(historial.locator("tbody tr")).toContainText("Resolución sintética de prueba");
  await expect(historial.locator("tbody tr")).toContainText("finanzas");
  await expect(historial.locator("tbody tr")).toContainText("Programado");

  await page.getByLabel("Fecha", { exact: true }).fill("2030-06-01");
  await page.getByRole("button", { name: "Consultar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "rige 1,50 %" })).toContainText("vigente desde el 01/01/2030");
  await page.getByLabel("Fecha", { exact: true }).fill("2029-12-31");
  await page.getByRole("button", { name: "Consultar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sin regla vigente en esa fecha (31/12/2029)" })).toBeVisible();

  await abrirDialogo(page, historial.getByRole("button", { name: /Corregir/ }));
  await dialogo.getByLabel("Valor (%)").fill("1,6");
  await dialogo.getByLabel("Motivo de la corrección").fill("Error de digitación");
  await dialogo.getByRole("button", { name: "Reemplazar valor" }).click();
  await expect(dialogo).toBeHidden();
  await expect(historial.locator("tbody tr")).toHaveCount(2);
  await expect(historial.locator("tbody tr").first()).toContainText("Reemplazado");
  await expect(historial.locator("tbody tr").first()).toContainText("Motivo: Error de digitación");
  await expect(historial.locator("tbody tr").last()).toContainText("1,60 %");

  // Una vigencia repetida se rechaza junto al formulario y no cambia el historial.
  await abrirDialogo(page, page.getByRole("button", { name: "Activar nuevo valor" }));
  await dialogo.getByLabel("Valor (%)").fill("1,7");
  await dialogo.getByLabel("Vigente desde").fill("2030-01-01");
  await dialogo.getByLabel("Fuente oficial (norma o enlace)").fill("Otra fuente");
  await dialogo.getByRole("button", { name: "Activar valor" }).click();
  await expect(dialogo.getByRole("alert")).toContainText("use «Corregir»");
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  await expect(historial.locator("tbody tr")).toHaveCount(2);

  await page.context().clearCookies();
  await iniciarSesion(page, "admin");
  await page.goto("/pagos/reglas-legales");
  await expect(page.getByRole("heading", { name: "Sin permiso" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("S/ ")).toHaveCount(0);
  await page.goto("/pagos/reglas-legales/rmv");
  await expect(page.getByRole("heading", { name: "Sin permiso" })).toBeVisible({ timeout: 30_000 });
  expect(errores).toEqual([]);
});

test("Reglas legales cabe en 375 px: la tabla se desplaza dentro de su región", async ({ page }) => {
  const errores = observarErroresDelNavegador(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await iniciarSesion(page, "finanzas");

  await page.goto("/pagos/reglas-legales");
  await expect(page.getByRole("heading", { name: "Reglas legales", level: 1 })).toBeVisible({ timeout: 30_000 });
  expect(await desbordeHorizontalDeLaPagina(page)).toBeLessThanOrEqual(0);
  const lista = page.getByRole("region", { name: "Reglas legales vigentes hoy" });
  expect(await lista.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);

  await lista.getByRole("link", { name: "Tasa de EsSalud" }).click();
  await expect(page.getByRole("heading", { name: "Tasa de EsSalud", level: 1 })).toBeVisible({ timeout: 30_000 });
  expect(await desbordeHorizontalDeLaPagina(page)).toBeLessThanOrEqual(0);
  await abrirDialogo(page, page.getByRole("button", { name: "Activar nuevo valor" }));
  const cajaDelDialogo = await page.getByRole("dialog").boundingBox();
  expect(cajaDelDialogo!.x).toBeGreaterThanOrEqual(0);
  expect(cajaDelDialogo!.x + cajaDelDialogo!.width).toBeLessThanOrEqual(375);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(errores).toEqual([]);
});
