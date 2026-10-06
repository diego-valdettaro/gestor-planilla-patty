import { randomUUID } from "node:crypto";

import type { AlmacenDeRelaciones, RelacionConPersona, RepositorioDeRelacionesLaborales } from "./gestionar-relaciones-laborales";

// Apoyo de pruebas: repositorio en memoria con las dos personas de demo y sin bloqueo real de transacción.
export const ANA = "99900001";
export const BETO = "99900002";

export function crearRepositorioEnMemoria() {
  const personas = new Map([
    [ANA, { dni: ANA, nombre: "Ana Pérez", grupo: "Tiendas" }],
    [BETO, { dni: BETO, nombre: "Beto Ruiz", grupo: "Taller" }],
  ]);
  const relaciones: RelacionConPersona[] = [];
  const almacen: AlmacenDeRelaciones = {
    listarDelColaborador: async (dni) => relaciones.filter((relacion) => relacion.dni === dni),
    buscar: async (id) => relaciones.find((relacion) => relacion.id === id),
    insertar: async ({ dni, ingreso }) => {
      const relacion = { id: randomUUID(), dni, ingreso, cese: null, ingresoConfirmado: false, ceseConfirmado: false, nombre: personas.get(dni)!.nombre, grupo: personas.get(dni)!.grupo };
      relaciones.push(relacion);
      return relacion;
    },
    actualizarIngreso: async (id, ingreso) => { relaciones.find((relacion) => relacion.id === id)!.ingreso = ingreso; },
    confirmarIngreso: async (id) => { relaciones.find((relacion) => relacion.id === id)!.ingresoConfirmado = true; },
    actualizarCese: async (id, cese) => { relaciones.find((relacion) => relacion.id === id)!.cese = cese; },
    confirmarCese: async (id) => { relaciones.find((relacion) => relacion.id === id)!.ceseConfirmado = true; },
  };
  const repositorio: RepositorioDeRelacionesLaborales = {
    ...almacen,
    buscarColaborador: async (dni) => personas.get(dni),
    listarConPersona: async () => relaciones,
    ejecutarSobreColaborador: async (_dni, operacion) => operacion(almacen),
  };
  return { repositorio, relaciones };
}
