# Planilla Patty

Aplicación web para administrar colaboradores, horarios, asistencias y
períodos de planilla.

## Requisitos

El proyecto fija Next.js 16.4.5; el build usa Webpack.

- Node.js 22
- Corepack y pnpm 10
- Docker, para las validaciones, `pnpm test:e2e` y `pnpm revisar`
- Chromium para Playwright (`pnpm exec playwright install chromium`)
- PostgreSQL, solo para ejecutar la aplicación localmente con `pnpm dev`

## Arranque local

```powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm db:migrate
pnpm dev
```

Configure `DATABASE_URL` en `.env` con una base local. La aplicación comprueba
las migraciones antes de arrancar.

Para crear la primera cuenta, de Administrador del sistema, defina `ADMIN_NOMBRE_USUARIO`
y `ADMIN_CONTRASENA` y ejecute:

```powershell
pnpm provisionar:administrador
```

Las instrucciones para una instalación existente, variables de feedback y
migraciones se encuentran en [docs/despliegue.md](docs/despliegue.md).

## Validación

Cada commit ejecuta el hook con controles de código e integración y revisión de
tipos, usando PostgreSQL temporal, sin build ni Chromium. También se pueden
ejecutar directamente:

```powershell
pnpm validate:commit
```

Antes de publicar el candidato final, ejecutar una vez la validación completa;
repetir si cambia código, pruebas, configuración o dependencias:

```powershell
pnpm validate
```

El comando crea una base PostgreSQL temporal, aplica las migraciones, ejecuta
pruebas unitarias y de integración, revisión de tipos y build. Después siembra
los datos de prueba y ejecuta Chromium con `next start`, sobre ese mismo build.
No usa la base local `planilla`. GitHub ejecuta la validación completa al abrir
o actualizar un PR y al integrar en `master`.

Las pruebas de navegador también pueden ejecutarse por separado. El comando
crea su propia base PostgreSQL desechable, aplica migraciones, genera un build
y siembra los datos de prueba antes de arrancar `next start`. No requiere un
build previo, iniciar sesión ni levantar la aplicación manualmente:

```powershell
pnpm test:e2e
```

## Revisar una rama

```powershell
pnpm revisar
pnpm revisar:limpiar
```

`pnpm revisar` levanta la rama del worktree en un entorno aislado: un contenedor
PostgreSQL desechable en Docker, con migraciones y datos de demostración, y
`next dev` en el puerto `3000 + <n>` (`<n>` es el número de issue). Requiere
Docker, pero no un `.env` ni un PostgreSQL local. `pnpm revisar:limpiar` elimina
el servidor, el contenedor y el `.env` del worktree. Los detalles están en
[docs/agents/agent-workflow.md](docs/agents/agent-workflow.md).

## Cambios

Las issues están en GitHub. Antes de cambiar la aplicación, leer `AGENTS.md` y
seguir [docs/agents/agent-workflow.md](docs/agents/agent-workflow.md).
