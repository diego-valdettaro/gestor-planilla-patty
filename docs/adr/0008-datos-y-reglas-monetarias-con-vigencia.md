# Datos y reglas monetarias con vigencia histórica

Estado: aceptada

Los datos laborales que afectan una preliquidación y las reglas monetarias se conservan como versiones con fecha de vigencia. Sueldo, jornada ordinaria diaria, régimen laboral, afiliación pensionaria, esquema de comisión AFP y elegibilidad familiar no se guardan como valores actuales que reescriben la historia. Las tasas, topes y valores legales registran además su fuente oficial y responsable de activación. Cada preliquidación finalizada conserva los valores y versiones que aplicó.

## Consecuencias

- Los cambios de sueldo dentro de un mes de pago se prorratean por fecha.
- Finanzas activa nuevas reglas; el cálculo no consulta servicios externos ni usa tasas monetarias fijas en código.
- La asignación familiar se deriva de la RMV solo cuando el régimen laboral vigente concede ese derecho.
