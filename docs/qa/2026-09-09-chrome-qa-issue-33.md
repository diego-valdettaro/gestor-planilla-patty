# Humo de #33

Fecha: 2026-09-09

Entorno: `pnpm revisar`, rama `agent/issue-33-liquidaciones-patron`, base desechable `planilla_rev_33`, `http://localhost:3033`. Conducción por CDP (Chrome headless). Cuenta `admin` del seed. No se cerró ni reabrió ningún período ni se exportó ningún archivo; solo navegación y filtros GET.

## Casos ejecutados

| Ruta | Rol | Resultado | Evidencia |
| --- | --- | --- | --- |
| `/periodos` (período abierto) | Administración | Aprobado. Carga sin error. Encabezado `encabezado encabezado-pagina` con eyebrow "Administración y Finanzas", `h1` "Liquidaciones" (ya no "Resumen del período") y descripción. Filtros en `form.filtros.panel-filtros.periodos-filtros` con `method="get"`, fondo `rgb(248,250,252)` y `display:grid` (mismo tratamiento que Configuración), botón "Filtrar" y enlace "Exportar XLSX" → `/api/periodos/<id>/exportar?sede=&idHuellero=`. Insignia `insignia ok` "Abierto" y botón "Cerrar período". Tabla de resumen con tratamiento de panel. Consola y red sin errores. | `evidencia-issue33/periodos-abierto.png` |
| `/periodos` → filtrar al período cerrado | Administración | Aprobado. Al elegir el período cerrado y pulsar "Filtrar" la URL pasa a `?periodoId=…&sede=&idHuellero=` (confirma `method=get`). Insignia `insignia neutro` "Cerrado" y formulario "Motivo de reapertura" con botón "Reabrir período". Tabla con 1 fila. Sin errores nuevos. | `evidencia-issue33/periodos-cerrado.png` |
| `/periodos` → filtro sin coincidencias | Administración | Aprobado. Con sede + colaborador que no cuadran, aparece `.estado-vacio` "Sin resultados — No hay asistencias que coincidan con los filtros elegidos". Sin errores. | `evidencia-issue33/periodos-sin-resultados.png` |
| `/configuracion` (regresión por renombrado de clases) | Administración | Aprobado. `h1` "Configuración" a 40.8px (encabezado grande intacto), `header.encabezado.encabezado-pagina`, 4 tarjetas `.tarjeta.panel` ("Modelos de horario", "Sedes", "Política de penalización por tardanzas", "Colaboradores"), filtros `.panel-filtros` en grid con fondo, tabla de colaboradores `.panel-tabla` con borde, filtro de Grupo presente. Consola y red sin errores. | `evidencia-issue33/configuracion.png` |

## Consola / red

Sin errores de consola ni peticiones fallidas (>=400) en ninguna de las rutas probadas.

## Cobertura no ejecutada

- Descarga real del XLSX (solo se verificó el `href`, según alcance).
- Ejecutar el cierre o la reapertura de un período (acciones destructivas; fuera del humo).
- Anchos móviles: no se probaron; el diff mantiene las media queries equivalentes a las de Configuración.
