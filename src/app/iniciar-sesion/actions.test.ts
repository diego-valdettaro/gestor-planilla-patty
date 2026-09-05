import { beforeEach, describe, expect, it, vi } from "vitest";

const { iniciarSesionDelServidor } = vi.hoisted(() => ({ iniciarSesionDelServidor: vi.fn() }));

vi.mock("@/autenticacion/sesion-del-servidor", () => ({ iniciarSesionDelServidor }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { iniciarSesionDesdeFormulario } from "./actions";

describe("iniciarSesionDesdeFormulario", () => {
  beforeEach(() => {
    iniciarSesionDelServidor.mockReset();
  });

  it("devuelve un error recuperable cuando las credenciales no son válidas", async () => {
    iniciarSesionDelServidor.mockRejectedValue(new Error("Las credenciales no son válidas."));
    const formulario = new FormData();
    formulario.set("nombreUsuario", "usuario");
    formulario.set("contrasena", "incorrecta");

    await expect(iniciarSesionDesdeFormulario({}, formulario)).resolves.toEqual({
      error: "Las credenciales no son válidas.",
    });
  });
});
