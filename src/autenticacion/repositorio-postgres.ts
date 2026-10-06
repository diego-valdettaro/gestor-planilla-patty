import { and, asc, eq, gt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { cuentasLocales, gerentesDeGrupo, grupos, sesiones } from "@/db/schema";

import type { RepositorioDeGestionDeCuentas } from "./gestionar-cuentas";
import type { CuentaLocal, RepositorioDeCuentas, SesionPersistida } from "./iniciar-sesion";
import type { Actor, GrupoAsignado } from "./permisos";

export interface CuentaConGrupos {
  id: string;
  nombreUsuario: string;
  rol: CuentaLocal["rol"];
  grupos: string[];
}

export interface GrupoConGerente {
  nombre: string;
  gestionaAsistencia: boolean;
  gerenteId: string | null;
}

export class RepositorioPostgresDeCuentas implements RepositorioDeCuentas, RepositorioDeGestionDeCuentas {
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

  async eliminarSesion(tokenHash: string): Promise<void> {
    await this.db.delete(sesiones).where(eq(sesiones.tokenHash, tokenHash));
  }

  async buscarActorPorTokenHash(tokenHash: string, ahora: Date): Promise<Actor | undefined> {
    const [sesion] = await this.db
      .select({ id: cuentasLocales.id, rol: cuentasLocales.rol, nombreUsuario: cuentasLocales.nombreUsuario })
      .from(sesiones)
      .innerJoin(cuentasLocales, eq(sesiones.cuentaId, cuentasLocales.id))
      .where(and(eq(sesiones.tokenHash, tokenHash), gt(sesiones.venceEn, ahora)));
    if (!sesion) return undefined;

    return { ...sesion, grupos: sesion.rol === "gerente_de_area" ? await this.gruposAsignadosA(sesion.id) : [] };
  }

  async gruposAsignadosA(cuentaId: string): Promise<GrupoAsignado[]> {
    return this.db
      .select({ nombre: grupos.nombre, gestionaAsistencia: grupos.gestionaAsistencia })
      .from(gerentesDeGrupo)
      .innerJoin(grupos, eq(gerentesDeGrupo.grupo, grupos.nombre))
      .where(eq(gerentesDeGrupo.cuentaId, cuentaId))
      .orderBy(asc(grupos.nombre));
  }

  async listarCuentas(): Promise<CuentaConGrupos[]> {
    const cuentas = await this.db
      .select({ id: cuentasLocales.id, nombreUsuario: cuentasLocales.nombreUsuario, rol: cuentasLocales.rol })
      .from(cuentasLocales)
      .orderBy(asc(cuentasLocales.nombreUsuario));
    const asignaciones = await this.db.select({ grupo: gerentesDeGrupo.grupo, cuentaId: gerentesDeGrupo.cuentaId }).from(gerentesDeGrupo).orderBy(asc(gerentesDeGrupo.grupo));

    return cuentas.map((cuenta) => ({
      ...cuenta,
      grupos: asignaciones.filter((asignacion) => asignacion.cuentaId === cuenta.id).map((asignacion) => asignacion.grupo),
    }));
  }

  async listarGruposConGerente(): Promise<GrupoConGerente[]> {
    const filas = await this.db
      .select({ nombre: grupos.nombre, gestionaAsistencia: grupos.gestionaAsistencia, gerenteId: gerentesDeGrupo.cuentaId })
      .from(grupos)
      .leftJoin(gerentesDeGrupo, eq(gerentesDeGrupo.grupo, grupos.nombre))
      .orderBy(asc(grupos.nombre));

    return filas;
  }

  async buscarCuentaPorId(id: string): Promise<{ id: string; nombreUsuario: string; rol: CuentaLocal["rol"] } | undefined> {
    const [cuenta] = await this.db
      .select({ id: cuentasLocales.id, nombreUsuario: cuentasLocales.nombreUsuario, rol: cuentasLocales.rol })
      .from(cuentasLocales)
      .where(eq(cuentasLocales.id, id));
    return cuenta;
  }

  async existeGrupo(nombre: string): Promise<boolean> {
    const [grupo] = await this.db.select({ nombre: grupos.nombre }).from(grupos).where(eq(grupos.nombre, nombre));
    return Boolean(grupo);
  }

  async buscarGerenteDelGrupo(grupo: string): Promise<string | undefined> {
    const [asignacion] = await this.db.select({ cuentaId: gerentesDeGrupo.cuentaId }).from(gerentesDeGrupo).where(eq(gerentesDeGrupo.grupo, grupo));
    return asignacion?.cuentaId;
  }

  async asignarGerente(grupo: string, cuentaId: string): Promise<boolean> {
    const insertadas = await this.db.insert(gerentesDeGrupo).values({ grupo, cuentaId }).onConflictDoNothing().returning({ grupo: gerentesDeGrupo.grupo });
    return insertadas.length === 1;
  }

  async quitarGerente(grupo: string): Promise<void> {
    await this.db.delete(gerentesDeGrupo).where(eq(gerentesDeGrupo.grupo, grupo));
  }

  async existeAlgunaCuenta(): Promise<boolean> {
    const [cuenta] = await this.db.select({ id: cuentasLocales.id }).from(cuentasLocales).limit(1);
    return Boolean(cuenta);
  }

  async guardarCuenta(cuenta: Omit<CuentaLocal, "id">): Promise<void> {
    await this.db.insert(cuentasLocales).values(cuenta);
  }
}
