import type { RepositorioDeVersiones, VersionDePago } from "./finalizar-mes";

// Apoyo de pruebas: adaptador en memoria del repositorio de versiones (P5).
export function crearRepositorioDeVersionesEnMemoria(opciones: {
  /** Se invoca al escribir cada fila de persona; si lanza, la versión completa se descarta (atomicidad). */
  alEscribirFila?: (indice: number) => void;
} = {}) {
  const versiones: VersionDePago[] = [];
  const repositorio: RepositorioDeVersiones = {
    guardarVersion: async (nueva) => {
      nueva.personas.forEach((_, indice) => opciones.alEscribirFila?.(indice));
      const version: VersionDePago = {
        ...nueva, numero: versiones.filter(({ mesDePago }) => mesDePago === nueva.mesDePago).length + 1,
        subtotalCentimos: nueva.personas.reduce((suma, { subtotalCentimos }) => suma + subtotalCentimos, 0),
      };
      versiones.push(version);
      return version;
    },
    listarVersiones: async (mes) => versiones.filter(({ mesDePago }) => mesDePago === mes),
    buscarVersion: async (mes, numero) => versiones.find(({ mesDePago, numero: candidata }) => mesDePago === mes && candidata === numero),
  };
  return { repositorio, guardadas: () => versiones };
}
