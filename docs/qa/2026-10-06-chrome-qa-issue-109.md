# QA en navegador: relaciones laborales (#109)

## Contexto y alcance

- Fecha: 2026-10-06. Rama `agent/issue-109-relaciones-laborales` sobre `origin/master` (3ffbb79).
- Entorno: `pnpm revisar` (PostgreSQL desechable `planilla_rev_109`, `next dev` en `http://localhost:3109`, seed de demo). Se limpió con `pnpm revisar:limpiar`.
- Roles: `rrhh`, `finanzas`, `gerente-tiendas` (cuentas del seed).
- Tamaños: 1280 × 900 y 375 × 812.
- Herramienta: Playwright (Chromium) con un script ad hoc; no había herramientas `chrome_devtools` en la sesión. Se observaron consola, errores de página y respuestas HTTP ≥ 400 de cada sesión.
- Alcance: QA básico de las rutas que toca el diff, `/relaciones-laborales` y `/turnos`, con el recorrido corto de cada criterio de aceptación.

## Cobertura

| Caso | Flujo y rol | Comprobación final | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| 1 | Recursos Humanos entra a la aplicación | Aterriza en `/relaciones-laborales`; su menú solo tiene «Relaciones laborales» | aprobado | `issue-109-relaciones-rrhh-1280.png` |
| 2 | RRHH, formulario «Registrar ingreso» | No ofrece a quien tiene una relación sin cese (incluido Luis) | aprobado | misma captura |
| 3 | RRHH registra el cese de una persona y lo confirma | Queda «Por confirmar», luego «Sin acciones pendientes» y persiste tras recargar | aprobado | `issue-109-relaciones-rrhh-dialogo-cese-1280.png` |
| 4 | RRHH registra un reingreso de la misma persona | Aparecen 2 filas con el mismo DNI y el mensaje de éxito | aprobado | script |
| 5 | RRHH corrige un ingreso a una fecha que se solapa | Error con `role="alert"` junto al campo («Las fechas se solapan…») | aprobado | script |
| 6 | Consulta de vigencia por fecha y por rango | Lista personas; en el rango Karen aparece en una sola fila; fecha inválida muestra alerta | aprobado | `issue-109-relaciones-consulta-error-1280.png` |
| 7 | Finanzas en `/relaciones-laborales` | Consulta sin formulario ni acciones | aprobado | `issue-109-relaciones-finanzas-1280.png` |
| 8 | Gerente de área en `/relaciones-laborales` | «Sin permiso» y el menú no la muestra | aprobado | `issue-109-relaciones-gerente-sin-permiso-1280.png` |
| 9 | Gerente en Horarios: Luis (ingreso sin confirmar) | Aviso con causa y siguiente paso, sin casilla de publicar y 7 celdas «Sin relación laboral» | aprobado | `issue-109-turnos-gerente-1280.png` |
| 10 | Gerente en Horarios: Julia (ingreso a mitad de semana) | Lun y mar «Sin relación laboral» fijas; «Completar semana» bloquea esos 2 días; se publica; queda «Publicado» y persiste | aprobado | `issue-109-turnos-completar-semana-julia-1280.png`, `issue-109-turnos-julia-publicada-1280.png` |
| 11 | Gerente en Horarios: Karen (reingreso el martes) | Solo el lunes «Sin relación laboral» | aprobado | `issue-109-turnos-gerente-1280.png` |
| 12 | `/relaciones-laborales` y `/turnos` a 375 px | Sin desborde horizontal de la página; las tablas se desplazan dentro de su región | aprobado | `issue-109-relaciones-rrhh-375.png`, `issue-109-turnos-gerente-375.png` |
| 13 | Consola y red de todas las sesiones | Sin errores de consola ni respuestas ≥ 400 | aprobado | script (32 de 32 comprobaciones) |

## Hallazgos (corregidos en la rama)

### H1. Tras guardar una fecha el panel «Corregir/Registrar» queda abierto y tapa el botón vecino (media, P2)

- Pasos: como RRHH, en la fila de una persona usar «Registrar cese», guardar la fecha y pulsar «Confirmar cese».
- Esperado: el botón «Confirmar cese» es alcanzable.
- Observado: el `<details>` seguía abierto y «Guardar fecha» interceptaba el clic (Playwright: «subtree intercepts pointer events»). Reproducido en 3 ejecuciones.
- Causa confirmada: el componente se mantenía montado y su `<details>` conservaba el atributo `open` tras el éxito.
- Corrección: `FormularioDeFecha` cierra el panel cuando la acción devuelve éxito (`src/app/relaciones-laborales/formularios.tsx`).

### H2. Al registrar el último reingreso posible desaparece el mensaje de éxito (baja, P3)

- Pasos: con todos los colaboradores con relación sin cese salvo uno, registrar su ingreso.
- Esperado: el mensaje «El ingreso quedó registrado. Falta confirmarlo.» se mantiene.
- Observado: la página sustituía el formulario por el estado vacío y el mensaje se perdía, aunque la relación sí se creaba.
- Corrección: el formulario permanece montado (con el botón deshabilitado si no hay candidatos) y el estado vacío se muestra debajo (`page.tsx`).

## Observación descartada

Las primeras ejecuciones mostraron «A tree hydrated but some attributes of the server rendered HTML didn't match…». El detalle del mensaje mostraba solo `style="caret-color:transparent"` añadido a los `input`: es la captura de pantalla de Playwright, que oculta el cursor antes de que React termine de hidratar. No es un defecto de la app: con las capturas tomadas tras `networkidle` y `caret: "initial"` la consola quedó limpia.

## Pendientes y limitaciones

- No se probó con lector de pantalla; el teclado se cubre en las pruebas e2e de Playwright del repositorio.
- La prueba mutó solo la base desechable de revisión, ya eliminada. No quedaron datos de prueba.
- Una confirmación de ingreso o cese no se puede revertir en este incremento (decisión registrada en la enmienda del ADR 0012).
