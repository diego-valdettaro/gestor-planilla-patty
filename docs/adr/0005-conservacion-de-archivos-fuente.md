# Conservación de los archivos fuente

Estado: aceptada

Cada archivo fuente de asistencias conservará el XLSX original fuera del directorio público de la aplicación y registrará su hash SHA-256. Un archivo puede contener marcas de varias sedes y fechas; cada marca cruda conserva su sede y queda ligada a ese archivo. En producción los archivos vivirán en almacenamiento de objetos compatible con S3 y en desarrollo en un volumen local persistente. La base de datos guardará la ubicación, el hash y la auditoría de la importación.

## Consecuencias

- Una nueva importación no reemplaza el archivo fuente ni las marcas crudas de una importación anterior.
- El control de acceso para descargar un archivo pasa por la aplicación y sus roles.
- Las copias de seguridad incluyen PostgreSQL y el almacenamiento de archivos; restaurar solo una de las dos partes deja una auditoría incompleta.
