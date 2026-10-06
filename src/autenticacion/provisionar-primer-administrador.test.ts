import { describe, expect, it } from "vitest";

import {
  provisionarPrimerAdministrador,
  type RepositorioDeProvisionamiento,
} from "./provisionar-primer-administrador";

describe("provisionarPrimerAdministrador", () => {
  it("crea la primera cuenta con el rol de Administrador del sistema y no guarda la contraseña", async () => {
    const cuentas: Array<{ nombreUsuario: string; hashContrasena: string; rol: string }> = [];
    const repositorio: RepositorioDeProvisionamiento = {
      existeAlgunaCuenta: async () => false,
      guardarCuenta: async (cuenta) => {
        cuentas.push(cuenta);
      },
    };

    await provisionarPrimerAdministrador(
      repositorio,
      { nombreUsuario: "admin", contrasena: "secreto" },
      async () => "hash-argon2id",
    );

    expect(cuentas).toEqual([
      { nombreUsuario: "admin", hashContrasena: "hash-argon2id", rol: "administrador" },
    ]);
  });

  it("no permite aprovisionar una segunda cuenta inicial", async () => {
    const repositorio: RepositorioDeProvisionamiento = {
      existeAlgunaCuenta: async () => true,
      guardarCuenta: async () => undefined,
    };

    await expect(
      provisionarPrimerAdministrador(
        repositorio,
        { nombreUsuario: "admin", contrasena: "secreto" },
        async () => "hash-argon2id",
      ),
    ).rejects.toThrow("El aprovisionamiento inicial solo puede ejecutarse una vez.");
  });
});
