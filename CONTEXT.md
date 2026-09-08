# Gestor de asistencia y planillas Patty

Lenguaje compartido para registrar y revisar la asistencia antes de calcular pagos.

## Asistencia

**Marca cruda**:
Registro original importado desde el huellero.
_Evitar_: marca editada, registro corregido

**Horario semanal**:
Programación de una semana específica para un colaborador. Cada día fija sede, entrada y salida programadas.
_Evitar_: turno, horario tentativo, horario vigente

**Asistencia confirmada**:
Registro diario revisado que conserva las propuestas basadas en marcas crudas y cualquier corrección aplicada.
_Evitar_: asistencia editada, marca final

**Asistencia pendiente de revisión**:
Registro diario cuya evidencia de marcas es insuficiente o inconsistente y que todavía no permite confirmar una asistencia ni una ausencia.
_Evitar_: falta automática, ausencia inferida

**Asistencia esperada**:
Registro diario creado a partir de un horario semanal, aun cuando todavía no exista ninguna marca del huellero.
_Evitar_: fila creada por importación, ausencia automática

**Instantánea de horario**:
Copia del horario semanal que se aplicó al confirmar una asistencia diaria.
_Evitar_: horario actual, turno recalculado

**Ajuste de asistencia**:
Corrección manual de una asistencia confirmada, con motivo y responsable.
_Evitar_: tardanza manual, corrección sin motivo

**Tardanza**:
Incidencia calculada cuando la entrada real supera en más de 10 minutos la entrada programada del turno publicado.
_Evitar_: estado de tardanza, tardanza manual

**Hora extra**:
Tiempo trabajado después de la salida programada del turno publicado, redondeado según la regla vigente.
_Evitar_: saldo de jornada, compensación de tardanza

**Hora extra pendiente**:
Hora extra calculada que todavía no ha sido aprobada por Finanzas para el resumen del período.
_Evitar_: hora extra autorizada, pago de extra

**Hora extra aprobada**:
Hora extra pendiente aceptada por Finanzas para su exportación en el resumen del período.
_Evitar_: hora marcada, pago oficial

**Exportación del período**:
Archivo XLSX limpio con los totales calculados y la información de auditoría del período de planilla.
_Evitar_: copia de fórmulas del Excel histórico, planilla oficial de pagos

**Política de penalización por tardanzas**:
Regla configurable por Administración y Finanzas para cada sede que convierte tardanzas acumuladas en horas penalizadas desde una fecha de vigencia.
_Evitar_: descuento fijo por tardanza, regla retroactiva

**Importación semanal por sede**:
Archivo fuente del huellero que contiene las marcas de una semana para una sede.
_Evitar_: carga acumulativa, marcas duplicadas

**Incidencia de importación**:
Registro del archivo fuente que no puede asociarse de forma segura a una asistencia, por ejemplo un ID de huellero desconocido.
_Evitar_: colaborador creado por importación, fila descartada

**Estado manual**:
Clasificación explícita de una jornada como falta, descanso, feriado, vacaciones, permiso o suspensión.
_Evitar_: tardanza, asistencia

**Período de planilla**:
Conjunto de asistencias desde el día 26 hasta el día 25 siguiente que se revisa y confirma antes de producir un resumen para la planilla.
_Evitar_: mes calendario, registro mensual

**Período cerrado**:
Período de planilla cuyo resumen y reglas aplicadas quedaron fijados para auditoría; solo Administración y Finanzas puede reabrirlo dejando un motivo.
_Evitar_: mes bloqueado, período definitivo sin trazabilidad

## Estados de celda del calendario de asistencias

El calendario mensual de `/asistencias` deriva por día uno de cinco estados a partir de datos existentes. No son valores del enum `asistencias_esperadas.estado`, que sigue siendo `pendiente` / `confirmada` / `manual`.

**Sin planificación**:
No hay horario publicado para ese día, así que no hay nada que registrar.
_Evitar_: sin programación, día vacío

**Esperada**:
Hay horario publicado, la asistencia sigue pendiente y no hay marcas del huellero para ese día. Comunica "falta llenar esto"; no importa si el día ya pasó.
_Evitar_: pendiente, sin confirmar

**Pendiente de revisión**:
Hay marcas del huellero pero no permiten proponer una entrada y salida completas, y alguien debe revisarlas antes de registrar la jornada.
_Evitar_: falta automática, marcas incompletas

**Registrada**:
El día quedó resuelto: asistencia confirmada con entrada y salida reales, o una designación manual (falta, descanso, feriado, vacaciones, permiso, suspensión), que se muestra como etiqueta de la celda. Es el nombre visible de la "asistencia confirmada" y del "estado manual" en esta pantalla.
_Evitar_: confirmada, cerrada

**Liquidado**:
La asistencia cae en un período de planilla cerrado y quedó congelada; la celda no es editable.
_Evitar_: bloqueada, procesada
