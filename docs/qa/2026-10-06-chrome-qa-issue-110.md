# QA en navegador del issue #110

Humo funcional con Playwright (Chromium) contra `pnpm revisar` (base `planilla_rev_110`, seed de revisión), a 1280 px y, para el gerente, a 375 px. Cada cuenta usa su propio nombre como clave. Rutas: `/turnos`, `/asistencias`, `/asistencias/importar` y `/configuracion`.

## Quién ve qué

| Cuenta | Horarios | Asistencias | Importar marcas | Configuración |
| --- | --- | --- | --- | --- |
| `gerente-tiendas` (Tiendas y Taller) | Grupos Taller y Tiendas; no ve Administración | Taller y Tiendas, con «Confirmar por rango» | Sí, solo de personas de sus grupos | Personas de Tiendas y Taller; ninguna de Administración |
| `gerente-administracion` (Administración, no gestiona asistencia) | Sin permiso | Sin permiso | Sin permiso | Solo personas de Administración; el grupo del alta queda preseleccionado |
| `gerente-sin-grupos` | Sin permiso | Sin permiso | Sin permiso | Sin permiso |
| `finanzas` | Sin permiso | Solo lectura, sin «Confirmar por rango» | Sí, de cualquier grupo | Sin permiso |
| `rrhh` | Sin permiso | Sin permiso | Sin permiso | Sin permiso |
| `admin` | Todos los grupos | Todos, con «Confirmar por rango» | Sí | Todo |

## Importación acotada por grupo

Archivo con una fila de Beto Publicado (Tiendas), una de Franco Díaz (Taller) y una de Hugo Marín (Administración, grupo que no gestiona asistencia).

- `gerente-tiendas`: la fila de Hugo falla con «El colaborador no pertenece a un grupo que usted gestiona.» y no se guarda nada. La fila de Franco, que sí es de uno de sus grupos, solo falla por falta de horario publicado. [Captura](issue-110/gerente-tiendas-importar-resultado.png).
- `finanzas`, mismo archivo: ninguna fila falla por grupo; solo quedan los errores de horario publicado. [Captura](issue-110/finanzas-importar-resultado.png).
- `gerente-tiendas` con una fila válida de Beto: «Se importaron 1 jornadas. Quedan pendientes de revisión.» [Captura](issue-110/gerente-tiendas-importar-exito.png).

## Resultado

- 26 cargas de página (6 cuentas × 4 rutas, más 2 a 375 px): todas con estado 200, sin errores de render ni desbordamiento horizontal.
- Consola sin errores en tres corridas completas. La primera corrida, con el servidor de desarrollo compilando en frío, registró un error de consola en una de las páginas que no se identificó ni se repitió en las tres corridas siguientes.
- Alta de colaborador: el gerente de un solo grupo (Administración) ve ese grupo preseleccionado; el de varios grupos debe elegir. [Captura](issue-110/gerente-administracion-alta-grupo-preseleccionado.png).

## Capturas

Gerente de Tiendas y Taller: [Horarios](issue-110/gerente-tiendas-turnos.png), [Asistencias](issue-110/gerente-tiendas-asistencias.png), [Configuración](issue-110/gerente-tiendas-configuracion.png), [Horarios 375](issue-110/gerente-tiendas-turnos-375.png), [Asistencias 375](issue-110/gerente-tiendas-asistencias-375.png).
Gerente de Administración: [Configuración](issue-110/gerente-administracion-configuracion.png), [Horarios sin permiso](issue-110/gerente-administracion-turnos.png), [Importar sin permiso](issue-110/gerente-administracion-importar.png).
Otros roles: [gerente sin grupos](issue-110/gerente-sin-grupos-turnos.png), [Finanzas Asistencias](issue-110/finanzas-asistencias.png), [Finanzas Horarios](issue-110/finanzas-turnos.png), [Recursos Humanos importar](issue-110/rrhh-importar.png), [Administrador Horarios](issue-110/admin-turnos.png), [Administrador Configuración](issue-110/admin-configuracion.png).
