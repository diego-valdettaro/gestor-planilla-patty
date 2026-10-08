# Gestor de asistencia y planillas Patty

Lenguaje compartido para registrar asistencia y preparar preliquidaciones auditables.

## Asistencia

**Sede**:
Unidad operativa donde se planifica una jornada y que también identifica su imputación contable. `PRODUCCION` y `ADMIN` en el Excel corresponden a las sedes Taller y Administración.
_Evitar_: centro de costo, grupo operativo, sede fija del colaborador

**Grupo operativo**:
Conjunto estable de colaboradores bajo un gerente de área, como Taller, Tiendas o Administración. Una jornada puede realizarse en cualquiera de las sedes de ese grupo. Tiene un atributo configurable, «Gestiona asistencia y horarios»: Administración lo tiene en «no», porque sus personas entran en planilla pero no marcan, y queda fuera de horarios, asistencias y aprobación.
_Evitar_: sede de la jornada, sede de adscripción, grupo que cambia según la tienda del día

**DNI del colaborador**:
Identificador único de negocio de cada persona en Planilla, usado también como identificador por el huellero.
_Evitar_: código de huellero independiente, grupo o sede como identidad personal

**Sede de adscripción**:
Sede a la que se imputa contablemente un colaborador durante una vigencia, sin limitar las sedes donde puede trabajar cada jornada.
_Evitar_: sede fija operativa, centro de costo, última sede trabajada

**Relación laboral**:
Intervalo entre el ingreso y el cese de un colaborador que acredita sus días remunerables, aunque no tenga jornadas trabajadas en el período. Recursos Humanos registra y confirma cada fecha por separado: solo el ingreso confirmado la abre y solo el cese confirmado la cierra. Una persona con reingreso conserva su DNI y tiene otra relación laboral.
_Evitar_: estado activo actual, presencia en el resumen de asistencia, fecha inferida de la primera asistencia

**Sin relación laboral**:
Estado planificado que el sistema fija en los días de una semana que quedan fuera de la relación laboral confirmada (antes del ingreso, después del cese o entre dos relaciones). Mantiene los siete días de la semana con estado, no genera asistencia por registrar y el gerente no lo elige ni lo cambia.
_Evitar_: descanso, vacaciones, falta, día sin planificación

**Gerente de área**:
Responsable de publicar horarios y gestionar y aprobar asistencias de los colaboradores de los grupos operativos que tiene asignados. Un grupo tiene un gerente; un gerente puede tener varios grupos. Su alcance se comprueba en el servidor.
_Evitar_: Administración, Finanzas, gerente con acceso a todos los grupos

**Administrador del sistema**:
Rol de configuración global y de comportamiento de la herramienta: grupos, sedes, política de tardanzas, cambio de grupo y cuentas de cualquier rol. Es un superusuario temporal mientras se estabiliza el uso de la herramienta (ADR 0012).
_Evitar_: grupo Administración, gerente de Administración, rol operativo permanente

**Recursos Humanos**:
Responsable de registrar y confirmar el inicio y el cese de cada relación laboral.
_Evitar_: gerente de área, Finanzas, fecha inferida de la primera asistencia

**Marca cruda**:
Registro original importado desde el huellero.
_Evitar_: marca editada, registro corregido

**Horario semanal**:
Programación de una semana específica para un colaborador. Cada día fija sede, entrada y salida programadas.
_Evitar_: turno, horario tentativo, horario vigente

**Asistencia confirmada**:
Registro diario revisado que conserva las propuestas basadas en marcas crudas y cualquier corrección aplicada.
_Evitar_: asistencia editada, marca final

**Aprobación de asistencias**:
Conformidad del gerente de área sobre la situación de todos los colaboradores de su grupo en un período de planilla, incluidos quienes no tengan marcas del huellero. Solo la dan los grupos que gestionan asistencia y bloquea quien tenga días de su relación laboral sin horario o con asistencia pendiente. Una corrección posterior invalida la aprobación del grupo afectado (queda en el historial) y exige renovarla antes del cierre.
_Evitar_: confirmación diaria, cierre del período, aprobación de pago

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
Tiempo real trabajado fuera de la jornada ordinaria diaria o semanal, incluso antes de la entrada o después de la salida programadas. Se mide en minutos, sin descartar fracciones ni contar dos veces un mismo tramo.
_Evitar_: saldo de jornada, compensación de tardanza

