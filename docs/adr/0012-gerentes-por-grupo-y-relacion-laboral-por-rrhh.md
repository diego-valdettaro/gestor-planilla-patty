# Gerentes por grupo y relación laboral por Recursos Humanos

Estado: aceptada

Cada grupo operativo tiene un gerente responsable de publicar horarios, gestionar las asistencias y aprobar la situación de todos sus colaboradores para cada período de planilla, incluso si no hay marcas del huellero. El gerente de Administración tiene el mismo alcance que los de Taller y Tiendas; no existe un permiso operativo global asociado al nombre Administración. Finanzas puede importar marcas, crea cuentas y asigna gerentes a grupos, pero no aprueba asistencias en nombre de un gerente. Recursos Humanos registra y confirma las fechas de ingreso y cese de cada relación laboral; por ahora no recibe otros permisos. El alcance por grupo se comprueba en el servidor porque la aprobación y los datos de personal no pueden depender de filtros de interfaz.

## Consecuencias

- Cada gerente da de alta colaboradores de su grupo. El DNI es único y el grupo de una persona permanece estable; sus jornadas pueden realizarse en distintas sedes del grupo.
- Un colaborador puede tener relaciones laborales sucesivas con el mismo DNI. No se publican horarios fuera de una relación laboral confirmada por Recursos Humanos.
- Una persona del grupo sin horario, marcas ni situación resuelta bloquea la aprobación. Finanzas solo cierra el período cuando todos los grupos están aprobados.
- Una corrección de las asistencias de un grupo invalida su aprobación y exige una nueva antes de volver a cerrar el período.
- Esta decisión sustituye el modelo de tres roles de ADR 0004 y el acceso operativo global de Administración de ADR 0006. Las cuentas y permisos existentes requieren migración explícita.
