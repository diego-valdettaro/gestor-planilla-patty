# Gerentes por grupo y relación laboral por Recursos Humanos

Estado: aceptada

Cada grupo operativo tiene un gerente responsable de publicar horarios, gestionar las asistencias y aprobar la situación de todos sus colaboradores para cada período de planilla, incluso si no hay marcas del huellero. El gerente de Administración tiene el mismo alcance que los de Taller y Tiendas; no existe un permiso operativo global asociado al nombre Administración. Finanzas puede importar marcas, crea cuentas y asigna gerentes a grupos, pero no aprueba asistencias en nombre de un gerente. Recursos Humanos registra y confirma las fechas de ingreso y cese de cada relación laboral; por ahora no recibe otros permisos. El alcance por grupo se comprueba en el servidor porque la aprobación y los datos de personal no pueden depender de filtros de interfaz.

## Consecuencias

- Cada gerente da de alta colaboradores de su grupo. El DNI es único y el grupo de una persona permanece estable; sus jornadas pueden realizarse en distintas sedes del grupo.
- Un colaborador puede tener relaciones laborales sucesivas con el mismo DNI. No se publican horarios fuera de una relación laboral confirmada por Recursos Humanos.
- Una persona del grupo sin horario, marcas ni situación resuelta bloquea la aprobación. Finanzas solo cierra el período cuando todos los grupos están aprobados.
- Una corrección de las asistencias de un grupo invalida su aprobación y exige una nueva antes de volver a cerrar el período.
- Esta decisión sustituye el modelo de tres roles de ADR 0004 y el acceso operativo global de Administración de ADR 0006. Las cuentas y permisos existentes requieren migración explícita.

## Enmienda (issue #108): Administrador del sistema, grupos que no gestionan asistencia y migración de cuentas

Decidida por Diego al implementar las cuentas; precisa y completa lo anterior sin cambiar sus reglas para gerentes, Recursos Humanos y Finanzas.

### Cuatro roles

Las cuentas tienen un único rol: **Administrador del sistema**, **gerente de área**, **Recursos Humanos** o **Finanzas**. El servidor comprueba rol y grupo antes de cada caso de uso; la matriz vive en un único módulo (`src/autenticacion/permisos.ts`) que consultan los casos de uso, las pantallas, las acciones, la API y el menú.

- **Administrador del sistema.** Es dueño de la configuración global y del comportamiento de la herramienta: crear grupos, crear sedes y asignarlas a un grupo, el atributo de grupo «Gestiona asistencia y horarios», la política de penalización por tardanzas, cambiar a una persona de grupo y activar o desactivar colaboradores (provisional hasta #109). Crea cuentas de cualquier rol. **Es un superusuario temporal**: mientras se estabiliza el uso de la herramienta puede ejecutar todo lo que pueden los demás roles, sin límite de grupo. Este rol no reintroduce el «permiso operativo global asociado al nombre Administración»: tiene otro nombre, es temporal y se retirará su alcance operativo cuando la herramienta esté estable.
- **Gerente de área.** Opera solo los grupos que tiene asignados: da de alta y edita a sus personas (también en un grupo que no gestiona asistencia), y gestiona modelos de horario, horarios y asistencias solo de los grupos que gestionan asistencia. No cambia el grupo de una persona ni la activa o desactiva.
- **Finanzas.** Crea cuentas de gerente de área y de Recursos Humanos, asigna y quita gerentes de grupos, importa marcas, decide horas extra, crea, cierra y reabre períodos y exporta. Consulta Asistencias en solo lectura; no publica horarios ni confirma, ajusta ni aprueba asistencias en nombre de un gerente.
- **Recursos Humanos.** Sin permisos operativos hasta #109: ingreso y cese.

Un grupo tiene a lo sumo un gerente de área; un gerente puede tener varios grupos.

### Grupos que no gestionan asistencia

Cada grupo tiene el atributo **Gestiona asistencia y horarios** (por defecto sí), que solo cambia el Administrador. El grupo **Administración** entra en planilla y en la población de Pagos por sus relaciones laborales, pero sus personas no marcan: queda fuera de horarios, asistencias y aprobación de asistencias. Por tanto un grupo que no gestiona asistencia no bloquea el cierre de un período ni exige la aprobación de su gerente; esto matiza la historia 41 de #96 y el criterio de cierre de #114.

### Migración de cuentas existentes

| Rol anterior | Rol nuevo | Grupos |
| --- | --- | --- |
| `administracion` | `administrador` | no aplica |
| `operaciones` | `gerente_de_area` | ninguno: Finanzas o el Administrador los asignan |
| `finanzas` | `finanzas` | no aplica |

La migración `0028_roles_de_cuenta_y_gerentes_por_grupo.sql` aplica la regla, restringe el rol a los cuatro valores y deja el grupo «Administración» con el atributo en «no». La primera cuenta de despliegue pasa a ser de Administrador (`pnpm provisionar:administrador`).

