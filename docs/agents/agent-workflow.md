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
- Crear los worktrees junto al repositorio, por ejemplo
  `../planilla-worktrees/issue-<numero>-<descripcion-corta>`, no dentro del
  repositorio. Así las herramientas no confunden los archivos de configuración
  del worktree con los del proyecto principal.
- En un worktree nuevo, ejecutar `pnpm install --frozen-lockfile` antes de
  probar, validar o crear un commit. El worktree no comparte `node_modules`
  con el checkout principal.
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
4. Para cambios de interfaz, levantar la app con `pnpm revisar` (ver más abajo)
   y hacer humo de cada ruta afectada en navegador: carga sin error, consola
   limpia y recorrido breve del criterio modificado.
5. Revisar el diff final contra la issue. No incluir cambios ajenos.

## Revisar una rama localmente

Antes del merge, la app se prueba a mano desde la rama del PR con un entorno
aislado. Es también el método que usa el humo funcional del punto 4.

- `pnpm revisar` (corrido dentro del worktree): crea una base desechable
  `planilla_rev_<n>` en el mismo PostgreSQL, le aplica las migraciones de la
  rama, corre `scripts/sembrar-base.ts` y `next dev` en el puerto `3000 + <n>`.
  Deduce `<n>` del nombre de rama; `--puerto` / `--nombre` / `--numero` lo
  fuerzan. `--reutilizar` salta el recrear/sembrar si la base ya existe.
- `pnpm revisar:limpiar`: baja el servidor, elimina `planilla_rev_<n>` y el
  `.env` del worktree.
- La base local `planilla` nunca se toca. El `.env` que genera `pnpm revisar`
  solo apunta a la base de revisión; no copia secretos del `.env` principal.
- `scripts/sembrar-base.ts` crea un mundo coherente de demo (cuentas por rol
  con clave = su nombre, sedes y grupos, colaboradores, modelos, políticas,
  un período abierto y uno cerrado, y una semana con los cuatro estados de
  Horarios). Preferir **extender ese seed** cuando un caso falte.
- Solo para un estado de un solo uso: `scripts/escenarios/issue-<n>.ts`,
  commiteado en el PR y ejecutado por `pnpm revisar` si existe. Se pueden podar
  los de issues ya fusionados.

## Entrega

- El agente puede crear worktrees, ramas locales y commits.
- Solo puede hacer push o abrir un pull request cuando el usuario lo autorice.
- El pull request debe enlazar la issue, listar la evidencia de cada criterio,
  incluir el resultado de `pnpm validate`, capturas de las rutas modificadas y
  riesgos o comprobaciones pendientes.
- No fusionar pull requests salvo instrucción expresa del usuario.
