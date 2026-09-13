import { describe, expect, it } from "vitest";

import { resumirAsistenciasSemanales } from "./resumen-semanal";

const dias = ["2031-03-10", "2031-03-11", "2031-03-12", "2031-03-13", "2031-03-14", "2031-03-15", "2031-03-16"];

describe("resumir asistencias semanales", () => {
  it("ordena colaboradores del grupo y conserva siete jornadas con sus estados", () => {
    const resumen = resumirAsistenciasSemanales(
      [
        { idHuellero: "HU-2", nombre: "Zoe Rivera" },
        { idHuellero: "HU-1", nombre: "Ana Torres" },
      ],
      dias,
      [
        {
          idHuellero: "HU-1", fecha: "2031-03-10", estado: "confirmada", estadoManual: null,
          entrada: "2031-03-10T09:03", salida: "2031-03-10T18:02", sedeProgramada: "Centro",
          entradaPropuesta: null, salidaPropuesta: null, hayMarcasCrudas: true, enPeriodoCerrado: false,
        },
        {
          idHuellero: "HU-2", fecha: "2031-03-11", estado: "manual", estadoManual: "feriado",
          entrada: null, salida: null, sedeProgramada: null,
          entradaPropuesta: null, salidaPropuesta: null, hayMarcasCrudas: false, enPeriodoCerrado: false,
        },
      ],
    );

    expect(resumen.map(({ nombre }) => nombre)).toEqual(["Ana Torres", "Zoe Rivera"]);
    expect(resumen[0].jornadas).toHaveLength(7);
    expect(resumen[0].jornadas[0]).toMatchObject({ fecha: "2031-03-10", estado: "registrada", sede: "Centro", entrada: "09:03", salida: "18:02" });
    expect(resumen[0].jornadas[1]).toMatchObject({ fecha: "2031-03-11", estado: "sin-planificacion" });
    expect(resumen[1].jornadas[1]).toMatchObject({ fecha: "2031-03-11", estado: "registrada", motivo: "Feriado" });
  });

  it("expone la causa de una jornada incompleta y bloquea una jornada liquidada", () => {
    const [colaborador] = resumirAsistenciasSemanales([{ idHuellero: "HU-1", nombre: "Ana Torres" }], dias, [
      {
        idHuellero: "HU-1", fecha: "2031-03-10", estado: "pendiente", estadoManual: null,
        entrada: null, salida: null, sedeProgramada: "Centro",
        entradaPropuesta: "2031-03-10T09:00", salidaPropuesta: null, hayMarcasCrudas: true, enPeriodoCerrado: false,
      },
      {
        idHuellero: "HU-1", fecha: "2031-03-11", estado: "confirmada", estadoManual: null,
        entrada: "2031-03-11T09:00", salida: "2031-03-11T18:00", sedeProgramada: "Centro",
        entradaPropuesta: null, salidaPropuesta: null, hayMarcasCrudas: false, enPeriodoCerrado: true,
      },
    ]);

    expect(colaborador.jornadas[0]).toMatchObject({ estado: "pendiente-de-revision", causa: "Marcas incompletas" });
    expect(colaborador.jornadas[1]).toMatchObject({ estado: "liquidado", bloqueada: true });
  });
});
