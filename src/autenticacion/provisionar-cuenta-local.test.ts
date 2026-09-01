import { describe, expect, it } from "vitest";

import type { CuentaLocal, RepositorioDeCuentas } from "./iniciar-sesion";
import { provisionarCuentaLocal } from "./provisionar-cuenta-local";

describe("provisionarCuentaLocal", () => {
  it("crea una cuenta de Operaciones sin exponer la contraseña", async () => {
    const cuentas: Array<Omit<CuentaLocal, "id">> = [];
    const repositorio: RepositorioDeCuentas & {
      guardarCuenta(cuenta: Omit<CuentaLocal, "id">): Promise<void>;
    } = {
      buscarPorNombreUsuario: async () => undefined,
      guardarSesion: async () => undefined,
      guardarCuenta: async (cuenta) => {
        cuentas.push(cuenta);
      },
    };

    await provisionarCuentaLocal(
      repositorio,
      { nombreUsuario: "operaciones", contrasena: "secreto", rol: "operaciones" },
      async () => "hash-argon2id",
    );

    expect(cuentas).toEqual([
      { nombreUsuario: "operaciones", hashContrasena: "hash-argon2id", rol: "operaciones" },
    ]);
  });
});
