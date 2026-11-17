import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({
  actor: vi.fn(),
  buscarModelo: vi.fn(),
  revalidatePath: vi.fn(),
  repositorioDeTurnos: {
    enTransaccionDePatronMensual: vi.fn(), guardarNuevasJornadasDelMes: vi.fn(), publicarEnLote: vi.fn(),
    buscarPorId: vi.fn(), obtenerOCrear: vi.fn(), colaboradorPerteneceAEquipo: vi.fn(), listarVigenciasConfirmadas: vi.fn(), consultarEstadoDeFechas: vi.fn(), horarioSemanalEstaProcesado: vi.fn(), buscarPublicado: vi.fn(), guardarCelda: vi.fn(), borrarCelda: vi.fn(), listarBorradoresDelEquipoEnRango: vi.fn() },
}));

vi.mock("next/cache", () => ({ revalidatePath: simulacro.revalidatePath }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/turnos/servicio", () => ({
  repositorioDeTurnos: simulacro.repositorioDeTurnos,
  repositorioDeModelosDeHorario: { buscarPorId: simulacro.buscarModelo },
}));

import { borrarCeldaDelBorrador, guardarBorradorDesdeGrilla, guardarCeldaDelBorrador, guardarPatronSemanalDelMes, publicarPlanSemanalDesdeGrilla, republicarPlanSemanalDesdeGrilla } from "./actions";

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.set(campo, valor);
  return datos;
}

describe("acciones de Horarios (borde del servidor)", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["Finanzas", { id: "f1", rol: "finanzas" }],
    ["Recursos Humanos", { id: "r1", rol: "recursos_humanos" }],
    ["un gerente sin grupos", { id: "g1", rol: "gerente_de_area", grupos: [] }],
    ["un gerente de un grupo que no gestiona asistencia", { id: "g2", rol: "gerente_de_area", grupos: [{ nombre: "Administración", gestionaAsistencia: false }] }],
  ])("rechaza a %s sin leer modelos ni planes", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);

    await expect(guardarCeldaDelBorrador(formulario({ sede: "Lima", horario: "modelo:m1", planId: "p1", dni: "00000001", fecha: "2026-09-01" }))).rejects.toThrow("No tiene permiso para editar planes semanales en borrador.");
    await expect(guardarBorradorDesdeGrilla("p1", "[]")).rejects.toThrow("No tiene permiso para editar planes semanales en borrador.");
    await expect(borrarCeldaDelBorrador(formulario({ planId: "p1", dni: "00000001", fecha: "2026-09-01" }))).rejects.toThrow("No tiene permiso para editar planes semanales en borrador.");
    await expect(publicarPlanSemanalDesdeGrilla(formulario({ planId: "p1", dni: "00000001" }))).rejects.toThrow("No tiene permiso para publicar planes semanales.");
    await expect(republicarPlanSemanalDesdeGrilla(formulario({ planId: "p1", dni: "00000001", motivo: "Corrección" }))).rejects.toThrow("No tiene permiso para republicar horarios semanales.");

    expect(simulacro.buscarModelo).not.toHaveBeenCalled();
  });

  it("un gerente no publica a una persona sin relación laboral confirmada: el error explica la causa y el siguiente paso", async () => {
    simulacro.actor.mockResolvedValue({ id: "g3", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] });
    simulacro.repositorioDeTurnos.buscarPorId.mockResolvedValue({ id: "p1", semana: "2026-09-07", equipo: "Tiendas", celdas: [] });
    simulacro.repositorioDeTurnos.colaboradorPerteneceAEquipo.mockResolvedValue(true);
    simulacro.repositorioDeTurnos.listarVigenciasConfirmadas.mockResolvedValue([]);

    await expect(publicarPlanSemanalDesdeGrilla(formulario({ planId: "p1", dni: "00000001" })))
      .rejects.toThrow(/relación laboral confirmada por Recursos Humanos.*registre y confirme/);
  });

  it("un gerente de Tiendas no edita, publica ni republica el plan semanal del grupo Taller", async () => {
    simulacro.actor.mockResolvedValue({ id: "g4", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] });
    simulacro.repositorioDeTurnos.buscarPorId.mockResolvedValue({ id: "p9", semana: "2026-09-07", equipo: "Taller", celdas: [] });

    await expect(guardarCeldaDelBorrador(formulario({ sede: "Lima", horario: "descanso", planId: "p9", dni: "00000001", fecha: "2026-09-07" }))).rejects.toThrow("No tiene permiso para editar planes semanales de este grupo.");
    await expect(guardarBorradorDesdeGrilla("p9", "[]")).rejects.toThrow("No tiene permiso para editar planes semanales de este grupo.");
    await expect(borrarCeldaDelBorrador(formulario({ planId: "p9", dni: "00000001", fecha: "2026-09-07" }))).rejects.toThrow("No tiene permiso para editar planes semanales de este grupo.");
    await expect(publicarPlanSemanalDesdeGrilla(formulario({ planId: "p9", dni: "00000001" }))).rejects.toThrow("No tiene permiso para publicar planes semanales de este grupo.");
    await expect(republicarPlanSemanalDesdeGrilla(formulario({ planId: "p9", dni: "00000001", motivo: "Corrección" }))).rejects.toThrow("No tiene permiso para republicar horarios semanales de este grupo.");
  });
});