**Hora extra 25 %**:
Primeros 120 minutos reales de sobretiempo de una jornada, incluidas sus fracciones.
_Evitar_: primeras dos horas redondeadas, hora extra fija

**Hora extra 35 %**:
Minutos reales de sobretiempo posteriores a los primeros 120 de una jornada, incluidas sus fracciones.
_Evitar_: tercera hora en adelante redondeada, hora extra fija

**Hora extra pendiente**:
Tiempo fuera de la jornada que requiere verificar si corresponde a trabajo efectivo antes de incluirlo en el resumen del período.
_Evitar_: hora extra autorizada, pago de extra, marca automáticamente pagable

**Hora extra aprobada**:
Sobretiempo cuya prestación efectiva fue verificada por Finanzas para su inclusión en el resumen del período.
_Evitar_: hora marcada, autorización previa, pago oficial

**Hora extra descartada**:
Tiempo fuera de la jornada que Finanzas verificó como marca errónea o permanencia sin trabajo efectivo, con motivo y evidencia conservados.
_Evitar_: hora extra no autorizada, rechazo libre, tiempo trabajado sin pago

**Exportación del período**:
Archivo XLSX limpio con los totales calculados y la información de auditoría del período de planilla.
_Evitar_: copia de fórmulas del Excel histórico, planilla oficial de pagos

**Política de penalización por tardanzas**:
Regla configurable por el Administrador del sistema para cada sede que convierte tardanzas acumuladas en horas penalizadas desde una fecha de vigencia. Su resultado es disciplinario y no determina un descuento monetario.
_Evitar_: descuento fijo por tardanza, regla retroactiva

**Archivo fuente de asistencias**:
Archivo XLSX del huellero que aporta marcas para una o más sedes y fechas, conservado junto con esas marcas para auditoría.
_Evitar_: importación semanal por sede, carga acumulativa, marcas duplicadas

**Archivo fuente de preliquidación**:
Archivo XLSX normalizado que aporta conceptos externos y se conserva con su hash, responsable, período y resultado de validación.
_Evitar_: Excel histórico de planilla, archivo descartable, carga sin trazabilidad

**Incidencia de importación**:
Registro del archivo fuente que no puede asociarse de forma segura a una asistencia, por ejemplo un DNI desconocido.
_Evitar_: colaborador creado por importación, fila descartada

**Estado manual**:
Clasificación explícita de una jornada como falta, descanso, feriado, vacaciones, permiso o suspensión.
_Evitar_: tardanza, asistencia

**Período de planilla**:
Ventana operativa de asistencias con fechas explícitas, habitualmente del día 26 al día 25 siguiente, que se revisa y confirma antes de producir un resumen no monetario.
_Evitar_: mes calendario, registro mensual, rango fijo obligatorio

**Período cerrado**:
Período de planilla cuyo resumen y reglas aplicadas quedaron fijados para auditoría; solo Finanzas puede reabrirlo dejando un motivo.
_Evitar_: mes bloqueado, período definitivo sin trazabilidad

**Revisión cerrada de asistencia**:
Versión fijada de un período de planilla cerrado que Asistencia entrega a Pagos con los hechos diarios de cada persona. Una revisión sobre un período abierto no está cerrada: sus hechos son provisionales y solo sirven a un borrador. Pagos solo finaliza con revisiones cerradas que cubren exactamente el corte de incidencias.
_Evitar_: resumen del período, aprobación del grupo, preliquidación

**Hecho diario de asistencia**:
Situación resuelta de una persona en una fecha, tal como la entrega Asistencia a Pagos: grupo, sede de la jornada, horario aplicado, trabajo real o motivo de no asistencia, minutos pertinentes, decisiones que afectan la valoración y una referencia a su evidencia en Asistencia. No lleva importes ni copia la aprobación de los gerentes: una jornada puede originar varios conceptos, ninguno o una reclasificación de sueldo.
_Evitar_: línea de pago, estado con importe, jornada aprobada

## Pago

**Preliquidación**:
Resultado monetario revisable de un mes de pago, con un desglose por colaborador.
_Evitar_: planilla oficial de pagos, pago realizado, exportación del período

**Preliquidación finalizada**:
Versión inmutable de la preliquidación completa de un mes, aprobada por Finanzas y vinculada a las revisiones cerradas que cubren su corte de incidencias.
_Evitar_: borrador de pago, transferencia bancaria, pago realizado

