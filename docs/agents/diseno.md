# Contrato visual de Planilla Patty

La issue y los ADR definen qué se construye; este contrato define cómo se presenta. No autoriza rutas, roles, flujos ni capacidades nuevas. Conserva el vocabulario del dominio y usa la interfaz actual como referencia para los patrones existentes.

## Identidad visual

Mantener la tipografía Inter con respaldo del sistema y la paleta de `src/app/global.css`: fondo blanco, texto azul marino y verde para la acción principal y los estados positivos. Reutilizar sus espaciados, bordes y sombras discretas. Son el punto de partida para nuevas vistas; la auditoría de la interfaz puede justificar un ajuste compartido.

## Estructura

En escritorio, las vistas autenticadas usan navegación lateral y dejan el contenido en `.contenido`. Hasta 900 px, la navegación pasa a una barra superior con el nombre de la sección y un botón de menú; el contenido recibe el ancho disponible. El menú muestra las rutas permitidas y el acceso a cerrar sesión. La pantalla de inicio de sesión conserva su composición centrada.

## Jerarquía y datos

En una vista de revisión, mostrar primero qué objeto se revisa y su estado. Después, criterios de consulta, resumen con totales y bloqueos, y detalle por colaborador. Rotular el alcance de cada cifra: en `/periodos`, «Totales del período completo» indica que el total incluye a todos los colaboradores aunque el filtro muestre solo a Beto.

Usar tablas para registros comparables. Cada columna lleva encabezado y las magnitudes indican su unidad, como `45 min` o `S/ 120,00`. Alinear las cifras a la derecha para poder compararlas por columna. Si la tabla no cabe, permitir desplazamiento horizontal dentro de ella sin estrechar el resto de la vista.

## Patrones compartidos

Usar `.panel` para formularios o resultados, `.panel-filtros` para criterios de consulta y `.panel-tabla` para registros comparables. Los controles tienen etiquetas visibles; preferir `input`, `select` y `button` nativos. Si estos patrones no cubren una necesidad, explicar por qué y añadir la variante al estilo compartido.

## Acciones y estados

Dar a cada contexto una sola acción principal con `.boton-principal`; usar `.boton-secundario` para alternativas y `.peligro` para acciones destructivas. En listas de configuración, mostrar una acción discreta «Editar» por fila y reunir allí cambios poco frecuentes, como desactivar o eliminar. Separar las acciones destructivas de las ordinarias y confirmar su alcance y consecuencia. Las acciones operativas frecuentes, como revisar una asistencia pendiente, pueden estar visibles donde se usan.

Expresar cada estado con texto además de color. Un bloqueo indica la causa y el siguiente paso permitido. Usar `.estado-vacio` para explicar qué falta cuando no hay datos. Los errores y éxitos usan los mensajes compartidos y se sitúan cerca de la acción que los produjo.

## Teclado y errores

Todo control tiene un nombre claro, funciona con teclado y conserva el foco visible. Los diálogos tienen título, ofrecen Cancelar y Confirmar, y devuelven el foco al control que los abrió. Mostrar los errores junto al campo o la acción correspondiente y anunciarlos con `role="alert"` cuando aparezcan.

## Evolución del contrato

Cambiar este contrato cuando la auditoría de una vista existente o una necesidad aprobada revele un patrón reutilizable. Explicar la razón y las vistas a las que aplica. Registrar las discrepancias con el código en la issue o el PR que las resolverá; no convertir una excepción local en patrón general. Las comprobaciones de cada ticket pertenecen a `docs/agents/agent-workflow.md`.
