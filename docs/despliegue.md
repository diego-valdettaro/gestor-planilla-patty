# Despliegue

Antes de arrancar la aplicación, configure `DATABASE_URL` y aplique las migraciones de Drizzle. Para crear la única cuenta inicial de Administración, defina `ADMIN_NOMBRE_USUARIO` y `ADMIN_CONTRASENA`, y ejecute `pnpm provisionar:administracion`.

El comando solo funciona cuando no hay cuentas locales. Luego, para crear una cuenta de Operaciones, Administración o Finanzas, defina `CUENTA_NOMBRE_USUARIO`, `CUENTA_CONTRASENA` y `CUENTA_ROL`, y ejecute `pnpm provisionar:cuenta`.

Los comandos no imprimen ni guardan la contraseña fuera del hash Argon2id.
