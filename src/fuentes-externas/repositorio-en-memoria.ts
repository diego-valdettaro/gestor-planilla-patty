import { randomUUID } from "node:crypto";

import { claveDeImporte } from "./duplicados";
import type { AlmacenDeFuentesExternas, ConfirmacionDeFuente, ImporteExterno, ImportacionDeFuente, RepositorioDeFuentesExternas } from "./gestionar-fuentes-externas";

// Apoyo de pruebas: repositorio en memoria. Los DNI y nombres que las pruebas registran son sintéticos.
export function crearRepositorioEnMemoria(personas: Record<string, string> = {}) {
  let importes: ImporteExterno[] = [];
  let confirmaciones: ConfirmacionDeFuente[] = [];
  let importaciones: ImportacionDeFuente[] = [];
  const mesesFinalizados = new Set<string>();

  const almacen: AlmacenDeFuentesExternas = {
    listarImportes: async (tipo, mes) => importes.filter((importe) => importe.tipoDeFuente === tipo && importe.mesDeAplicacion === mes && importe.anuladoEn === null),
    buscarImporte: async (id) => importes.find((importe) => importe.id === id),
    insertarImporte: async (nuevo) => {
      const clave = claveDeImporte(nuevo);
      if (importes.some((importe) => importe.anuladoEn === null && claveDeImporte(importe) === clave)) return undefined;
      const importe: ImporteExterno = {
        id: randomUUID(), nombre: personas[nuevo.dni] ?? nuevo.dni, tipoDeFuente: nuevo.tipoDeFuente, dni: nuevo.dni, concepto: nuevo.concepto,
        fechaDelHecho: nuevo.fechaDelHecho, mesDeDevengue: nuevo.mesDeDevengue, mesDeAplicacion: nuevo.mesDeAplicacion, monto: nuevo.monto,
        procedencia: nuevo.procedencia, registradoPorId: nuevo.responsableId, registradoPor: `usuario-${nuevo.responsableId}`, registradoEn: new Date(),
        anuladoEn: null, motivoDeAnulacion: null, importacionId: nuevo.importacionId ?? null,
      };
      importes.push(importe);
      return importe;
    },
    anularImporte: async (id, motivo, anuladoEn) => {
      const importe = importes.find((existente) => existente.id === id);
      if (!importe || importe.anuladoEn !== null) return false;
      Object.assign(importe, { anuladoEn, motivoDeAnulacion: motivo });
      return true;
    },
    buscarConfirmacion: async (tipo, mes) => confirmaciones.find((c) => c.tipoDeFuente === tipo && c.mesDeAplicacion === mes),
    confirmar: async (tipo, mes, responsableId, confirmadaEn) => {
      if (confirmaciones.some((c) => c.tipoDeFuente === tipo && c.mesDeAplicacion === mes)) return false;
      confirmaciones.push({ tipoDeFuente: tipo, mesDeAplicacion: mes, confirmadaPorId: responsableId, confirmadaPor: `usuario-${responsableId}`, confirmadaEn });
      return true;
    },
    quitarConfirmacion: async (tipo, mes) => {
      const antes = confirmaciones.length;
      confirmaciones = confirmaciones.filter((c) => !(c.tipoDeFuente === tipo && c.mesDeAplicacion === mes));
      return confirmaciones.length < antes;
    },
    buscarImportacionVigente: async (tipo, mes) => {
      const importacion = importaciones.find((candidata) => candidata.tipoDeFuente === tipo && candidata.mesDeAplicacion === mes && candidata.reemplazadaEn === null);
      return importacion && { ...importacion, importesVigentes: importes.filter((importe) => importe.importacionId === importacion.id && importe.anuladoEn === null).length };
    },
    insertarImportacion: async (nueva) => {
      const importacion: ImportacionDeFuente = { id: randomUUID(), ...nueva, usuario: `usuario-${nueva.usuarioId}`, reemplazadaEn: null };
      importaciones.push(importacion);
      return importacion;
    },
    reemplazarImportacion: async (id, motivo, reemplazadaEn) => {
      const importacion = importaciones.find((candidata) => candidata.id === id);
      if (importacion) importacion.reemplazadaEn = reemplazadaEn;
      const propios = importes.filter((importe) => importe.importacionId === id && importe.anuladoEn === null);
      for (const importe of propios) Object.assign(importe, { anuladoEn: reemplazadaEn, motivoDeAnulacion: motivo });
      return propios.length;
    },
    mesFinalizado: async (mes) => mesesFinalizados.has(mes),
  };

  const repositorio: RepositorioDeFuentesExternas = {
    ...almacen,
    buscarPersona: async (dni) => (dni in personas ? { nombre: personas[dni] } : undefined),
    listarImportesDelMes: async (mes) => importes.filter((importe) => importe.mesDeAplicacion === mes && importe.anuladoEn === null),
    listarConfirmacionesDelMes: async (mes) => confirmaciones.filter((c) => c.mesDeAplicacion === mes),
    // Como una transacción: si la operación falla, el estado vuelve al de antes.
    ejecutarSobreFuente: async (_tipo, _mes, operacion) => {
      const respaldoDeImportes = importes.map((importe) => ({ ...importe }));
      const respaldoDeConfirmaciones = confirmaciones.map((c) => ({ ...c }));
      const respaldoDeImportaciones = importaciones.map((importacion) => ({ ...importacion }));
      try {
        return await operacion(almacen);
      } catch (error) {
        importes = respaldoDeImportes;
        confirmaciones = respaldoDeConfirmaciones;
        importaciones = respaldoDeImportaciones;
        throw error;
      }
    },
  };
  return { repositorio, mesesFinalizados, importes: () => importes, confirmaciones: () => confirmaciones, importaciones: () => importaciones };
}