describe("guardado mensual", () => {
  const repositorio = simulacro.repositorioDeTurnos;
  const gerente = { id: "g1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] };
  const fecha = "2030-09-03";
  const seleccion = { equipo: "Tiendas", dni: "00000001", fecha, horario: "descanso", sede: "Lima" };
  const plan = { id: "p1", semana: "2030-09-02", equipo: "Tiendas", celdas: [] };

  beforeEach(() => {
    vi.resetAllMocks();
    simulacro.actor.mockResolvedValue(gerente);
    repositorio.obtenerOCrear.mockResolvedValue(plan);
    repositorio.buscarPorId.mockResolvedValue(plan);
    repositorio.colaboradorPerteneceAEquipo.mockResolvedValue(true);
    repositorio.listarVigenciasConfirmadas.mockResolvedValue([{ ingreso: "2030-09-01", cese: null }]);
    repositorio.consultarEstadoDeFechas.mockResolvedValue({ cerradas: [], sinPeriodo: [] });
  });

  it.each([
    ["sin jornada previa", undefined],
    ["con jornada publicada", { sede: "Lima", entradaProgramada: "08:00", salidaProgramada: "17:00" }],
  ])("guardado mensual puntual %s", async (_nombre, publicado) => {
    repositorio.buscarPublicado.mockResolvedValue(publicado);

    await guardarCeldaDelBorrador(formulario(seleccion));

    expect(repositorio.obtenerOCrear).toHaveBeenCalledWith("2030-09-02", "Tiendas");
    expect(repositorio.guardarCelda).toHaveBeenCalledExactlyOnceWith({
      planId: "p1", dni: seleccion.dni, fecha, sede: null,
      entradaProgramada: null, salidaProgramada: null, descanso: true,
    });
  });

  it.each([
    ["fecha cerrada", () => repositorio.consultarEstadoDeFechas.mockResolvedValue({ cerradas: [fecha] }), /cerrad/],
    ["sin vigencia", () => repositorio.listarVigenciasConfirmadas.mockResolvedValue([]), /relación laboral/],
    ["semana procesada", () => repositorio.horarioSemanalEstaProcesado.mockResolvedValue(true), /procesado/],
    ["persona fuera del grupo", () => repositorio.colaboradorPerteneceAEquipo.mockResolvedValue(false), /no pertenece/],
    ["grupo fuera del alcance", () => simulacro.actor.mockResolvedValue({ ...gerente, grupos: [{ nombre: "Taller", gestionaAsistencia: true }] }), /este grupo/],
  ])("guardado mensual rechazado %s", async (_nombre, preparar, mensaje) => {
    preparar();

    await expect(guardarCeldaDelBorrador(formulario(seleccion))).rejects.toThrow(mensaje);
    expect(repositorio.obtenerOCrear).not.toHaveBeenCalled();
    expect(repositorio.guardarCelda).not.toHaveBeenCalled();
  });

  it("quita asignación mensual sin crear otro plan y mantiene las guardas", async () => {
    const datos = formulario(seleccion);
    repositorio.listarBorradoresDelEquipoEnRango.mockResolvedValue([{ planId: "p1", dni: seleccion.dni, fecha }]);

    await borrarCeldaDelBorrador(datos);
    expect(repositorio.borrarCelda).toHaveBeenCalledExactlyOnceWith("p1", seleccion.dni, fecha);
    expect(repositorio.obtenerOCrear).not.toHaveBeenCalled();

    repositorio.borrarCelda.mockClear();
    repositorio.buscarPublicado.mockResolvedValue({ fecha });
    await expect(borrarCeldaDelBorrador(datos)).rejects.toThrow(/publicado/);
    repositorio.buscarPublicado.mockReset();
    repositorio.consultarEstadoDeFechas.mockResolvedValue({ cerradas: [fecha] });
    await expect(borrarCeldaDelBorrador(datos)).rejects.toThrow(/cerrada/);
    repositorio.consultarEstadoDeFechas.mockResolvedValue({ cerradas: [] });
    repositorio.listarBorradoresDelEquipoEnRango.mockResolvedValue([]);
    await borrarCeldaDelBorrador(datos);
    expect(repositorio.borrarCelda).not.toHaveBeenCalled();
    expect(repositorio.obtenerOCrear).not.toHaveBeenCalled();
  });

  it("conserva el rechazo existente para un rol de solo lectura", async () => {
    simulacro.actor.mockResolvedValue({ id: "f1", rol: "finanzas" });

    await expect(guardarCeldaDelBorrador(formulario(seleccion))).rejects.toThrow(/No tiene permiso/);
    expect(repositorio.obtenerOCrear).not.toHaveBeenCalled();
    expect(repositorio.guardarCelda).not.toHaveBeenCalled();
  });
});


describe("patrón semanal mensual", () => {
  const repositorio = simulacro.repositorioDeTurnos;
  const gerente = { id: "g1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] };
  const dni = "00000001";
  const fechas = ["2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"];

  beforeEach(() => {
    vi.resetAllMocks();
    simulacro.actor.mockResolvedValue(gerente);
    repositorio.enTransaccionDePatronMensual.mockImplementation(async (_dni, ejecutar) => ejecutar(repositorio));
    repositorio.colaboradorPerteneceAEquipo.mockImplementation(async dniSolicitado => dniSolicitado === dni);
    repositorio.consultarEstadoDeFechas.mockResolvedValue({ cerradas: [] });
    repositorio.listarBorradoresDelEquipoEnRango.mockResolvedValue([]);
    repositorio.listarVigenciasConfirmadas.mockResolvedValue([{ ingreso: "2026-01-01", cese: null }]);
    repositorio.guardarNuevasJornadasDelMes.mockResolvedValue({ guardadas: fechas, omitidas: [] });
  });

  it.each([
    { caso: "gerente del grupo y colaborador asignado", equipo: "Tiendas", persona: dni, error: undefined },
    { caso: "grupo adulterado", equipo: "Otro grupo", persona: dni, error: "No tiene permiso para editar planes semanales de este grupo." },
    { caso: "colaborador ajeno", equipo: "Tiendas", persona: "00000002", error: "El colaborador no pertenece al equipo operativo del plan." },
  ])("G5 valida alcance con $caso", async ({ equipo, persona, error }) => {
    const resultado = await guardarPatronSemanalDelMes(formulario({ equipo, dni: persona, mes: "2026-04", "dia-0": "descanso" }))
      .catch((causa: unknown) => causa);

    if (error) {
      expect(resultado, "la acción mensual valida el grupo y el colaborador solicitados").toMatchObject({ message: error });
      expect(repositorio.guardarNuevasJornadasDelMes).not.toHaveBeenCalled();
      expect(simulacro.revalidatePath).not.toHaveBeenCalled();
      if (equipo !== "Tiendas") expect(repositorio.enTransaccionDePatronMensual).not.toHaveBeenCalled();
      else expect(repositorio.listarVigenciasConfirmadas).not.toHaveBeenCalled();
    } else {
      expect(resultado, "la acción mensual valida el grupo y el colaborador solicitados").toEqual({ guardadas: fechas, omitidas: [] });
      expect(repositorio.guardarNuevasJornadasDelMes).toHaveBeenCalledTimes(1);
      expect(simulacro.revalidatePath).toHaveBeenCalledWith("/turnos");
    }
    expect(repositorio.publicarEnLote).not.toHaveBeenCalled();
  });
});