**Mes de pago**:
Mes calendario cuya remuneración mensual se paga mediante una preliquidación.
_Evitar_: período de planilla, corte de incidencias, fecha de desembolso

**Corte de incidencias**:
Ventana del día 26 al día 25 siguiente que determina qué horas extra, faltas y otras incidencias variables entran en un mes de pago.
_Evitar_: mes de pago, mes de devengue, mes calendario

**Mes de devengue**:
Mes calendario en el que nace una remuneración, deducción o aporte, aunque se aplique en un mes de pago posterior.
_Evitar_: corte de incidencias, fecha de pago, período de planilla

**Devengado pendiente de pago**:
Remuneración atribuida a su mes de origen que se abonará en un mes posterior, como los días de un ingreso ocurrido después del corte.
_Evitar_: remuneración devengada en el mes de pago, importe perdido, adelanto

**Régimen laboral**:
Conjunto de derechos y reglas aplicables a una relación laboral durante una vigencia, como régimen general o REMYPE pequeña empresa.
_Evitar_: régimen actual de la empresa, tamaño de empresa, régimen tributario

**Pago**:
Desembolso efectivo de dinero al colaborador, anticipado o posterior a la preliquidación. Su ejecución queda fuera del sistema.
_Evitar_: preliquidación, neto calculado

**Pago realizado confirmado**:
Constancia registrada por Finanzas de que se efectuó fuera del sistema el desembolso del mes de pago completo. Marca el cierre operativo para reemplazar su preliquidación y reabrir los períodos de asistencia que la sustentan.
_Evitar_: orden de transferencia, preliquidación finalizada, subsanación

**Condición laboral**:
Dato de una relación laboral que Finanzas mantiene con fecha de vigencia y del que depende el cálculo: sueldo, jornada ordinaria diaria, régimen laboral, afiliación pensionaria, esquema de comisión AFP, elegibilidad familiar y sede de adscripción. Un valor nuevo agrega una vigencia y no reescribe las anteriores; una corrección reemplaza el valor con motivo, y un dato sin vigencia es «Pendiente», nunca cero.
_Evitar_: valor actual que reescribe la historia, ficha editable sin vigencia, dato de la persona (es de la relación laboral)

**Regla legal**:
Valor legal o tributario que Finanzas activa con fecha de vigencia y fuente oficial, como una tasa, un tope o la RMV; no es una constante del código ni se consulta a un servicio externo. Cada versión conserva su vigencia, su fuente y quién la activó; una versión nueva no reescribe las anteriores, una corrección reemplaza el valor con motivo, y consultar una fecha sin versión vigente deja la falta explícita («Pendiente», «Sin regla vigente»), nunca cero.
_Evitar_: tasa fija en el código, parámetro global editable sin vigencia, constante legal

**Remuneración ordinaria computable**:
Suma de los conceptos remunerativos regulares que forman la base para valorar una hora ordinaria y las horas extra.
_Evitar_: sueldo base, total de ingresos, neto

**Jornada ordinaria diaria**:
Cantidad de horas de trabajo ordinario pactadas para un día, usada como divisor para obtener el valor hora.
_Evitar_: divisor fijo de ocho horas, horas efectivamente trabajadas

**Descanso semanal**:
Día de descanso remunerado asignado al colaborador dentro de la semana, por vigencia: un cambio agrega una vigencia nueva y no reescribe las anteriores. No tiene que coincidir con el domingo y, mientras no se asigna uno, la persona no tiene descanso: nunca se asume el domingo. Lo registra Finanzas.
_Evitar_: domingo, feriado

**Descanso sustitutorio**:
Día de descanso efectivamente otorgado en reemplazo de un descanso semanal o feriado trabajado.
_Evitar_: descanso previsto, descanso adicional, domingo no trabajado

**Descanso sustitutorio previsto**:
Día futuro acordado para reemplazar un descanso semanal o feriado trabajado, pendiente de verificar como descanso efectivo. Finanzas lo registra y, desde su fecha prevista, lo marca como otorgado o no otorgado, una sola vez.
_Evitar_: descanso sustitutorio ya otorgado, pago adicional autorizado

**Calendario de feriados**:
Lista global de fechas feriadas que mantiene Finanzas. Cada fecha tiene un nombre y una clase; el 1 de mayo es el único feriado con clase propia y la clase se deriva de la fecha, no se elige.
_Evitar_: feriado por persona, feriado tecleado en cada jornada

