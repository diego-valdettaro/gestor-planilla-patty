import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  iniciarSesion,
  type CuentaLocal,
  type RepositorioDeCuentas,
} from "./iniciar-sesion";

function crearRepositorioEnMemoria(cuenta?: CuentaLocal): {
  repositorio: RepositorioDeCuentas;
  sesiones: Array<{ cuentaId: string; tokenHash: string; venceEn: Date }>;
} {
  const sesiones: Array<{ cuentaId: string; tokenHash: string; venceEn: Date }> = [];

  return {
    repositorio: {
      buscarPorNombreUsuario: async () => cuenta,
      guardarSesion: async (sesion) => {
        sesiones.push(sesion);
      },
    },
    sesiones,
  };
}

describe("iniciarSesion", () => {
  it("crea una sesión de Operaciones sin guardar el token en texto plano", async () => {
    const { repositorio, sesiones } = crearRepositorioEnMemoria({
      id: "cuenta-1",
      nombreUsuario: "operaciones",
      hashContrasena: "hash-correcto",
      rol: "operaciones",
    });

    const resultado = await iniciarSesion(
      repositorio,
      { nombreUsuario: "operaciones", contrasena: "secreto" },
      {
        verificar: async (hash, contrasena) =>
          hash === "hash-correcto" && contrasena === "secreto",
      },
      () => "token-seguro",
      new Date("2026-09-01T10:00:00.000Z"),
    );

    expect(resultado).toEqual({
      actor: { id: "cuenta-1", rol: "operaciones" },
      token: "token-seguro",
    });
    expect(sesiones).toEqual([
      {
        cuentaId: "cuenta-1",
        tokenHash: createHash("sha256").update("token-seguro").digest("hex"),
        venceEn: new Date("2026-09-15T10:00:00.000Z"),
      },
    ]);
  });

  it("rechaza credenciales inválidas sin crear una sesión", async () => {
    const { repositorio, sesiones } = crearRepositorioEnMemoria({
      id: "cuenta-1",
      nombreUsuario: "operaciones",
      hashContrasena: "hash-correcto",
      rol: "operaciones",
    });

    await expect(
      iniciarSesion(
        repositorio,
        { nombreUsuario: "operaciones", contrasena: "incorrecta" },
        { verificar: async () => false },
        () => "token-seguro",
        new Date("2026-09-01T10:00:00.000Z"),
      ),
    ).rejects.toThrow("Las credenciales no son válidas.");

    expect(sesiones).toHaveLength(0);
  });
});
