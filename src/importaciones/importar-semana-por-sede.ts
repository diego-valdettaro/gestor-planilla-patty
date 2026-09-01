import type { Actor } from "@/colaboradores/registrar-colaborador";

export interface MarcaCruda {
  idHuellero: string;
  fecha: string;
  instante: string;
}

export interface ArchivoFuente {
  nombre: string;
  ubicacion: string;
  hashSha256: string;
}

export interface AsistenciaPendiente {
  idHuellero: string;
  fecha: string;
  estado: "pendiente";
  entradaPropuesta?: string;
  salidaPropuesta?: string;
}

export interface IncidenciaDeImportacion {
  idHuellero: string;
  fecha: string;
  motivo: "ID de huellero desconocido.";
}

export interface ImportacionSemanal {
  sede: string;
  semana: string;
  archivo: ArchivoFuente;
  usuarioId: string;
  importadaEn: Date;
  marcasCrudas: MarcaCruda[];
  propuestas: AsistenciaPendiente[];
  incidencias: IncidenciaDeImportacion[];
}

export interface RepositorioDeImportaciones {
  buscarColaborador(idHuellero: string): Promise<{ idHuellero: string; sede: string } | undefined>;
  buscarTurnoPublicado(idHuellero: string, fecha: string): Promise<{ idHuellero: string; fecha: string } | undefined>;
  perteneceAPeriodoAbierto(fecha: string): Promise<boolean>;
  guardar(importacion: ImportacionSemanal): Promise<void>;
}

export interface SolicitudDeImportacion {
  sede: string;
  semana: string;
  archivo: ArchivoFuente;
  marcasCrudas: MarcaCruda[];
}

export async function importarSemanaPorSede(
  repositorio: RepositorioDeImportaciones,
  actor: Actor,
  solicitud: SolicitudDeImportacion,
): Promise<void> {
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") {
    throw new Error("No tiene permiso para importar asistencias.");
  }

  const agrupadas = agruparMarcas(solicitud.marcasCrudas);
  const propuestas: AsistenciaPendiente[] = [];
  const incidencias: IncidenciaDeImportacion[] = [];

  for (const [clave, marcas] of agrupadas) {
    const [idHuellero, fecha] = clave.split("\u0000");
    if (!(await repositorio.perteneceAPeriodoAbierto(fecha))) {
      throw new Error("Todas las marcas deben pertenecer a un período de planilla abierto.");
    }

    const colaborador = await repositorio.buscarColaborador(idHuellero);
    if (!colaborador) {
      incidencias.push({ idHuellero, fecha, motivo: "ID de huellero desconocido." });
      continue;
    }
    if (colaborador.sede !== solicitud.sede) {
      throw new Error("La marca no pertenece a la sede de la importación.");
    }

    await repositorio.buscarTurnoPublicado(idHuellero, fecha);
    const propuesta: AsistenciaPendiente = { idHuellero, fecha, estado: "pendiente" };
    if (marcas.length > 1 && marcas.length % 2 === 0) {
      propuesta.entradaPropuesta = marcas[0].instante;
      propuesta.salidaPropuesta = marcas.at(-1)!.instante;
    }
    propuestas.push(propuesta);
  }

  await repositorio.guardar({
    sede: solicitud.sede,
    semana: solicitud.semana,
    archivo: solicitud.archivo,
    usuarioId: actor.id,
    importadaEn: new Date(),
    marcasCrudas: solicitud.marcasCrudas,
    propuestas,
    incidencias,
  });
}

function agruparMarcas(marcas: MarcaCruda[]): Map<string, MarcaCruda[]> {
  const agrupadas = new Map<string, MarcaCruda[]>();
  for (const marca of marcas) {
    const clave = `${marca.idHuellero}\u0000${marca.fecha}`;
    agrupadas.set(clave, [...(agrupadas.get(clave) ?? []), marca]);
  }
  for (const marcasDelDia of agrupadas.values()) {
    marcasDelDia.sort((a, b) => a.instante.localeCompare(b.instante));
  }
  return agrupadas;
}
