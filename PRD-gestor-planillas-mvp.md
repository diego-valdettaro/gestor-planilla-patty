# PRD: Gestor de asistencia y planillas Patty

Estado: borrador v0.1

## Problema

La asistencia se exporta desde el huellero y luego se copia manualmente a la planilla mensual. El proceso mezcla marcas, correcciones, horarios, horas extra y cálculos de pago en un mismo Excel. Es difícil auditar qué se cambió y por qué.

## Objetivo del MVP

Centralizar el horario semanal, importar asistencia desde el huellero, revisar incidencias y calcular horas trabajadas, tardanzas y horas extra. El sistema debe exportar un resumen que Administración y Finanzas pueda contrastar con la planilla Excel actual.

No calcula importes oficiales de faltas, vacaciones, feriados, descansos ni permisos.

## Usuarios y permisos

| Rol | Puede hacer |
| --- | --- |
| Líder de operaciones | Crear, editar y publicar horarios semanales. |
| Administración y Finanzas | Importar huellero, corregir asistencia, registrar incidencias, aprobar horas extra, cerrar o reabrir períodos, revisar resúmenes y exportar. |

## Flujo principal

1. Operaciones crea un único horario semanal por persona y fecha, con entrada, salida y minutos de almuerzo informativos.
2. Operaciones publica el horario.
3. El sistema crea una asistencia esperada pendiente para cada turno publicado dentro del período de planilla abierto.
4. Administración usa "Cargar asistencia" para importar los archivos XLS del huellero necesarios al período de planilla abierto.
5. El sistema ubica cada registro por colaborador y fecha dentro del período abierto y propone la primera marca como entrada y la última como salida.
6. Administración confirma o corrige manualmente la asistencia diaria y selecciona el estado de la jornada.
7. El sistema calcula horas, tardanzas y horas extra pendientes de aprobación.
8. Finanzas aprueba o rechaza las horas extra pendientes.
9. Finanzas consulta y exporta el resumen del período.

## Reglas aprobadas

- La primera marca es la hora de entrada.
- La última marca es la hora de salida.
- El MVP admite un único turno publicado por persona y fecha.
- El almuerzo es informativo en esta etapa y no se descuenta del cálculo de horas trabajadas.
- Hay tardanza cuando la entrada real supera en más de 10 minutos a la entrada programada.
- Administración y Finanzas configura por sede la política que convierte tardanzas acumuladas en horas penalizadas, con versión y fecha de vigencia. La sede aplicable es la del turno publicado. Puede definir minutos de tolerancia, cantidad de tardanzas acumuladas y horas penalizadas. El valor inicial es: más de 10 minutos, cada 3 tardanzas, 1 hora penalizada. Los períodos cerrados conservan la regla con que se calcularon. En este MVP se mostrará el saldo en horas, sin monto monetario.
- Cada período de planilla comprende desde el día 26 de un mes hasta el día 25 del siguiente, ambos inclusive.
- Horas extra redondeadas por día: 0 a 20 minutos = 0; 21 a 50 = 0.5; 51 a 80 = 1; 81 a 110 = 1.5. El patrón continúa por bloques de 30 minutos.
- Las tardanzas y las horas extra se calculan por separado y no se compensan entre sí. Las horas extra se calculan contra la salida del turno publicado. Las primeras 2 horas extra diarias van al tramo 25%; el resto va al tramo 35%.
- Toda hora extra calculada queda pendiente hasta que Finanzas la apruebe o rechace. Solo las aprobadas aparecen en la exportación del período.
- Administración y Finanzas puede aprobar horas extra que haya corregido, pero el sistema conserva por separado quién corrigió y quién aprobó.
- Un ajuste de asistencia recalcula los resultados y devuelve las horas extra previamente aprobadas al estado pendiente de aprobación.
- Falta, descanso, feriado, vacaciones, permiso y suspensión son estados manuales que deben guardar comentario y responsable.
- Un estado manual tiene prioridad sobre las marcas del huellero para el cálculo. Las marcas se conservan para auditoría, pero no generan tardanza ni horas extra mientras ese estado siga vigente.
- Un día sin marcas, con una sola marca o con una cantidad impar de marcas queda pendiente de revisión; nunca se marca como falta automáticamente.
- Al confirmar una asistencia, el sistema conserva una instantánea del turno publicado usado para calcularla. Cambios posteriores del horario no alteran asistencias ya confirmadas.
- En un período abierto, una nueva importación puede actualizar la propuesta de una asistencia pendiente para el mismo colaborador y fecha. El sistema conserva las marcas y las importaciones originales. Una asistencia confirmada solo cambia mediante un ajuste manual.
- Un ID de huellero desconocido genera una incidencia de importación; el sistema no crea colaboradores automáticamente.
- Una marca sin turno publicado se conserva como asistencia pendiente de revisión y no genera tardanza ni horas extra hasta resolver el turno.
- Una salida anterior a la hora programada muestra las horas reales trabajadas, pero no genera incidencia ni penalización automática en el MVP.

## Pantallas

### Horarios semanales

- Selector de semana y sede.
- Grilla de personas por día.
- Turno: entrada, salida, almuerzo, descanso y estado de publicación.
- Publicar horario y mantener historial de la versión publicada.

### Cargar y revisar asistencia

