import { and, eq, gt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { Actor } from "@/colaboradores/registrar-colaborador";
import * as schema from "@/db/schema";
import { cuentasLocales, sesiones } from "@/db/schema";

import type { CuentaLocal, RepositorioDeCuentas, SesionPersistida } from "./iniciar-sesion";

export class RepositorioPostgresDeCuentas implements RepositorioDeCuentas {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async buscarPorNombreUsuario(nombreUsuario: string): Promise<CuentaLocal | undefined> {
    const [cuenta] = await this.db
      .select({
        id: cuentasLocales.id,
        nombreUsuario: cuentasLocales.nombreUsuario,
        hashContrasena: cuentasLocales.hashContrasena,
        rol: cuentasLocales.rol,
      })
      .from(cuentasLocales)
      .where(eq(cuentasLocales.nombreUsuario, nombreUsuario));

    return cuenta;
  }

  async guardarSesion(sesion: SesionPersistida): Promise<void> {
    await this.db.insert(sesiones).values(sesion);
  }

  async buscarActorPorTokenHash(tokenHash: string, ahora: Date): Promise<Actor | undefined> {
    const [sesion] = await this.db
      .select({ id: cuentasLocales.id, rol: cuentasLocales.rol })
      .from(sesiones)
      .innerJoin(cuentasLocales, eq(sesiones.cuentaId, cuentasLocales.id))
      .where(and(eq(sesiones.tokenHash, tokenHash), gt(sesiones.venceEn, ahora)));

    return sesion;
  }

  async existeAlgunaCuenta(): Promise<boolean> {
    const [cuenta] = await this.db.select({ id: cuentasLocales.id }).from(cuentasLocales).limit(1);
    return Boolean(cuenta);
  }

  async guardarCuenta(cuenta: Omit<CuentaLocal, "id">): Promise<void> {
    await this.db.insert(cuentasLocales).values(cuenta);
  }
}
