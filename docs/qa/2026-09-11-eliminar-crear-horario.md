# QA de eliminación de "Crear horario"

## Contexto y alcance

- Fecha: 2026-09-11.
- Ruta: `/turnos?semana=2026-09-07&equipo=Tiendas`.
- Entorno: `pnpm revisar`, base desechable `planilla_rev_90`, rama luego normalizada como `agent/issue-58-eliminar-crear-horario`.
- Rol: Administración.
- Navegador: Chrome 152 en modo headless con DevTools Protocol.
- Tamaños: escritorio de 1440 × 900 y emulación móvil de 390 × 844.
- Alcance: comprobar que el botón "Crear horario" desapareció y que la cabecera sigue utilizable.

## Cobertura

| Caso | Flujo y rol | Comprobación final | Estado | Evidencia o bloqueo |
| --- | --- | --- | --- | --- |
| Cabecera de Horarios en escritorio | Administración abre la semana demo de Tiendas | La página muestra "Planificación de horarios", no contiene enlaces ni botones llamados "Crear horario" y no desborda horizontalmente | aprobado | [Captura de escritorio](evidencia-eliminar-crear-horario-desktop.png) |
| Cabecera de Horarios en móvil | Administración abre la misma semana con emulación móvil | El botón no aparece y los controles restantes conservan su disposición; la tabla mantiene su desplazamiento horizontal previsto | aprobado | [Captura móvil](evidencia-eliminar-crear-horario-mobile.png) |
| Errores del navegador | Carga de ambos tamaños | Sin errores de consola ni excepciones de ejecución | aprobado | Registro de DevTools Protocol durante el recorrido |

## Hallazgos

No se encontraron fallos dentro del alcance.

## Pendientes y siguiente acción

No hay casos bloqueados. Se creó una sesión temporal en la base de revisión; `pnpm revisar:limpiar` elimina toda la base y la sesión.
