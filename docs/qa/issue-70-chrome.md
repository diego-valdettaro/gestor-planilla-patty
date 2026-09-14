# QA básico, issue 70

Fecha: 2026-09-14. Entorno previsto: `planilla_rev_70`, puerto 3070, cuenta `admin`.

## Resultado

- El entorno aislado se creó, migró y sembró correctamente.
- `http://[::1]:3070/iniciar-sesion` respondió `200 OK`.
- No se completó la sesión automatizada ni se obtuvieron capturas. El adaptador de Playwright no tenía navegador propio y la ejecución con el Chrome instalado no devolvió una navegación antes del límite del entorno.
- No se inspeccionaron consola ni red. Esta QA no prueba el flujo de confirmación ni autoriza un PR listo para revisión.

## Cobertura pendiente

- Vista semanal y mensual con selector de rango.
- Colaborador bloqueado por marcas incompletas, jornada cerrada e inconsistencia de horas.
- Confirmación de una selección y persistencia tras recargar.
