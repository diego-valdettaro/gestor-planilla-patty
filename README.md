# Planilla Patty

Aplicación web para administrar colaboradores, horarios, asistencias y
períodos de planilla.

## Requisitos

- Node.js 22
- Corepack y pnpm 10
- Docker, para `pnpm validate`
- PostgreSQL, para ejecutar la aplicación localmente

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

Para crear la primera cuenta de administración, defina `ADMIN_NOMBRE_USUARIO`
y `ADMIN_CONTRASENA` y ejecute:

```powershell
pnpm provisionar:administracion
```

Las instrucciones para una instalación existente, variables de feedback y
migraciones se encuentran en [docs/despliegue.md](docs/despliegue.md).

## Validación

```powershell
pnpm validate
```

El comando crea una base PostgreSQL temporal, aplica las migraciones, ejecuta
pruebas, typecheck y build. No usa la base local `planilla`.

## Cambios

Las issues están en GitHub. Antes de cambiar la aplicación, leer `AGENTS.md` y
seguir [docs/agents/agent-workflow.md](docs/agents/agent-workflow.md).
