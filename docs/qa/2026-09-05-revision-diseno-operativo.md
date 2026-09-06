# Revisión de diseño operativo

Fecha: 2026-09-05. Entorno: `http://localhost:3000`, Chrome en escritorio de 1440 x 900 píxeles.

## Alcance y evidencia

Se inspeccionó la pantalla de inicio de sesión, el intento de acceso inválido y el acceso directo a `/turnos`. El formulario conserva el foco y muestra un mensaje de credenciales no válidas; `/turnos` redirige a inicio de sesión cuando no existe una sesión. La consola de Chrome no registró advertencias ni errores en esos recorridos.

La sesión disponible en el navegador no permitió entrar, por lo que la revisión de las vistas internas parte de su interfaz implementada y de una revisión QA previa del mismo día. No se crearon ni modificaron datos.

## Propuestas listas para ejecutar

| Prioridad | Propuesta | Cambio concreto | Criterio de aceptación |
| --- | --- | --- | --- |
| P1 | Hacer utilizable la navegación en pantallas estrechas | Bajo 700 px, transformar la barra lateral fija en una barra superior compacta o un menú desplegable. Quitar el margen izquierdo fijo del contenido en ese punto. | A 390 px se puede abrir cada sección y leer su contenido sin que la barra lateral oculte la página. |
| P1 | Mostrar la identidad de la sesión real | Sustituir el texto fijo `Usuario Patty` y las iniciales del rol por el nombre o usuario de la persona autenticada, más su rol. | Al iniciar sesión se ve quién está operando y con qué permisos. |
| P1 | Volver explícito el estado de la planificación | Añadir un resumen antes de publicar: celdas asignadas sobre el total, personas con días incompletos y cambios sin publicar. Usar etiquetas visibles para Borrador, Publicado y Procesado. | Publicar queda deshabilitado con turnos sin asignar y la interfaz explica exactamente qué falta. |
| P1 | Sustituir confirmaciones nativas en operaciones con impacto | Para Copiar semana, Publicar planificación, Republicar y eliminar, usar un diálogo propio con consecuencia, alcance y acción primaria clara. En republicación, mantener el campo motivo dentro del diálogo. | Antes de confirmar se informa qué registros se reemplazarán, publicarán o desactivarán. Cancelar no cambia nada. |
| P1 | Separar desactivar de eliminar | En modelos, sedes y colaboradores, presentar una acción reversible de desactivación y reservar Eliminar para un flujo con advertencia. No usar el rótulo ambiguo `Eliminar o desactivar`. | Una persona entiende el efecto de cada acción antes de pulsarla y puede identificar los elementos inactivos. |
| P2 | Aclarar la edición de una celda de horario | Reemplazar el `select` invisible superpuesto por una celda con botón visible, valor actual, icono de edición y menú de opciones. | Cada celda deja claro que es editable, funciona con teclado y el foco es perceptible. |
| P2 | Mejorar la lectura de la grilla semanal | Mantener colaborador y encabezados fijos, añadir una señal de desplazamiento horizontal y una leyenda de colores. Agrupar visualmente por sede si hay más de una. | En una grilla ancha se entiende qué columnas quedan fuera de vista y qué significa cada color. |
| P2 | Dar feedback de importación de asistencias | Junto al archivo, mostrar formato esperado y, tras importar, un resumen con filas importadas, duplicadas y rechazadas; ofrecer descarga del detalle de errores si aplica. | El operador sabe si la importación fue completa y puede corregir el archivo sin investigar la base de datos. |
| P2 | Hacer descubribles los filtros de liquidaciones | Cambiar Sede e ID de huellero de texto libre a selector y búsqueda por nombre. Presentar exportación como botón secundario. | Se puede filtrar por persona o sede sin conocer identificadores internos. |
| P2 | Reducir redundancia en la navegación | El enlace Inicio lleva a Horarios para administración. Eliminarlo si no habrá un panel de inicio o convertirlo en un resumen operativo real. | La navegación no contiene dos destinos que llevan al mismo trabajo. |
| P3 | Unificar estados vacíos y mensajes de permiso | Convertir los textos aislados en paneles breves con título, causa y siguiente acción permitida. | Estados sin equipos, sin períodos y sin permisos explican cómo avanzar o a quién pedir ayuda. |
| P3 | Afinar los controles base | Definir estados `hover`, `focus-visible`, `disabled` y contraste consistente para botones, enlaces y campos. | Todo control navegable por teclado muestra foco y todo botón deshabilitado se distingue sin depender solo del color. |

## Orden sugerido

1. Navegación móvil, identidad de sesión y salvaguardas de publicación o eliminación.
2. Claridad de la grilla semanal e importación de asistencias.
3. Filtros de liquidaciones, estados vacíos y acabado de controles.

## Implementación

El 2026-09-05 se implementaron todas las propuestas salvo la adaptación móvil, que queda fuera del alcance actual. La planificación ahora muestra cobertura, estados y confirmaciones; las importaciones devuelven un resumen; las acciones sensibles muestran un diálogo propio; Liquidaciones usa filtros seleccionables; y la navegación muestra el usuario de la sesión.
