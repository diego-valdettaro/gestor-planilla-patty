# Autorización en el servidor por rol

Estado: aceptada

El MVP usará cuentas locales y tres roles mutuamente excluyentes: Líder de Operaciones, Administración y Finanzas. La aplicación comprobará el rol en el servidor antes de ejecutar cada caso de uso. Ocultar un botón no cuenta como autorización porque una persona podría invocar la operación sin pasar por la pantalla.

## Consecuencias

- Líder de Operaciones solo administra y publica turnos.
- Administración y Finanzas importan, revisan, ajustan, consultan, exportan y gestionan períodos. Finanzas también aprueba o rechaza horas extra.
- La primera cuenta de Administración se aprovisiona por una operación de despliegue documentada. La aplicación no tendrá registro público de usuarios.
