# Humo de #31

Fecha: 2026-09-07

Entorno: `pnpm revisar`, rama `agent/issue-31-importar-csv-filtros`, base desechable `planilla_rev_31`, `http://localhost:3031`.

## Casos ejecutados

| Ruta | Rol | Resultado | Evidencia |
| --- | --- | --- | --- |
| `/asistencias` | Administración | Aprobado. Muestra "Importar archivo", no muestra la tarjeta "Importar marcas" y no registra errores nuevos en consola. | `evidence-issue31/asistencias.png` |
| `/asistencias` → `/asistencias/importar` | Administración | Aprobado. El enlace secundario se encontró, respondió al clic y terminó en `/asistencias/importar` sin errores de consola. | `evidence-issue31/importar.png` |
| `/asistencias/importar` | Administración | Aprobado. Muestra el formulario existente, incluido "Archivo del huellero", sin errores nuevos en consola. | `evidence-issue31/importar.png` |

La sesión se creó solo en la base de revisión y se usó la cuenta `admin` del seed. No se importaron archivos ni se modificaron asistencias.
