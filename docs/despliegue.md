# Despliegue

Antes de arrancar la aplicación, configure `DATABASE_URL` y ejecute `pnpm db:migrate`. El comando aplica los archivos SQL de `drizzle/` en orden, dentro de transacciones, y registra archivo y checksum en `migraciones_planilla`. No edite una migración ya aplicada.

`pnpm dev` y `pnpm start` ejecutan `pnpm db:check` antes de iniciar Next.js. Si falta una migración, la aplicación no arranca.

## Adopción en una instalación existente

La instalación existente que llegó hasta `0012_eliminar_minutos_de_almuerzo.sql` no tiene historial. Ejecute una única vez `pnpm db:baseline`; el comando comprueba esa versión y registra las migraciones `0000` a `0012`, sin ejecutar SQL. Luego ejecute `pnpm db:migrate` para aplicar `0013_crear_modelos_de_horario.sql`.

No use `db:baseline` en una base vacía ni en una base que ya haya recibido `0013`. En esos casos, consulte la versión real del esquema antes de proceder.

## Validación de cambios

Ejecute `corepack pnpm validate` antes de cada commit. El comando crea un contenedor PostgreSQL temporal, aplica todas las migraciones y ejecuta pruebas, typecheck y build. El contenedor se elimina al terminar, incluso si una validación falla. No usa datos de la base local `planilla`.

Para crear la única cuenta inicial de Administración, defina `ADMIN_NOMBRE_USUARIO` y `ADMIN_CONTRASENA`, y ejecute `pnpm provisionar:administracion`.

El comando solo funciona cuando no hay cuentas locales. Luego, para crear una cuenta de Operaciones, Administración o Finanzas, defina `CUENTA_NOMBRE_USUARIO`, `CUENTA_CONTRASENA` y `CUENTA_ROL`, y ejecute `pnpm provisionar:cuenta`.

Los comandos no imprimen ni guardan la contraseña fuera del hash Argon2id.

## Feedback a issues

El botón de feedback requiere estas variables solo en el servidor:

- `OPENAI_API_KEY`: clave de la API de OpenAI para sintetizar el comentario.
- `GITHUB_TOKEN`: token con permiso de crear issues en el repositorio.
- `GITHUB_REPOSITORY`: opcional. Por defecto usa `diego-valdettaro/gestor-planilla-patty`.
- `FEEDBACK_OPENAI_MODEL`: opcional. Por defecto usa `gpt-5-mini`.

El comentario, la ruta y el rol se convierten en un issue de GitHub con la etiqueta `ready-for-agent`. No exponga estas variables al navegador ni las agregue a `.env` versionado.
