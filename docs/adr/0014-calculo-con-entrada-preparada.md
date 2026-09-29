# Cálculo de preliquidación con entrada preparada

Estado: aceptada

El caso de uso de Pagos reúne para un mes de pago la población laboral, las revisiones de asistencia, las condiciones y reglas vigentes y las fuentes externas confirmadas antes de calcular importes. El cálculo recibe ese conjunto coherente y devuelve conceptos, bases, neto, procedencia y bloqueos sin consultar fuentes cambiantes por su cuenta. Así una misma entrada puede repetirse en pruebas y una versión final puede explicar exactamente qué datos produjo cada importe.

## Consecuencias

- Un borrador puede mostrar los resultados calculables y señalar los datos ausentes como bloqueos, sin tratarlos como cero ni presentar un neto incompleto como definitivo.
- La finalización comprueba que no haya bloqueos y guarda una versión inmutable del mes completo con las fuentes y reglas utilizadas.
- Si los datos relevantes cambiaron desde el borrador que Finanzas revisó, la finalización exige revisar el cálculo actualizado antes de guardar una versión.
- La preparación de datos, el cálculo y la persistencia final tienen contratos separados; este ADR no prescribe tablas, funciones ni organización de archivos.
