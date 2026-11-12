# Planilla Patty

Aplicación web para administrar el personal, los horarios, la asistencia y la
preliquidación mensual de Patty.

## Producto

**Problema.** La asistencia se exportaba del huellero y se copiaba a mano a la
planilla mensual en Excel. Marcas, correcciones, horarios, horas extra y
cálculos de pago quedaban mezclados y era difícil auditar qué cambió y por qué.

**Objetivo.** Que cada importe de la preliquidación pueda rastrearse hasta sus
hechos, fuentes y reglas: relaciones laborales confirmadas, horarios
publicados, marcas importadas, jornadas revisadas, períodos cerrados y fuentes
externas confirmadas.

**Usuarios.**

| Rol | Qué hace |
| --- | --- |
| Administrador del sistema | Configuración global y cuentas |
| Gerente de área | Personas, horarios y confirmación de jornadas de sus grupos |
| Recursos Humanos | Ingresos y ceses |
| Finanzas | Períodos, cierre, datos monetarios, Pagos y constancia del pago |

**Alcance.** Personal y relaciones laborales, horarios semanales, importación
de marcas, registro y revisión de asistencia, períodos de planilla y Pagos
(borrador, finalización, exportación y constancia de pago). La aplicación no
ejecuta transferencias ni genera PLAME.

## Documentación

- [Diseño de software](docs/diseno-software.md): reglas de producto,
  responsabilidades y contratos de toda la app.
- [Diseño visual](docs/diseno-visual.md): patrones, pantallas, textos y estados.
- [CONTEXT.md](CONTEXT.md): glosario del dominio.
- [ADR](docs/adr): decisiones y sus motivos.
- [Desarrollo y validación](docs/desarrollo.md): cómo se trabaja una issue.
- [Despliegue](docs/despliegue.md): instalación existente, variables y migraciones.
- [PRD del MVP](PRD-gestor-planillas-mvp.md): borrador inicial, histórico. Sus
  roles y alcance fueron reemplazados por los diseños y los ADR.

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
[docs/desarrollo.md](docs/desarrollo.md).

## Cambios

Las issues están en GitHub. Antes de cambiar la aplicación, leer
[AGENTS.md](AGENTS.md) y seguir [docs/desarrollo.md](docs/desarrollo.md).
