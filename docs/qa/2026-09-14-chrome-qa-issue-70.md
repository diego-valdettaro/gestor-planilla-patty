# Reporte de QA en Chromium, issue #70

## Contexto y alcance

- Fecha: 2026-09-14.
- Rama: `agent/issue-70-confirmar-rango-modal`.
- Entorno: `pnpm revisar`, base descartable `planilla_rev_70`, seed de revisión y `http://localhost:3070`.
- Rol: Administración.
- Tamaño: Desktop Chrome, 1280 × 720.
- Herramienta: Chromium con Playwright. No había conexión de Chrome DevTools disponible.
- Alcance: QA básico del modal de confirmación por rango en las vistas semanal y mensual.

## Cobertura

| Caso | Flujo y rol | Comprobación final | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| Rango semanal | Administración abre el modal desde Tiendas | Precarga 7–13 sep, selecciona a Eva y explica todos los bloqueos | Aprobado | `2026-09-14-issue-70-modal-semanal.png` |
| Rango mensual | Administración abre el modal de Eva | Precarga 1–30 sep y solo incluye a Eva | Aprobado | `2026-09-14-issue-70-modal-mensual.png` |
| Cambio de vista | Mensual → semanal mediante el enlace visible | El modal cambia el rango precargado del mes a la semana | Aprobado | Registro Playwright |
| Selección manual | Desmarca y vuelve a marcar a Eva | Sin selección, confirmar queda deshabilitado; al marcarla vuelve a habilitarse | Aprobado | Registro Playwright |
| Confirmación y persistencia | Confirma 8–11 sep y recarga la página | La fila de Eva queda registrada tras recargar | Aprobado | Registro Playwright |
| Errores del navegador | Recorrido completo | Sin `console.error`, `pageerror`, respuestas 5xx ni fallos de petición no abortados por navegación | Aprobado | Registro Playwright |

## Hallazgos y pendientes

Sin hallazgos funcionales. La confirmación modificó solo la base descartable y esta se eliminó al cerrar el entorno. No se inspeccionaron paneles de red ni consola mediante DevTools; Playwright capturó esos errores durante el recorrido.