- Botón "Cargar asistencia" para importar archivos semanales del XLS del huellero por sede al período de planilla abierto.
- Lista de incidencias de importación para IDs de huellero sin colaborador registrado.
- Vista por persona y fecha: turno publicado, marcas crudas, entrada propuesta, salida propuesta, estado, comentario y responsable.
- Estado de revisión: pendiente, asistencia confirmada o estado manual. El desplegable de estado manual incluye falta, descanso, feriado, vacaciones, permiso y suspensión. La tardanza se calcula automáticamente; un ajuste de asistencia exige motivo y responsable.
- Advertencias para días sin marcas, una sola marca o marcas impares.

### Resumen del período

- Horas trabajadas, tardanzas, horas extra 25%, horas extra 35% y horas de descuento por tardanzas.
- Filtros por periodo, sede y persona.
- Exportación XLSX limpia por colaborador y período, con horas trabajadas, tardanzas, saldo penalizado, extras aprobadas 25% y 35%, y datos de auditoría. Se usa para contrastar con el Excel actual, sin replicar sus fórmulas.

## Datos principales

- Colaborador: ID de huellero, nombre, sede, centro de costo y estado activo.
- Turno semanal: persona, fecha, entrada programada, salida programada, minutos de almuerzo y publicación.
- Importación semanal por sede: archivo fuente, semana, sede, fecha de carga, usuario y marcas crudas.
- Asistencia diaria: persona, fecha, entrada/salida propuestas, entrada/salida confirmadas, estado, comentario y auditoría.
- Cálculo diario: minutos trabajados, minutos de tardanza, extras 25% y extras 35%, con estado de aprobación.
- Período de planilla: fechas de inicio y corte, estado abierto o cerrado, usuario y fecha de cierre; la reapertura exige usuario, fecha y motivo.

## Criterios de aceptación

- Una importación crea o actualiza propuestas de asistencia sin borrar correcciones confirmadas.
- Cada turno publicado crea una asistencia esperada pendiente, incluso si el huellero no contiene marcas para esa persona y fecha.
- Un ID de huellero desconocido queda visible como incidencia y no crea un colaborador.
- Una marca sin turno publicado queda pendiente de revisión sin cálculo de tardanza ni extras.
- Toda corrección conserva la marca original, el usuario, fecha y comentario.
- La grilla muestra el turno publicado junto a las marcas reales.
- El cálculo de extras aplica los bloques y tramos definidos.
- Un ajuste de asistencia devuelve sus horas extra aprobadas a pendiente de aprobación.
- El resumen del período puede exportarse a Excel.
- Administración y Finanzas puede cerrar un período de planilla. Solo ese rol puede reabrirlo, dejando motivo y auditoría.
- El sistema bloquea el cierre mientras exista una asistencia pendiente de revisión o sin confirmación manual.

## Base técnica del MVP

- La aplicación será un monolito web en TypeScript. Usará Next.js para la interfaz y los casos de uso del servidor, PostgreSQL como base de datos y Drizzle para esquema y migraciones.
- La aplicación no expondrá una API pública en el MVP. Las pantallas usarán casos de uso del servidor. Las rutas HTTP solo se crearán si hacen falta para una integración concreta.
- El sistema tendrá cuentas locales con contraseña protegida mediante Argon2id. Cada cuenta tendrá un único rol: Líder de Operaciones, Administración o Finanzas. La autorización se valida en el servidor en cada caso de uso, no solo en la interfaz.
- Los datos que explican un resultado se guardan de forma relacional y con auditoría: usuario responsable, fecha y hora, motivo cuando corresponda, y referencia al registro de origen. Las marcas crudas no se modifican ni se eliminan como consecuencia de una corrección.
- Los XLS importados se conservarán fuera del directorio público de la aplicación, junto con su hash SHA-256. En producción se usará almacenamiento de objetos compatible con S3; en desarrollo, un volumen local persistente.
- El sistema se ejecutará en un contenedor Docker y usará una instancia PostgreSQL administrada o un contenedor PostgreSQL con volumen persistente. Las copias de seguridad de base de datos y archivos fuente son obligatorias antes de abrir el uso operativo.
- Las pruebas de aceptación ejecutarán los casos de uso, no componentes internos. Las reglas de cálculo tendrán pruebas unitarias de bordes, y las operaciones que escriben datos tendrán pruebas de integración contra PostgreSQL.
- La aplicación registrará errores de servidor con el identificador de la solicitud y, cuando exista, del usuario. No se registrarán contraseñas, archivos XLS completos ni marcas crudas en texto de logs.

## Restricciones técnicas

- Zona horaria de operación: `America/Lima`. Las fechas de asistencia se almacenan como fechas locales; las marcas y auditorías incluyen zona horaria.
- El MVP solo atiende una organización. No habrá multiempresa ni API para terceros.
- Los navegadores objetivo son las versiones actuales de Chrome, Edge y Firefox en escritorio. La revisión de asistencia requiere una pantalla de al menos 1024 px de ancho.
- Las migraciones de esquema se ejecutan antes de desplegar una versión de la aplicación. No se modifica la estructura de producción desde una consola manual.

## Fuera de alcance y bloqueadores

- Monto de faltas, vacaciones, feriados, descansos, permisos y suspensiones.
- Cálculo oficial de remuneraciones, AFP/SNP, CTS, EsSalud, banco y PLAME.
- Regla de redondeo de descuentos monetarios.
- Turnos que cruzan medianoche.

Estos puntos bloquean el módulo de pago, pero no horarios, asistencia ni resumen de horas.
