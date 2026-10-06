# QA básico del issue #104

Fecha: 2026-10-06. Commit probado: `f618482`. Entorno: `pnpm revisar` en el worktree del issue, con PostgreSQL desechable y Next.js en `http://localhost:3104`. Usé Playwright con Chromium, con la cuenta de Finanzas, a 375 × 812 y a 1280 × 900, para recorrer `/periodos` con todos los detalles diarios abiertos y observar errores de consola, excepciones y respuestas HTTP fallidas. No usé Chrome DevTools.

| Caso | Comprobación final | Estado | Evidencia |
| --- | --- | --- | --- |
| Carga de `/periodos` | La página cargó con 14 tablas (totales y horas extra del período completo, y totales, horas extra y detalle diario de cada colaborador). Sin errores de consola, excepciones ni respuestas HTTP de error a ningún ancho. | Aprobado | Las capturas de abajo. |
| Cifras a la derecha | Totales, horas extra y las columnas «Tiempo trabajado», «Tardanza» y «Penalización» quedan alineadas a la derecha; fecha, sede, resultado, horario y descripción de hora extra quedan a la izquierda. | Aprobado | [Escritorio](issue-104-escritorio-detalle.png), [375 px](issue-104-375-detalle-final.png). |
| Desplazamiento local a 375 px | La página no desborda (ancho del documento igual al de la ventana). Cada tabla se desplaza dentro de su región y, al llegar al final, muestra su última columna completa. | Aprobado | [Totales al final](issue-104-375-totales-final.png), [detalle al inicio](issue-104-375-detalle-inicio.png), [detalle al final](issue-104-375-detalle-final.png). |
| Recorrido automático | `tests/e2e/recorridos-criticos.spec.ts` comprueba para cada tabla, a 375 px, el desplazamiento horizontal local, la última columna visible, la ausencia de celdas truncadas, la alineación y la consola limpia. | Aprobado | `pnpm validate`. |

No encontré fallos funcionales en este alcance. Los lectores de pantalla no se probaron: la comprobación de encabezados (`scope`), título (`caption` y región) y fecha como cabecera de fila se hizo en las pruebas de la ruta, no con tecnología de asistencia real. El primer intento del humo mostró un aviso de hidratación causado por mi propio script, que abrió los `<details>` antes de que React hidratara; con clics reales, tras la hidratación, la consola quedó limpia.
