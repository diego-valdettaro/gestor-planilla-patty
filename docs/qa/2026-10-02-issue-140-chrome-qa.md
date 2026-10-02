# QA básico del issue #140

Fecha: 2026-10-02. Commit probado: `3522c49`. Entorno: `pnpm revisar` en el worktree del issue, con PostgreSQL 18 desechable y Next.js en `http://localhost:3140`. Usé Playwright con Chromium a 1280 × 800 para el recorrido de la app y para observar errores de consola, excepciones y respuestas HTTP fallidas. No usé Chrome DevTools.

| Caso | Comprobación final | Estado | Evidencia |
| --- | --- | --- | --- |
| Preparación con un comando | `pnpm revisar` creó `planilla_rev_140`, aplicó todas las migraciones y sembró los datos antes de iniciar Next.js. | Aprobado | Salida de la terminal. |
| Resumen de revisión | Mostró título y enlace de la issue, URL local, cuentas y los cuatro pasos de `## QA manual` antes de iniciar Next.js. | Aprobado | Salida de la terminal. |
| Acceso a la app | `/iniciar-sesion` respondió 200. La cuenta de administración abrió `/turnos`, cuyo encabezado fue "Planificación de horarios". No hubo errores de consola, excepciones de página ni respuestas HTTP de error en el recorrido. | Aprobado | [Acceso](issue-140-login.png), [Horarios](issue-140-turnos.png). |
| GitHub CLI no disponible | Al hacer fallar `gh`, el resumen indicó que no pudo consultar la issue y Next.js inició igual. `/iniciar-sesion` respondió 200. | Aprobado | Salida de la terminal. |
| Limpieza | Tras cortar el servidor, `pnpm revisar:limpiar` eliminó la base de revisión y el `.env` del worktree. Una consulta a `pg_database` confirmó que la base ya no existía. | Aprobado | Salida de la terminal y consulta a PostgreSQL. |

No encontré fallos funcionales en este alcance. La validación y el humo usaron PostgreSQL 18 local porque este usuario no tiene acceso al socket de Docker. Queda sin comprobar la ejecución con la imagen PostgreSQL 16 del comando de validación habitual. No quedaron datos de prueba ni configuración temporal.
