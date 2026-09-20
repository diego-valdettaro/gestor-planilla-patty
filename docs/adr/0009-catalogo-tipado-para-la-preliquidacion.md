# Catálogo tipado para la preliquidación

Estado: aceptada

La preliquidación se compone solo de conceptos catalogados como ingreso remunerativo, ingreso no remunerativo, reducción de remuneración devengada, deducción del trabajador o aporte del empleador. Cada concepto define de antemano su efecto sobre el neto y las bases legales. Finanzas confirma las fuentes externas incluso cuando no reportan importe, y no sobrescribe líneas calculadas: corrige la fuente o registra un ajuste trazable.

## Consecuencias

- Una preliquidación con datos faltantes o un caso no soportado no se puede finalizar.
- Finanzas confirma cada tipo de fuente externa para el mes completo y declara que su listado cubre a la población aplicable. Solo entonces la ausencia de una fila individual equivale a cero; antes es dato pendiente. Una fuente sin importes también exige confirmación expresa.
- EsSalud se muestra como aporte patronal y no reduce el neto.
- La ejecución bancaria, PLAME, las provisiones contables y los asientos quedan fuera del módulo.
- El catálogo inicial incluye sueldo básico, remuneración vacacional, asignación familiar cuando corresponda, horas extra 25 % y 35 %, trabajo en descanso o feriado sin sustitución, comisión de ventas, movilidad supeditada a asistencia, reducciones por falta, descanso semanal, tardanza real y ausencia sin goce, aportes pensionarios, retención externa de quinta categoría, incidencias, adelantos, cuotas de préstamo, ajustes y EsSalud patronal.
- La aplicación calcula la base de quinta categoría, pero Finanzas confirma o importa la retención calculada fuera del módulo. Cada concepto conserva su código y afectaciones compatibles con PLAME, sin generar aún una declaración.
- Una incidencia de tienda no se convierte en deducción hasta que Finanzas registre el sustento y la autorización correspondiente. Finanzas puede confirmar que no se descontará en este pago; la investigación continúa fuera del neto sin bloquear al resto del personal. Un neto negativo bloquea la finalización; el sistema no arrastra automáticamente deducciones.
- El trabajo en feriado o descanso se valora desde el calendario, el descanso semanal asignado, la jornada confirmada y el descanso sustitutorio, no desde un multiplicador tecleado. Un descanso sustitutorio previsto evita el adicional provisional; si no llega a otorgarse, se corrige en el pago siguiente. El 1 de mayo se trata como caso especial.
- Las marcas fuera de la jornada generan candidatas de horas extra, no pago automático. Finanzas solo puede descartarlas con evidencia de error o ausencia de trabajo efectivo y motivo registrado; el trabajo acreditado no se rechaza por falta de autorización previa. La empresa paga siempre el sobretiempo acreditado, sin flujo de descanso compensatorio.
- La operación actual no tiene trabajo nocturno. El primer incremento no lo calcula: si aparece un tramo entre las 22:00 y las 06:00, bloquea la finalización hasta contar con reglas y validación específicas.
- Finanzas carga y concilia la gratificación legal y su bonificación extraordinaria calculadas externamente, sin confundirlas con provisiones contables ni pagarlas dos veces. El cálculo automático de esos beneficios queda para otra fase.
- La liquidación por cese se calcula y paga fuera de este módulo. Sus conceptos y abonos se concilian aquí para impedir duplicaciones; un cese sin conciliación bloquea la finalización mensual.
