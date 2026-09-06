# Contrato de diseño

Este documento rige los cambios de interfaz de Planilla Patty. Antes de editar
una ruta, un componente visible o `src/app/global.css`, leerlo junto con
`docs/agents/domain.md` y la issue correspondiente.

## Producto y alcance

Planilla Patty permite administrar colaboradores, sedes y modelos de horario;
planificar y publicar turnos; importar y corregir asistencias; y consultar o
cerrar períodos de planilla. Las rutas actuales son:

- `/iniciar-sesion`
- `/configuracion`
- `/turnos`
- `/asistencias` e `/asistencias/importar`
- `/periodos`

Una tarea de UI no autoriza a crear módulos, rutas, roles, paneles, métricas,
automatizaciones o flujos nuevos. Si el pedido no está en la issue, el PRD o un
ADR, detenerse y pedir o registrar una decisión de producto. No sustituir el
vocabulario del dominio por términos genéricos.

## Fuente de verdad

- La implementación vigente en `src/app/global.css` y los componentes de
  `src/app/` es la fuente de verdad ejecutable.
- `docs/propuesta-visual/` es una maqueta local no versionada. Sirve de
  referencia cuando exista, pero no reemplaza este contrato ni justifica
  cambios de alcance.
- Las decisiones de producto y comportamiento viven en `CONTEXT.md`,
  `docs/adr/` y las issues.

Si una nueva necesidad exige una variante que no está aquí, extender primero el
sistema compartido y documentar la decisión. No resolverla con estilos aislados
en una sola pantalla.

## Identidad visual

La aplicación es clara, sobria y operativa. Prioriza lectura rápida de datos y
acciones administrativas seguras.

- Tipografía: `Inter` con las fuentes del sistema como respaldo.
- Texto principal: azul marino. El verde `#079557` identifica la acción
  primaria y los estados positivos.
- Fondo blanco, superficies blancas y bordes gris azulados suaves.
- Radio pequeño, aproximadamente entre `0.3rem` y `0.7rem`. Sombras discretas,
  solo para separar tarjetas, diálogos y controles flotantes.
- Espaciado en una escala consistente. Reutilizar las clases y valores del CSS
  compartido antes de introducir una medida nueva.
- No añadir modo oscuro, gradientes decorativos, paletas alternativas,
  ilustraciones o una biblioteca de iconos sin una decisión de producto.

## Patrones obligatorios

### Estructura

- Las vistas autenticadas usan la navegación lateral existente y el contenedor
  `.contenido`. La pantalla de inicio de sesión usa el patrón centrado.
- Agrupar contenido en tarjetas para formularios, colecciones y secciones de
  trabajo. No envolver cada fragmento pequeño en una tarjeta.
- Formularios con `label` visible, controles nativos cuando basten y mensajes
  de ayuda cerca del campo.
- Tablas para datos comparables en filas. Las cifras se alinean a la derecha
  cuando ayude a compararlas. En pantallas estrechas, permitir desplazamiento
  horizontal antes que truncar datos importantes.

### Acciones y estados

- Usar `boton-principal` para la única acción que avanza el trabajo, y
  `boton-secundario` para acciones alternativas, cancelar o navegar. Reservar
  `peligro` para eliminar u otra acción destructiva.
- Una acción irreversible, que publique, cierre un período o modifique datos
  ya confirmados requiere un diálogo que explique consecuencia, alcance y
  cancelación.
- Un control no disponible se deshabilita y la interfaz explica qué falta para
  habilitarlo cuando no sea evidente.
- Reutilizar insignias y clases de estado existentes. No depender solo del
  color para comunicar borrador, publicado, procesado, error o éxito.
- Usar `.estado-vacio` para ausencia de datos o permisos. Debe decir qué falta
  y, si existe, la siguiente acción permitida.
- Los mensajes de operación usan los patrones de éxito o error existentes y
  anuncian errores mediante `role="alert"` cuando corresponde.

### Accesibilidad

- Todo control interactivo debe ser operable con teclado y tener nombre
  accesible. Preferir `button`, `a`, `input` y `select` nativos.
- Mantener el foco visible definido en `global.css`. No eliminar `outline`.
- Asociar cada diálogo a un título y devolver el foco de forma natural al
  cerrarlo.
- No usar emoji o caracteres decorativos como único icono o única etiqueta de
  una acción.

## Límites de implementación

- No añadir valores de color, tamaños, radios o sombras arbitrarios si ya hay
  un valor equivalente en el sistema compartido.
- No duplicar un botón, diálogo, estado vacío o mensaje de operación para una
  sola ruta si el patrón existente se puede reutilizar o generalizar.
- Mantener estilos compartidos en `src/app/global.css`. Los estilos de una
  pantalla deben llevar un prefijo de componente o ruta para evitar colisiones.
- Tratar `src/app/global.css`, navegación y rutas como áreas compartidas. No
  editarlas en paralelo con otra tarea sin coordinarlo.

## Checklist de una tarea visual

1. Confirmar que la issue autoriza el comportamiento y la ruta.
2. Reutilizar un patrón existente o documentar la nueva variante.
3. Comprobar estados normal, foco, deshabilitado, vacío, éxito y error que
   apliquen.
4. Revisar la vista en navegador, incluido un ancho estrecho si cambia la
   estructura o una tabla.
5. Ejecutar la validación indicada en `AGENTS.md` antes de entregar o cometer.
