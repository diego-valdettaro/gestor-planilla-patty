# Despliegue

Antes de arrancar la aplicación, configure `DATABASE_URL` y aplique los archivos SQL de `drizzle/` en orden numérico. El repositorio no incluye el journal de Drizzle, por lo que `drizzle-kit migrate` no detecta estas migraciones. Para actualizar una instalación existente con el módulo de períodos, ejecute `drizzle/0008_resumen_y_cierre_periodos.sql` contra PostgreSQL.

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
