import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import {
  calcularTardanza,
  configurarPoliticaDePenalizacionPorTardanzas,
  type RepositorioDeTardanzas,
  type SolicitudDeCalculoDeTardanza,
  type SolicitudDePoliticaDePenalizacionPorTardanzas,
} from "./politica-de-penalizacion";

export function crearCasosDeUsoDeTardanzas(repositorio: RepositorioDeTardanzas, sesion: SesionDelServidor) {
  return {
    async configurarPolitica(solicitud: SolicitudDePoliticaDePenalizacionPorTardanzas): Promise<void> {
      await configurarPoliticaDePenalizacionPorTardanzas(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
    async calcularTardanza(solicitud: SolicitudDeCalculoDeTardanza) {
      return calcularTardanza(repositorio, solicitud);
    },
  };
}
