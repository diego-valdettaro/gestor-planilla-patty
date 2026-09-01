import { describe, expect, it } from "vitest";

import { hashDeContrasena, verificarContrasena } from "./contrasenas";

describe("contrasenas", () => {
  it("guarda contraseñas con Argon2id", async () => {
    const hash = await hashDeContrasena("secreto de prueba");

    await expect(verificarContrasena(hash, "secreto de prueba")).resolves.toBe(true);
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });
});
