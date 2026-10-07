import { randomUUID } from "node:crypto";

import type { AlmacenDeCondiciones, NuevaCondicion, RelacionParaCondiciones, RepositorioDeCondicionesLaborales, VersionFinalizada } from "./gestionar-condiciones-laborales";
import type { CondicionLaboral } from "./vigencia";

// Apoyo de pruebas: repositorio en memoria con tres relaciones laborales confirmadas y dos sedes.
export const ANA = "99900001";
export const BETO = "99900002";
export const ANA_RELACION = "11111111-1111-4111-8111-111111111111";
export const BETO_RELACION = "22222222-2222-4222-8222-222222222222";
export const ANA_REINGRESO = "33333333-3333-4333-8333-333333333333";

export function crearRepositorioEnMemoria() {
  const relaciones: RelacionParaCondiciones[] = [
    { id: ANA_RELACION, dni: ANA, nombre: "Ana Pérez", grupo: "Tiendas", ingreso: "2025-03-02", cese: "2026-01-31" },
    { id: ANA_REINGRESO, dni: ANA, nombre: "Ana Pérez", grupo: "Tiendas", ingreso: "2026-06-01", cese: null },
    { id: BETO_RELACION, dni: BETO, nombre: "Beto Ruiz", grupo: "Taller", ingreso: "2024-01-08", cese: null },
  ];
  const sedes = [{ nombre: "Tienda Benavides", activa: true }, { nombre: "Taller", activa: true }, { nombre: "Depósito (inactivo)", activa: false }];
  let condiciones: CondicionLaboral[] = [];
  const versionesFinalizadas = new Map<string, VersionFinalizada[]>();

  const almacen: AlmacenDeCondiciones = {
    buscarRelacion: async (id) => relaciones.find((relacion) => relacion.id === id),
    buscarSede: async (nombre) => sedes.find((sede) => sede.nombre === nombre),
    listar: async (relacionId) => condiciones.filter((condicion) => condicion.relacionId === relacionId),
    buscar: async (id) => condiciones.find((condicion) => condicion.id === id),
    insertar: async (nueva: NuevaCondicion) => {
      const hayActiva = condiciones.some((condicion) => condicion.relacionId === nueva.relacionId && condicion.dato === nueva.dato && condicion.vigenteDesde === nueva.vigenteDesde && condicion.reemplazadaEn === null);
      if (hayActiva) return undefined;
      const condicion: CondicionLaboral = {
        id: randomUUID(), relacionId: nueva.relacionId, dato: nueva.dato, valor: nueva.valor, vigenteDesde: nueva.vigenteDesde,
        registradaPorId: nueva.responsableId, registradaPor: `usuario-${nueva.responsableId}`, registradaEn: new Date(), reemplazadaEn: null, motivoDeReemplazo: null,
      };
      condiciones.push(condicion);
      return condicion;
    },
    reemplazar: async (id, motivo, reemplazadaEn) => {
      const condicion = condiciones.find((existente) => existente.id === id);
      if (!condicion || condicion.reemplazadaEn !== null) return false;
      Object.assign(condicion, { reemplazadaEn, motivoDeReemplazo: motivo });
      return true;
    },
  };

  const repositorio: RepositorioDeCondicionesLaborales = {
    ...almacen,
    listarRelaciones: async () => [...relaciones],
    listarTodas: async () => [...condiciones],
    listarSedesActivas: async () => sedes.filter((sede) => sede.activa).map((sede) => sede.nombre),
    versionesFinalizadasQueUsan: async (id) => versionesFinalizadas.get(id) ?? [],
    // Como una transacción: si la operación falla, el estado vuelve al de antes.
    ejecutarSobreRelacion: async (_relacionId, operacion) => {
      const respaldo = condiciones.map((condicion) => ({ ...condicion }));
      try {
        return await operacion(almacen);
      } catch (error) {
        condiciones = respaldo;
        throw error;
      }
    },
  };
  return { repositorio, relaciones, sedes, versionesFinalizadas, condiciones: () => condiciones };
}
