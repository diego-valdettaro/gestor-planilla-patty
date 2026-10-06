# QA funcional del issue #108: roles, cuentas y gerentes por grupo

Fecha: 2026-10-06. Alcance: «QA básico» de cada ruta que toca el cambio, en un entorno de revisión (`pnpm revisar`, PostgreSQL desechable con el seed de demo), con Chromium automatizado por Playwright.

Criterios por ruta: carga sin error de render (HTTP < 400), consola y red sin errores nuevos, sin desborde horizontal de la página, y el recorrido corto del criterio de aceptación.

## Resultado

26 recorridos, 0 fallas, 0 errores de consola o red, 0 desbordes.

| Rol (cuenta) | Ruta | Comprobación | Captura |
| --- | --- | --- | --- |
| Administrador (`admin`) | `/configuracion` | Menú con las 5 secciones; grupos con su atributo de gestión de asistencia; Administración marcado «No gestiona asistencia» | `issue-108/admin-configuracion.png` |
| Administrador | `/cuentas` | Crea cuentas de los 4 roles | `issue-108/admin-cuentas.png` |
| Administrador | `/turnos`, `/asistencias`, `/periodos` | Superusuario temporal: abre todo | `issue-108/admin-turnos.png`, `admin-asistencias.png`, `admin-periodos.png` |
| Finanzas (`finanzas`) | `/cuentas` | Menú Cuentas · Asistencia · Períodos; el selector de rol ofrece solo «Gerente de área» y «Recursos Humanos» | `issue-108/finanzas-cuentas.png` |
| Finanzas | `/asistencias` | Solo lectura: sin «Confirmar por rango», con «Importar archivo» | `issue-108/finanzas-asistencias-solo-lectura.png` |
| Finanzas | `/turnos`, `/configuracion` | «Sin permiso» | `issue-108/finanzas-turnos-sin-permiso.png`, `finanzas-configuracion-sin-permiso.png` |
| Finanzas | `/periodos`, `/asistencias/importar` | Abren | `issue-108/finanzas-periodos.png`, `finanzas-importar.png` |
| Finanzas | `/cuentas` (flujo) | Quita el gerente de Administración y se lo asigna a otra cuenta; crea una cuenta de Recursos Humanos | `issue-108/finanzas-asigna-gerente.png`, `finanzas-crea-cuenta.png` |
| Gerente de Tiendas y Taller (`gerente-tiendas`) | `/configuracion` | Solo modelos y colaboradores de sus grupos; sin «Grupos y sedes» ni política | `issue-108/gerente-tiendas-configuracion.png` |
| Gerente de Tiendas y Taller | `/turnos`, `/asistencias` | Abren, con «Confirmar por rango» | `issue-108/gerente-tiendas-turnos.png`, `gerente-tiendas-asistencias.png` |
| Gerente de Tiendas y Taller | `/cuentas`, `/periodos` | «Sin permiso» | `issue-108/gerente-tiendas-cuentas-sin-permiso.png`, `gerente-tiendas-periodos-sin-permiso.png` |
| Gerente de Administración (`gerente-administracion`) | `/configuracion` | Menú solo Configuración; ve a sus colaboradores y no ve «Modelos de horario» | `issue-108/gerente-administracion-configuracion.png` |
| Gerente de Administración | `/turnos`, `/asistencias` | «Sin permiso» (el grupo no gestiona asistencia) | `issue-108/gerente-administracion-turnos-sin-permiso.png`, `gerente-administracion-asistencias-sin-permiso.png` |
| Gerente sin grupos (`gerente-sin-grupos`) | `/` | «Todavía no tiene grupos asignados», menú vacío | `issue-108/gerente-sin-grupos-inicio.png` |
| Recursos Humanos (`rrhh`) | `/`, `/periodos` | «Sin acciones disponibles todavía»; `/periodos` da «Sin permiso» | `issue-108/rrhh-inicio.png`, `rrhh-periodos-sin-permiso.png` |
| Administrador, 375 px | `/cuentas`, `/configuracion` | Sin desborde de la página; las tablas se desplazan dentro de su panel | `issue-108/admin-cuentas-375.png`, `admin-configuracion-375.png` |

## Notas

- La primera pasada marcó una advertencia de hidratación en `/cuentas` a 375 px. Era un artefacto de la captura de pantalla de Playwright (inyecta `caret-color` en los inputs antes de terminar de hidratar); se repitió con `caret: "initial"` y no reaparece.
- La captura de Configuración mostró que el botón de un grupo que sí gestiona asistencia decía «No gestiona asistencia» y parecía un estado. Se cambió a «Dejar de gestionar asistencia» y se volvió a capturar.
