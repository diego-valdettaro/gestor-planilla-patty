# Reglas de asistencia y planilla separadas del Excel

Estado: aceptada

El aplicativo guarda horarios, marcas, estados e incidencias como datos, y calcula sus resultados con reglas visibles y versionables. No replica las fórmulas ni referencias del Excel histórico, porque mezcla cálculos correctos con celdas manuales, valores fijos y referencias rotas, lo que impide explicar el origen de un importe.

## Consecuencias

- Cada resultado se puede rastrear hasta una asistencia, horario o ajuste.
- Las reglas de penalización por tardanza tienen versión y fecha de vigencia. Un período cerrado conserva la versión usada para calcularlo.
- Las reglas monetarias se activan solo con aprobación de Administración y Finanzas.
- El Excel histórico se usa como contraste durante la transición.
