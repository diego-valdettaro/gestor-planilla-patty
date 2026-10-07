import { randomUUID } from "node:crypto";

import type { AlmacenDeReglasLegales, NuevaReglaLegal, RepositorioDeReglasLegales, VersionFinalizada } from "./gestionar-reglas-legales";
import type { ReglaLegal } from "./vigencia";

// Apoyo de pruebas: repositorio en memoria. Los valores que las pruebas cargan son sintéticos y salen de cada prueba.
export function crearRepositorioEnMemoria() {
  let reglas: ReglaLegal[] = [];
  const versionesFinalizadas = new Map<string, VersionFinalizada[]>();

  const almacen: AlmacenDeReglasLegales = {
    listar: async (codigo) => reglas.filter((regla) => regla.codigo === codigo),
    buscar: async (id) => reglas.find((regla) => regla.id === id),
    insertar: async (nueva: NuevaReglaLegal) => {
      const hayActiva = reglas.some((regla) => regla.codigo === nueva.codigo && regla.vigenteDesde === nueva.vigenteDesde && regla.reemplazadaEn === null);
      if (hayActiva) return undefined;
      const regla: ReglaLegal = {
        id: randomUUID(), codigo: nueva.codigo, valor: nueva.valor, vigenteDesde: nueva.vigenteDesde, fuenteOficial: nueva.fuenteOficial,
        activadaPorId: nueva.responsableId, activadaPor: `usuario-${nueva.responsableId}`, activadaEn: new Date(), reemplazadaEn: null, motivoDeReemplazo: null,
      };
      reglas.push(regla);
      return regla;
    },
    reemplazar: async (id, motivo, reemplazadaEn) => {
      const regla = reglas.find((existente) => existente.id === id);
      if (!regla || regla.reemplazadaEn !== null) return false;
      Object.assign(regla, { reemplazadaEn, motivoDeReemplazo: motivo });
      return true;
    },
  };

  const repositorio: RepositorioDeReglasLegales = {
    ...almacen,
    listarTodas: async () => [...reglas],
    versionesFinalizadasQueUsan: async (id) => versionesFinalizadas.get(id) ?? [],
    // Como una transacción: si la operación falla, el estado vuelve al de antes.
    ejecutarSobreCodigo: async (_codigo, operacion) => {
      const respaldo = reglas.map((regla) => ({ ...regla }));
      try {
        return await operacion(almacen);
      } catch (error) {
        reglas = respaldo;
        throw error;
      }
    },
  };
  return { repositorio, versionesFinalizadas, reglas: () => reglas };
}