**Primero de mayo**:
Feriado del Día del Trabajo, distinguido en el calendario porque Pagos le aplica una regla propia.
_Evitar_: feriado común, multiplicador tecleado

**Jornada trabajada en descanso o feriado**:
Asistencia confirmada con tiempo real trabajado en un día que es feriado o el descanso semanal asignado a esa persona. Es un hecho revisable que Pagos valora después; se distingue de un estado manual de descanso o feriado, que indica que la persona no trabajó, y de un día sin resolver.
_Evitar_: estado manual de feriado, domingo trabajado, adicional ya calculado

**Incidencia de tienda**:
Hecho registrado en una tienda, como merma o consumo, cuya existencia por sí sola no autoriza un descuento salarial.
_Evitar_: descuento automático, falta, ajuste de asistencia

**Descuento autorizado por incidencia**:
Deducción vinculada a una incidencia de tienda que cuenta con sustento y autorización verificados por Finanzas.
_Evitar_: incidencia de tienda, descuento libre, deducción automática

**Ajuste de preliquidación**:
Corrección monetaria trazable aplicada en un mes de pago que identifica su mes de devengue, concepto, monto, motivo y responsable.
_Evitar_: ajuste de asistencia, edición de una preliquidación finalizada, arrastre manual

**Concepto de preliquidación**:
Tipo catalogado de ingreso, reducción, deducción o aporte patronal cuyo efecto sobre el neto y las bases de cálculo está definido de antemano.
_Evitar_: línea libre, bono inafecto genérico, otros descuentos

**Tipo de fuente externa**:
Agrupación de los conceptos que Finanzas carga por persona desde fuera del huellero, como comisiones de ventas, movilidad, adelantos, préstamos, retención de quinta o gratificación. Finanzas lo confirma para el mes de pago completo; hasta entonces es «Pendiente».
_Evitar_: línea libre, hoja del Excel, categoría de gasto

**Importe externo**:
Monto de un concepto catalogado cargado para una persona (por DNI) con su fecha del hecho, mes de devengue, mes de aplicación y procedencia; no se edita, se anula con motivo. Dos importes con la misma persona, concepto, fecha, devengue, aplicación y monto son duplicados y no se cargan.
_Evitar_: línea calculada, ajuste de preliquidación, descuento libre

**Fuente confirmada**:
Tipo de fuente externa que Finanzas declaró completo para el mes de pago y la población aplicable, incluso sin importes. Solo entonces la ausencia de una fila vale cero («cero confirmado»); antes es dato pendiente, y cambiar sus filas la devuelve a «Pendiente».
_Evitar_: fuente vacía, fuente sin datos, cero por defecto

**Movilidad supeditada a asistencia**:
Importe razonable para el traslado entre domicilio y centro de trabajo, condicionado a la asistencia. No integra las bases de EsSalud ni pensiones, pero sí la base de quinta categoría.
_Evitar_: movilidad de libre disposición, condición de trabajo, movilidad inafecta genérica

**Remuneración vacacional**:
Parte de la remuneración habitual atribuida al descanso vacacional; sustituye, sin duplicarlo, el sueldo básico de esos días.
_Evitar_: bono de vacaciones, ingreso adicional al sueldo, vacaciones truncas

**Días de descanso vacacional del mes**:
Días calendario de vacaciones que corresponden a un mes, aunque el descanso cruce meses o la remuneración se abone antes.
_Evitar_: días del corte de incidencias, días pagados en el mes

**Abono anticipado de remuneración vacacional**:
Importe entregado antes del descanso vacacional, asociado a los días de descanso que remunera aunque correspondan a meses distintos.
_Evitar_: nueva remuneración vacacional, pago duplicado, adelanto sin origen

**Gratificación legal**:
Beneficio exigible en julio o diciembre según el régimen laboral del colaborador; no es la provisión contable de gratificaciones.
_Evitar_: provisión de gratificación, bono libre, sueldo básico

**Liquidación por cese**:
Pago de beneficios y adeudos exigibles al terminar la relación laboral, separado de la preliquidación mensual.
_Evitar_: preliquidación ordinaria, cierre del período de asistencia

**Base de quinta categoría**:
Suma de los conceptos sujetos a la retención del impuesto a la renta de quinta categoría; incluye la movilidad supeditada a asistencia aunque esta no integre las bases pensionarias ni de EsSalud.
_Evitar_: ingreso afecto único, base pensionaria, retención calculada

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
