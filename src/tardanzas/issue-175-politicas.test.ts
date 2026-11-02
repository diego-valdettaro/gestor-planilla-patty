import { describe, expect, it, vi } from "vitest";
import { configurarPoliticaDePenalizacionPorTardanzas, type RepositorioDeTardanzas, type SolicitudDePoliticaDePenalizacionPorTardanzas } from "./politica-de-penalizacion";

const admin = { id: "admin", rol: "administrador" as const };
const solicitud = { grupo: "Taller", toleranciaEnMinutos: 10, tardanzasAcumuladas: 3, horasPenalizadas: 1 };
type Politica = typeof solicitud;
function contexto(gestiona: boolean, inicial?: Politica) {
  const politicas = new Map<string, Politica>();
  if (inicial) politicas.set(inicial.grupo, inicial);
  const guardarPolitica = vi.fn(async () => undefined);
  const repositorio = {
    guardarPolitica,
    buscarPoliticaVigente: async () => undefined,
    contarTardanzas: async () => 0,
    obtenerGrupo: async (nombre: string) => ({ nombre, gestionaAsistencia: gestiona }),
    guardarPoliticaDeGrupo: async (p: Politica) => { politicas.set(p.grupo, p); },
  } as RepositorioDeTardanzas;
  return { repositorio, politicas, guardarPolitica };
}

describe("G04 política única por grupo", () => {
  const casos = [
    { fila: "R10", gestiona: true, inicial: undefined, siguiente: solicitud, error: false },
    { fila: "R11", gestiona: true, inicial: solicitud, siguiente: { ...solicitud, toleranciaEnMinutos: 15 }, error: false },
    { fila: "R12", gestiona: false, inicial: undefined, siguiente: solicitud, error: true },
  ];
  it.each(casos)("$fila respeta la política y la gestión del grupo", async ({ gestiona, inicial, siguiente, error }) => {
    const { repositorio, politicas } = contexto(gestiona, inicial);
    const operacion = configurarPoliticaDePenalizacionPorTardanzas(repositorio, admin, siguiente as unknown as SolicitudDePoliticaDePenalizacionPorTardanzas);
    if (error) {
      await expect(operacion).rejects.toThrow(/no gestiona asistencia/i);
      expect(politicas.size).toBe(0);
    } else {
      await expect(operacion).resolves.toBeUndefined();
      expect([...politicas.values()]).toMatchObject([siguiente]);
    }
  });

  it.each([
    ["una sede de un grupo con asistencia", true],
    ["una sede de un grupo sin asistencia", false],
  ])("rechaza la solicitud operativa antigua por %s sin guardar", async (_caso, gestiona) => {
    const { repositorio, guardarPolitica } = contexto(gestiona);
    const solicitudAntigua = {
      sede: "Sede histórica",
      toleranciaEnMinutos: 10,
      tardanzasAcumuladas: 3,
      horasPenalizadas: 1,
      version: 2,
      vigenteDesde: "2026-09-01",
    };

    let rechazada = false;
    try {
      await configurarPoliticaDePenalizacionPorTardanzas(
        repositorio,
        admin,
        solicitudAntigua as unknown as SolicitudDePoliticaDePenalizacionPorTardanzas,
      );
    } catch {
      rechazada = true;
    }

    expect(guardarPolitica).not.toHaveBeenCalled();
    expect(rechazada).toBe(true);
  });
});
