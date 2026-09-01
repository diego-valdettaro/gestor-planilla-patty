import { describe, expect, it } from "vitest";

import {
  provisionarPrimeraAdministracion,
  type RepositorioDeProvisionamiento,
} from "./provisionar-primera-administracion";

describe("provisionarPrimeraAdministracion", () => {
  it("crea la primera cuenta con el rol de Administración y no guarda la contraseña", async () => {
    const cuentas: Array<{ nombreUsuario: string; hashContrasena: string; rol: string }> = [];
    const repositorio: RepositorioDeProvisionamiento = {
      existeAlgunaCuenta: async () => false,
      guardarCuenta: async (cuenta) => {
        cuentas.push(cuenta);
      },
    };

    await provisionarPrimeraAdministracion(
      repositorio,
      { nombreUsuario: "admin", contrasena: "secreto" },
      async () => "hash-argon2id",
    );

    expect(cuentas).toEqual([
      { nombreUsuario: "admin", hashContrasena: "hash-argon2id", rol: "administracion" },
    ]);
  });

  it("no permite aprovisionar una segunda cuenta inicial", async () => {
    const repositorio: RepositorioDeProvisionamiento = {
      existeAlgunaCuenta: async () => true,
      guardarCuenta: async () => undefined,
    };

    await expect(
      provisionarPrimeraAdministracion(
        repositorio,
        { nombreUsuario: "admin", contrasena: "secreto" },
        async () => "hash-argon2id",
      ),
    ).rejects.toThrow("El aprovisionamiento inicial solo puede ejecutarse una vez.");
  });
});
