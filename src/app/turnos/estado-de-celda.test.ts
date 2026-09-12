import { describe, expect, it } from "vitest";

import { ESTADOS_DE_HORARIO, difiereDelPublicado, estadoDeCelda, estadoDeSemana } from "./estado-de-celda";

const turno = {
  sede: "Taller",
  modeloHorarioId: "modelo-1",
  entradaProgramada: "09:00",
  salidaProgramada: "18:00",
  descanso: false,
};
const descanso = { sede: "Taller", modeloHorarioId: null, entradaProgramada: null, salidaProgramada: null, descanso: true };

describe("estadoDeCelda", () => {
  it("devuelve 'liquidado' cuando la semana del colaborador ya está procesada, con o sin borrador o publicado", () => {
    expect(estadoDeCelda(undefined, undefined, true)).toBe("liquidado");
    expect(estadoDeCelda(turno, undefined, true)).toBe("liquidado");
    expect(estadoDeCelda(undefined, turno, true)).toBe("liquidado");
    expect(estadoDeCelda({ ...turno, entradaProgramada: "10:00" }, turno, true)).toBe("liquidado");
  });

  it("devuelve 'borrador-editable' cuando no hay turno publicado, haya o no celda en el borrador", () => {
    expect(estadoDeCelda(undefined, undefined, false)).toBe("borrador-editable");
    expect(estadoDeCelda(turno, undefined, false)).toBe("borrador-editable");
    expect(estadoDeCelda(descanso, undefined, false)).toBe("borrador-editable");
  });

  it("devuelve 'publicado' cuando hay turno publicado y el borrador no lo cambia", () => {
    expect(estadoDeCelda(undefined, turno, false)).toBe("publicado");
    expect(estadoDeCelda({ ...turno }, turno, false)).toBe("publicado");
    expect(estadoDeCelda({ ...turno, modeloHorarioId: undefined }, { ...turno, modeloHorarioId: null }, false)).toBe("publicado");
  });

  it("devuelve 'cambios-sin-publicar' cuando el borrador edita una celda ya publicada", () => {
    expect(estadoDeCelda({ ...turno, sede: "Tiendas" }, turno, false)).toBe("cambios-sin-publicar");
    expect(estadoDeCelda({ ...turno, modeloHorarioId: "modelo-2" }, turno, false)).toBe("cambios-sin-publicar");
    expect(estadoDeCelda({ ...turno, entradaProgramada: "08:00" }, turno, false)).toBe("cambios-sin-publicar");
    expect(estadoDeCelda({ ...turno, salidaProgramada: "19:00" }, turno, false)).toBe("cambios-sin-publicar");
    expect(estadoDeCelda(descanso, turno, false)).toBe("cambios-sin-publicar");
  });

  it("clasifica cada combinación de entradas en exactamente uno de los cuatro estados", () => {
    const celdas = [undefined, turno, { ...turno, entradaProgramada: "07:30" }, descanso];
    const publicados = [undefined, turno, descanso];
    for (const celda of celdas) {
      for (const publicado of publicados) {
        for (const semanaLiquidada of [false, true]) {
          const estado = estadoDeCelda(celda, publicado, semanaLiquidada);
          expect(ESTADOS_DE_HORARIO).toContain(estado);
        }
      }
    }
  });

  it("una celda 'Cambios sin publicar' pasa a 'Publicado' cuando se republica el turno", () => {
    const editada = { ...turno, entradaProgramada: "08:00" };
    expect(estadoDeCelda(editada, turno, false)).toBe("cambios-sin-publicar");
    // Al republicar, el turno publicado queda igual a la celda del borrador.
    expect(estadoDeCelda(editada, editada, false)).toBe("publicado");
  });
});

describe("difiereDelPublicado", () => {
  it("ignora la diferencia entre modeloHorarioId nulo e indefinido", () => {
    expect(difiereDelPublicado({ ...turno, modeloHorarioId: undefined }, { ...turno, modeloHorarioId: null })).toBe(false);
  });

  it("detecta el cambio de descanso a turno con horas", () => {
    expect(difiereDelPublicado(turno, descanso)).toBe(true);
  });

  it("compara el significado de la jornada aunque el booleano legado difiera", () => {
    expect(difiereDelPublicado({ ...turno, descanso: undefined }, turno)).toBe(false);
  });
});

describe("estadoDeSemana", () => {
  it("prioriza 'liquidado' sobre cualquier otra condición", () => {
    expect(estadoDeSemana({ semanaPublicada: true, semanaLiquidada: true, hayCambiosSinPublicar: true })).toBe("liquidado");
  });

  it("es 'borrador-editable' mientras la semana no esté publicada", () => {
    expect(estadoDeSemana({ semanaPublicada: false, semanaLiquidada: false, hayCambiosSinPublicar: false })).toBe("borrador-editable");
  });

  it("distingue 'publicado' de 'cambios-sin-publicar' según haya ediciones en el borrador", () => {
    expect(estadoDeSemana({ semanaPublicada: true, semanaLiquidada: false, hayCambiosSinPublicar: false })).toBe("publicado");
    expect(estadoDeSemana({ semanaPublicada: true, semanaLiquidada: false, hayCambiosSinPublicar: true })).toBe("cambios-sin-publicar");
  });
});
