import { ErrorDeMesYaConfirmado, type ConstanciaDePago, RepositorioDeConstancias } from "./constancias-de-pago";

// Apoyo de pruebas: adaptadores en memoria del repositorio de constancias (#130).

export function crearRepositorioDeConstanciasEnMemoria(opciones: { nombreDe?: (cuentaId: string) => string } = {}) {
  const constancias: ConstanciaDePago[] = [];
  const repositorio: RepositorioDeConstancias = {
    confirmar: async (nueva) => {
      // Como el índice único de la base: un mes, una constancia.
      if (constancias.some(({ mesDePago }) => mesDePago === nueva.mesDePago)) throw new ErrorDeMesYaConfirmado();
      const constancia: ConstanciaDePago = { ...nueva, confirmadaPor: opciones.nombreDe?.(nueva.confirmadaPorId) ?? nueva.confirmadaPorId };
      constancias.push(constancia);
      return constancia;
    },
    buscar: async (mes) => constancias.find(({ mesDePago }) => mesDePago === mes),
    mesConPagoConfirmado: async (mes) => constancias.some(({ mesDePago }) => mesDePago === mes),
  };
  return { repositorio, guardadas: () => constancias };
}

/** Para las pruebas que solo necesitan saber si el mes está pagado: sin constancia que leer ni guardar. */
export function conIndicadorDePago(mesConPagoConfirmado: RepositorioDeConstancias["mesConPagoConfirmado"]): RepositorioDeConstancias {
  return {
    mesConPagoConfirmado,
    buscar: async () => undefined,
    confirmar: async () => {
      throw new Error("este simulacro no guarda constancias");
    },
  };
}
