# Flujo de trabajo de agentes

## Alcance de una tarea

Cada cambio parte de una issue o especificación. Leer `AGENTS.md`, la issue,
`docs/agents/domain.md` y, si toca interfaz, `docs/agents/diseno.md` antes de
editar. Si falta una decisión de producto o el alcance no está claro, detenerse
y pedirla.

## Aislamiento

- No desarrollar sobre `master` ni en un checkout que contenga cambios ajenos.
- Crear un worktree y una rama por issue. Usar
  `agent/issue-<numero>-<descripcion-corta>`.
- Coordinar antes de tocar migraciones, dependencias, rutas, navegación o
  `src/app/global.css`. Son áreas compartidas.
- Una tarea no incluye refactors, migraciones o dependencias no requeridos por
  la issue.

## Construcción y validación

1. Relacionar cada criterio de aceptación con una prueba o una comprobación
   observable.
2. Añadir pruebas de comportamiento en las costuras existentes.
3. Ejecutar `pnpm validate` antes de crear un commit. No usar la base local
   `planilla` para las pruebas.
4. Para cambios de interfaz, hacer humo de cada ruta afectada en navegador:
   carga sin error, consola limpia y recorrido breve del criterio modificado.
5. Revisar el diff final contra la issue. No incluir cambios ajenos.

## Entrega

- El agente puede crear worktrees, ramas locales y commits.
- Solo puede hacer push o abrir un pull request cuando el usuario lo autorice.
- El pull request debe enlazar la issue, listar la evidencia de cada criterio,
  incluir el resultado de `pnpm validate`, capturas de las rutas modificadas y
  riesgos o comprobaciones pendientes.
- No fusionar pull requests salvo instrucción expresa del usuario.
