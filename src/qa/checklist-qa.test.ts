import { describe, expect, it } from "vitest";

import { pasosDeQaManual, resumenDeRevision } from "./checklist-qa";

describe("checklist de QA manual", () => {
  it("prioriza los pasos de QA manual y muestra como máximo seis", () => {
    const issue = `## Acceptance criteria
- [ ] El servidor arranca.

## QA manual
1. Abrir la URL local.
2. Iniciar sesión como admin.
3. Comprobar el calendario.
4. Revisar una asistencia.
5. Volver al inicio.
6. Cerrar sesión.
7. Repetir el recorrido.

## Blocked by
- None`;

    expect(pasosDeQaManual(issue)).toEqual([
      "Abrir la URL local.",
      "Iniciar sesión como admin.",
      "Comprobar el calendario.",
      "Revisar una asistencia.",
      "Volver al inicio.",
      "Cerrar sesión.",
    ]);
  });

  it("usa criterios observables cuando no hay sección QA manual", () => {
    const issue = `## Acceptance criteria
- [ ] La página muestra el período abierto.
- [ ] Al iniciar sesión como admin, se puede abrir Asistencias.
- [ ] Ejecutar \`pnpm validate\` sin errores.

## Blocked by
None`;

    expect(pasosDeQaManual(issue)).toEqual([
      "Comprobar que la página muestra el período abierto.",
      "Comprobar que al iniciar sesión como admin, se puede abrir Asistencias.",
    ]);
  });

  it("omite criterios de código, documentación y pruebas que no se pueden revisar en la app", () => {
    const issue = `## Criterios de aceptación
- [ ] El parser tiene pruebas unitarias para el fallback.
- [ ] Documentar el workflow de los agentes.
- [ ] \`pnpm validate\` pasa.
- [ ] El usuario puede iniciar sesión desde la pantalla de acceso.`;

    expect(pasosDeQaManual(issue)).toEqual([
      "Comprobar que el usuario puede iniciar sesión desde la pantalla de acceso.",
    ]);
  });

  it("incluye el comportamiento observable de pnpm revisar en el fallback", () => {
    const issue = `## Acceptance criteria
- [ ] \`pnpm revisar\` sigue preparando la base desechable y levantando Next.js desde el worktree con un solo comando.
- [ ] Antes de levantar Next.js muestra título y enlace de la issue, URL local, cuentas y hasta seis pasos breves de QA manual.
- [ ] Prioriza una sección \`QA manual\`; si falta, convierte los criterios de aceptación observables en una lista útil.
- [ ] Si GitHub CLI o la red no están disponibles, informa el fallback sin bloquear el servidor.
- [ ] El parser del checklist tiene pruebas para sección explícita, fallback y criterios no manuales.
- [ ] El workflow pide que cada tarea incluya pasos manuales concretos cuando aplique; \`pnpm validate\` pasa.`;

    expect(pasosDeQaManual(issue)).toEqual([
      "Comprobar que pnpm revisar sigue preparando la base desechable y levantando Next.js desde el worktree con un solo comando.",
      "Comprobar que antes de levantar Next.js muestra título y enlace de la issue, URL local, cuentas y hasta seis pasos breves de QA manual.",
      "Comprobar que prioriza una sección QA manual; si falta, convierte los criterios de aceptación observables en una lista útil.",
      "Comprobar que si GitHub CLI o la red no están disponibles, informa el fallback sin bloquear el servidor.",
    ]);
  });
});

describe("resumen del entorno de revisión", () => {
  const entorno = { numero: 140, rama: "agent/issue-140-checklist-qa", nombreBase: "planilla_rev_140", puerto: 3140 };

  it("muestra issue, acceso y pasos antes de iniciar el servidor", () => {
    const lineas = resumenDeRevision({
      ...entorno,
      issue: {
        title: "Mostrar checklist de QA",
        url: "https://github.com/diego-valdettaro/gestor-planilla-patty/issues/140",
        body: "## QA manual\n1. Abrir la URL local.",
      },
    });

    expect(lineas).toContain("  Issue:   Mostrar checklist de QA (https://github.com/diego-valdettaro/gestor-planilla-patty/issues/140)");
    expect(lineas).toContain("  URL:     http://localhost:3140");
    expect(lineas).toContain("  Cuentas: operaciones/operaciones · admin/admin · finanzas/finanzas");
    expect(lineas).toContain("    1. Abrir la URL local.");
  });

  it("avisa cuando gh no pudo traer la issue y conserva los datos de acceso", () => {
    const lineas = resumenDeRevision(entorno);

    expect(lineas).toContain("  No pude consultar la issue con gh (CLI, conexión o permisos). El servidor arrancará igual.");
    expect(lineas).toContain("  Issue:   #140 (https://github.com/diego-valdettaro/gestor-planilla-patty/issues/140)");
    expect(lineas).toContain("  URL:     http://localhost:3140");
    expect(lineas).toContain("  QA manual: sin pasos disponibles; consultá la issue directamente.");
  });
});
