# Despliegue

Antes de arrancar la aplicación, configure `DATABASE_URL` y aplique los archivos SQL de `drizzle/` en orden numérico. El repositorio no incluye el journal de Drizzle, por lo que `drizzle-kit migrate` no detecta estas migraciones. Para actualizar una instalación existente con el módulo de períodos, ejecute `drizzle/0008_resumen_y_cierre_periodos.sql` contra PostgreSQL.

Para crear la única cuenta inicial de Administración, defina `ADMIN_NOMBRE_USUARIO` y `ADMIN_CONTRASENA`, y ejecute `pnpm provisionar:administracion`.

El comando solo funciona cuando no hay cuentas locales. Luego, para crear una cuenta de Operaciones, Administración o Finanzas, defina `CUENTA_NOMBRE_USUARIO`, `CUENTA_CONTRASENA` y `CUENTA_ROL`, y ejecute `pnpm provisionar:cuenta`.

Los comandos no imprimen ni guardan la contraseña fuera del hash Argon2id.
