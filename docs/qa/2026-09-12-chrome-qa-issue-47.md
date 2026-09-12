# QA básico de la issue #47

## Contexto y alcance

- Fecha: 2026-09-12
- Commit probado: `cb04fe9b6aca8f15621fd196e1df5248cca60f4c`
- URL: `http://127.0.0.1:3047`
- Entorno: rama `agent/issue-47-playwright`, base descartable `planilla_rev_47`, seed de revisión
- Rol: Administración
- Navegador: Chromium headless, 1440 x 1000
- Herramienta: Playwright con observación de consola, excepciones de página y respuestas HTTP

El humo cubrió el rechazo de una contraseña incorrecta y el acceso autenticado a las cuatro rutas exigidas por la issue. La base y el `.env` del worktree se eliminaron al terminar.

## Cobertura

| Caso | Flujo y rol | Comprobación final | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| Credenciales incorrectas | Inicio de sesión | Mensaje "Las credenciales no son válidas.", formulario disponible y sin pantalla de excepción | aprobado | [captura](evidencia-issue47/iniciar-sesion-error.png) |
| Configuración | Administración abre `/configuracion` | HTTP 200, título visible y consola limpia | aprobado | [captura](evidencia-issue47/configuracion.png) |
| Horarios | Administración abre `/turnos` | HTTP 200, título visible y consola limpia | aprobado | [captura](evidencia-issue47/turnos.png) |
| Asistencias | Administración abre `/asistencias` | HTTP 200, título visible y consola limpia | aprobado | [captura](evidencia-issue47/asistencias.png) |
| Períodos | Administración abre `/periodos` | HTTP 200, título visible y consola limpia | aprobado | [captura](evidencia-issue47/periodos.png) |

Resultado técnico final: 0 errores de consola, 0 excepciones de página y 0 respuestas HTTP fallidas.

## Hallazgos

No hubo fallos funcionales en el alcance acordado.

La captura de Horarios muestra texto apretado dentro de las celdas. Es un problema visual preexistente: la rama no modifica rutas, componentes ni CSS. Queda fuera del alcance de #47.

## Notas de ejecución

La primera captura se tomó antes de que React terminara de hidratar y provocó avisos por el estilo temporal con el que Playwright oculta el cursor. Se repitió el recorrido esperando `networkidle` antes de capturar. El resultado final no reprodujo esos avisos.

No quedaron datos, procesos ni configuración temporal del humo.
