# Despliegue

Antes de arrancar la aplicación, configure `DATABASE_URL` y ejecute `pnpm db:migrate`. El comando aplica los archivos SQL de `drizzle/` en orden, dentro de transacciones, y registra archivo y checksum en `migraciones_planilla`. No edite una migración ya aplicada.

`pnpm dev` y `pnpm start` ejecutan `pnpm db:check` antes de iniciar Next.js. Si falta una migración, la aplicación no arranca.

## Adopción en una instalación existente

La instalación existente que llegó hasta `0012_eliminar_minutos_de_almuerzo.sql` no tiene historial. Ejecute una única vez `pnpm db:baseline`; el comando comprueba esa versión y registra las migraciones `0000` a `0012`, sin ejecutar SQL. Luego ejecute `pnpm db:migrate` para aplicar `0013_crear_modelos_de_horario.sql`.

No use `db:baseline` en una base vacía ni en una base que ya haya recibido `0013`. En esos casos, consulte la versión real del esquema antes de proceder.

## Validación de cambios

Ejecute `corepack pnpm validate` antes de cada commit. El comando crea un contenedor PostgreSQL temporal, aplica todas las migraciones y ejecuta pruebas, typecheck y build. El contenedor se elimina al terminar, incluso si una validación falla. No usa datos de la base local `planilla`.

Para crear la única cuenta inicial de Administrador del sistema, defina `ADMIN_NOMBRE_USUARIO` y `ADMIN_CONTRASENA`, y ejecute `pnpm provisionar:administrador`.

El comando solo funciona cuando no hay cuentas locales. Luego, para crear una cuenta de rol `administrador`, `gerente_de_area`, `recursos_humanos` o `finanzas`, defina `CUENTA_NOMBRE_USUARIO`, `CUENTA_CONTRASENA` y `CUENTA_ROL`, y ejecute `pnpm provisionar:cuenta`. Una vez dentro, Finanzas y el Administrador crean cuentas desde **Cuentas** y asignan a cada gerente de área los grupos que dirige.

### Migración de roles (ADR 0012)

La migración `0028_roles_de_cuenta_y_gerentes_por_grupo.sql` convierte las cuentas existentes con esta regla:

| Rol anterior | Rol nuevo |
| --- | --- |
| `administracion` | `administrador` |
| `operaciones` | `gerente_de_area`, sin grupos: Finanzas o el Administrador los asignan desde **Cuentas** |
| `finanzas` | `finanzas` (sin cambio) |

Hasta que se les asignen grupos, los gerentes migrados ven «Todavía no tiene grupos asignados». El grupo «Administración», si existe, queda como grupo que no gestiona asistencia ni horarios.

### Relaciones laborales (ADR 0012, enmienda #109)

La migración `0029_relaciones_laborales.sql` crea la tabla de relaciones laborales y no registra ninguna para los colaboradores existentes (los datos actuales son de desarrollo). Desde esa migración un gerente solo publica horarios dentro de una relación laboral confirmada: antes de usar **Horarios** una cuenta de Recursos Humanos (créela desde **Cuentas**) debe registrar y confirmar el ingreso de cada colaborador en **Relaciones laborales**.

Los comandos no imprimen ni guardan la contraseña fuera del hash Argon2id.

## Feedback a issues

El botón de feedback requiere estas variables solo en el servidor:

- `OPENAI_API_KEY`: clave de la API de OpenAI para sintetizar el comentario.
- `GITHUB_TOKEN`: token con permiso de crear issues en el repositorio.
- `GITHUB_REPOSITORY`: opcional. Por defecto usa `diego-valdettaro/gestor-planilla-patty`.
- `FEEDBACK_OPENAI_MODEL`: opcional. Por defecto usa `gpt-5-mini`.

El comentario, la ruta y el rol se convierten en un issue de GitHub con la etiqueta `ready-for-agent`. No exponga estas variables al navegador ni las agregue a `.env` versionado.
