# Monolito web y PostgreSQL para el MVP

Estado: aceptada

El MVP será una aplicación web monolítica en TypeScript con Next.js, PostgreSQL y Drizzle. Horarios, asistencias, auditoría, aprobación y exportación pertenecen al mismo contexto y se deben confirmar de forma consistente, por lo que un único proceso y una base relacional simplifican las transacciones y la trazabilidad. No se crearán servicios separados ni una API pública hasta que una integración externa lo requiera.

## Consecuencias

- Cada cambio de estado y su auditoría se guardan en la misma transacción de PostgreSQL.
- Drizzle define el esquema y genera migraciones revisables que se aplican antes del despliegue.
- Un cambio futuro a servicios separados deberá partir de límites de casos de uso ya identificados, no de dividir tablas por anticipado.
