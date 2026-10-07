-- Hechos diarios de asistencia para Pagos (issue #115, ADR 0007): al cerrar un período, su revisión congela los
-- hechos diarios resueltos de cada persona (fecha, grupo, sede de la jornada, horario aplicado, resultado, minutos,
-- decisiones y referencia a la evidencia) para que Pagos valore siempre la misma asistencia aunque Asistencia
-- cambie después. Las revisiones previas quedan en NULL: son datos de desarrollo y Pagos no las acepta como fuente.
ALTER TABLE "revisiones_periodos_planilla" ADD COLUMN "hechos" jsonb;
