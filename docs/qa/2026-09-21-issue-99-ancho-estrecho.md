# QA de humo: issue #99, ancho estrecho

Fecha: 2026-09-21. Entorno aislado con `pnpm revisar` (base desechable `planilla_rev_99`, puerto 3099), cuenta `admin` del seed. Automatizado con Playwright (Chromium), anchos 375 px y 1280 px.

## Resultado

| Ruta | Desborde horizontal de la página a 375 px | Desborde a 1280 px |
| --- | --- | --- |
| Inicio de sesión | 0 | 0 |
| Configuración | 0 | 0 |
| Horarios | 0 | 0 |
| Asistencias | 0 | 0 |
| Importación de asistencias | 0 | 0 |
| Períodos | 0 | 0 |

- Errores de consola en el recorrido completo: ninguno, a 375 px y a 1280 px.
- Menú abierto a 375 px: `issue-99-menu-abierto-375.png`. El destino activo se identifica con el texto "(sección actual)" además del color.
- Capturas de cada ruta: `issue-99-<ruta>-375.png` y `issue-99-<ruta>-1280.png`.
- Nota: una primera corrida mostró un aviso de hidratación causado por el estilo `caret-color` que Playwright inyecta al capturar. Se repitió con `caret: "initial"` y la consola quedó limpia.
