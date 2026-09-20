# QA básico issue #100 (teclado: selector semanal y feedback)

Entorno: `pnpm revisar` (base desechable `planilla_rev_100`, puerto 3100), cuenta `operaciones` del seed. Script Playwright ad hoc.

- Ruta tocada: `/turnos` (selector semanal) y panel de feedback (layout global).
- Selector: Enter abre; la fecha enfocada muestra contorno (`issue-100-selector-foco.png`); Escape cierra y el foco vuelve a `.boton-fecha-semanal`.
- Feedback: al abrir el foco va al campo Comentario (`issue-100-feedback-abierto.png`); Escape cierra y el foco vuelve al botón (`issue-100-feedback-cerrado.png`).
- Errores de consola: ninguno.
