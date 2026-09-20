# DNI único compartido con el huellero

Estado: aceptada

El DNI identifica de forma única a cada colaborador en el negocio y es el mismo valor que usa el huellero. El identificador interno de la base de datos solo enlaza registros técnicos y no representa otra identidad de persona. La población de una preliquidación se obtiene de las relaciones laborales y del corte de pago, no de las filas presentes en el resumen de asistencia.

## Consecuencias

- Un DNI desconocido en una importación se registra como incidencia y no crea automáticamente un colaborador.
- Las importaciones, asistencias y datos laborales se asocian a la misma persona mediante el DNI único; las relaciones internas pueden conservar un identificador técnico.
- Una persona incluida en el corte que está de vacaciones, con permiso o sin asistencia registrada no desaparece de la preliquidación.
- La finalización del período monetario es atómica y cualquier persona incompleta la bloquea.
