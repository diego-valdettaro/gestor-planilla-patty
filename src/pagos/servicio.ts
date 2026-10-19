import { repositorioDeRelacionesLaborales } from "@/relaciones-laborales/servicio";
import { repositorioDeCondicionesLaborales } from "@/condiciones-laborales/servicio";
import { repositorioDeReglasLegales } from "@/reglas-legales/servicio";
import { repositorioDePeriodos } from "@/periodos/servicio";
import { repositorioDeFuentesExternas } from "@/fuentes-externas/servicio";
import { repositorioDeDescansosYFeriados } from "@/descansos-y-feriados/servicio";
import { repositorioDeClasificacionesDeGoce } from "@/clasificaciones-de-goce/servicio";
import { db } from "@/db/client";

import type { DependenciasDeFinalizacion } from "./finalizar-mes";
import type { FuentesDelBorrador } from "./preparar-borrador";
import { RepositorioPostgresDeConstancias } from "./repositorio-postgres-de-constancias";
import { RepositorioPostgresDeVersiones } from "./repositorio-postgres-de-versiones";

export const fuentesDelBorrador: FuentesDelBorrador = {
  relaciones: repositorioDeRelacionesLaborales,
  condiciones: repositorioDeCondicionesLaborales,
  reglas: repositorioDeReglasLegales,
  asistencia: repositorioDePeriodos,
  externas: repositorioDeFuentesExternas,
  descansos: repositorioDeDescansosYFeriados,
  clasificaciones: repositorioDeClasificacionesDeGoce,
};

/** Finalizar el mes (#129): versiones en PostgreSQL y las constancias de pago realizado (#130). */
export const dependenciasDeFinalizacion: DependenciasDeFinalizacion = {
  fuentes: fuentesDelBorrador,
  versiones: new RepositorioPostgresDeVersiones(db),
  pago: new RepositorioPostgresDeConstancias(db),
  ahora: () => new Date(),
};
