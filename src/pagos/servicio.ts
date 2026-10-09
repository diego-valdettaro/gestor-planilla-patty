import { repositorioDeRelacionesLaborales } from "@/relaciones-laborales/servicio";
import { repositorioDeCondicionesLaborales } from "@/condiciones-laborales/servicio";
import { repositorioDeReglasLegales } from "@/reglas-legales/servicio";
import { repositorioDePeriodos } from "@/periodos/servicio";
import { repositorioDeFuentesExternas } from "@/fuentes-externas/servicio";

import type { FuentesDelBorrador } from "./preparar-borrador";

export const fuentesDelBorrador: FuentesDelBorrador = {
  relaciones: repositorioDeRelacionesLaborales,
  condiciones: repositorioDeCondicionesLaborales,
  reglas: repositorioDeReglasLegales,
  asistencia: repositorioDePeriodos,
  externas: repositorioDeFuentesExternas,
};
