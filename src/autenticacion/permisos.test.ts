import { describe, expect, it } from "vitest";

import {
  NOMBRE_DE_ROL,
  ROLES,
  exigir,
  puedeAdministrarCuentas,
  puedeAdministrarPersonalDelGrupo,
  puedeConfigurarGlobalmente,
  puedeConsultarAsistencias,
  puedeConsultarConfiguracion,
  puedeAprobarAsistenciaDelGrupo,
  puedeConsultarHorarios,
  puedeConsultarPeriodos,
  puedeConsultarRelacionesLaborales,
  puedeGestionarCalendarioLaboral,
  puedeGestionarPagos,
  puedeGestionarPeriodos,
  puedeGestionarRelacionesLaborales,
  puedeImportarMarcas,
  puedeImportarMarcasDelGrupo,
  puedeOperarAsistenciaDelGrupo,
  puedeRevisarAsistencias,
  rolesQueSePuedenCrear,
  type Actor,
  type Rol,
} from "./permisos";

const TIENDAS = { nombre: "Tiendas", gestionaAsistencia: true };
const TALLER = { nombre: "Taller", gestionaAsistencia: true };
const ADMINISTRACION = { nombre: "Administración", gestionaAsistencia: false };

function actor(rol: Rol, grupos: Actor["grupos"] = []): Actor {
  return { id: `cuenta-${rol}`, rol, grupos };
}

const administrador = actor("administrador");
const gerenteDeTiendas = actor("gerente_de_area", [TIENDAS]);
const gerenteDeVariosGrupos = actor("gerente_de_area", [TIENDAS, TALLER]);
const gerenteDeAdministracion = actor("gerente_de_area", [ADMINISTRACION]);
const gerenteSinGrupos = actor("gerente_de_area");
const finanzas = actor("finanzas");
const recursosHumanos = actor("recursos_humanos");

describe("roles", () => {
  it("define exactamente los cuatro roles con su nombre visible", () => {
    expect([...ROLES]).toEqual(["administrador", "gerente_de_area", "recursos_humanos", "finanzas"]);
    expect(NOMBRE_DE_ROL.administrador).toBe("Administrador del sistema");
    expect(NOMBRE_DE_ROL.gerente_de_area).toBe("Gerente de área");
  });
});

describe("matriz de permisos por rol", () => {
  const casos: Array<[string, (actor: Actor) => boolean, Actor[], Actor[]]> = [
    ["configurar lo global (grupos, sedes, política, cambio de grupo)", puedeConfigurarGlobalmente, [administrador], [gerenteDeTiendas, finanzas, recursosHumanos]],
    ["administrar cuentas", puedeAdministrarCuentas, [administrador, finanzas], [gerenteDeTiendas, recursosHumanos]],
    ["gestionar períodos, horas extra y exportar", puedeGestionarPeriodos, [administrador, finanzas], [gerenteDeTiendas, gerenteDeAdministracion, recursosHumanos]],
    ["gestionar feriados, descansos semanales y sustitutorios", puedeGestionarCalendarioLaboral, [administrador, finanzas], [gerenteDeTiendas, gerenteDeAdministracion, recursosHumanos]],
    ["consultar y editar Pagos (solo Finanzas, ni siquiera el Administrador)", puedeGestionarPagos, [finanzas], [administrador, gerenteDeTiendas, gerenteDeVariosGrupos, gerenteDeAdministracion, gerenteSinGrupos, recursosHumanos]],
    ["importar marcas", puedeImportarMarcas, [administrador, finanzas, gerenteDeTiendas, gerenteDeVariosGrupos], [recursosHumanos, gerenteSinGrupos, gerenteDeAdministracion]],
    ["consultar asistencias", puedeConsultarAsistencias, [administrador, finanzas, gerenteDeTiendas], [recursosHumanos, gerenteSinGrupos, gerenteDeAdministracion]],
    ["revisar y confirmar asistencias", puedeRevisarAsistencias, [administrador, gerenteDeTiendas], [finanzas, recursosHumanos, gerenteSinGrupos, gerenteDeAdministracion]],
    ["consultar horarios", puedeConsultarHorarios, [administrador, gerenteDeTiendas], [finanzas, recursosHumanos, gerenteSinGrupos, gerenteDeAdministracion]],
    ["consultar períodos (un gerente solo para aprobar sus grupos)", puedeConsultarPeriodos, [administrador, finanzas, gerenteDeTiendas, gerenteDeVariosGrupos], [recursosHumanos, gerenteSinGrupos, gerenteDeAdministracion]],
    ["consultar configuración", puedeConsultarConfiguracion, [administrador, gerenteDeTiendas, gerenteDeAdministracion], [finanzas, recursosHumanos, gerenteSinGrupos]],
  ];

  it.each(casos)("%s", (_nombre, puede, permitidos, rechazados) => {
    for (const quien of permitidos) expect(puede(quien), `${quien.rol} debería poder`).toBe(true);
    for (const quien of rechazados) expect(puede(quien), `${quien.rol} no debería poder`).toBe(false);
  });
});

describe("aprobar la asistencia de un grupo", () => {
  it("la aprueba el gerente del grupo y el Administrador; Finanzas y Recursos Humanos no", () => {
    expect(puedeAprobarAsistenciaDelGrupo(gerenteDeTiendas, "Tiendas")).toBe(true);
    expect(puedeAprobarAsistenciaDelGrupo(administrador, "Taller")).toBe(true);
    expect(puedeAprobarAsistenciaDelGrupo(finanzas, "Tiendas")).toBe(false);
    expect(puedeAprobarAsistenciaDelGrupo(recursosHumanos, "Tiendas")).toBe(false);
  });

  it("un gerente no aprueba grupos ajenos ni un grupo que no gestiona asistencia", () => {
    expect(puedeAprobarAsistenciaDelGrupo(gerenteDeTiendas, "Taller")).toBe(false);
    expect(puedeAprobarAsistenciaDelGrupo(gerenteDeAdministracion, "Administración")).toBe(false);
    expect(puedeAprobarAsistenciaDelGrupo(gerenteSinGrupos, "Tiendas")).toBe(false);
  });
});

describe("cuentas que cada rol puede crear", () => {
  it("el Administrador crea cuentas de cualquier rol", () => {
    expect(rolesQueSePuedenCrear(administrador)).toEqual([...ROLES]);
  });

  it("Finanzas solo crea gerentes de área y Recursos Humanos", () => {
    expect(rolesQueSePuedenCrear(finanzas)).toEqual(["gerente_de_area", "recursos_humanos"]);
  });

  it("los demás roles no crean cuentas", () => {
    expect(rolesQueSePuedenCrear(gerenteDeTiendas)).toEqual([]);
    expect(rolesQueSePuedenCrear(recursosHumanos)).toEqual([]);
  });
});

describe("límite por grupo", () => {
  it("el gerente opera horarios y asistencias solo en sus grupos que gestionan asistencia", () => {
    expect(puedeOperarAsistenciaDelGrupo(gerenteDeTiendas, "Tiendas")).toBe(true);
    expect(puedeOperarAsistenciaDelGrupo(gerenteDeTiendas, "Taller")).toBe(false);
    expect(puedeOperarAsistenciaDelGrupo(gerenteDeVariosGrupos, "Taller")).toBe(true);
    expect(puedeOperarAsistenciaDelGrupo(gerenteDeAdministracion, "Administración")).toBe(false);
    expect(puedeOperarAsistenciaDelGrupo(gerenteSinGrupos, "Tiendas")).toBe(false);
  });

  it("el gerente administra el personal de cualquiera de sus grupos, también el que no gestiona asistencia", () => {
    expect(puedeAdministrarPersonalDelGrupo(gerenteDeTiendas, "Tiendas")).toBe(true);
    expect(puedeAdministrarPersonalDelGrupo(gerenteDeTiendas, "Taller")).toBe(false);
    expect(puedeAdministrarPersonalDelGrupo(gerenteDeAdministracion, "Administración")).toBe(true);
  });

  it("Finanzas y Recursos Humanos no operan grupos", () => {
    for (const quien of [finanzas, recursosHumanos]) {
      expect(puedeOperarAsistenciaDelGrupo(quien, "Tiendas")).toBe(false);
      expect(puedeAdministrarPersonalDelGrupo(quien, "Tiendas")).toBe(false);
    }
  });

  it("el Administrador opera todos los grupos, incluso los que no gestionan asistencia", () => {
    expect(puedeOperarAsistenciaDelGrupo(administrador, "Administración")).toBe(true);
    expect(puedeAdministrarPersonalDelGrupo(administrador, "Cualquiera")).toBe(true);
  });

  it("Finanzas y el Administrador importan marcas de cualquier grupo; el gerente, solo de los que opera", () => {
    for (const quien of [finanzas, administrador]) expect(puedeImportarMarcasDelGrupo(quien, "Taller")).toBe(true);
    expect(puedeImportarMarcasDelGrupo(gerenteDeTiendas, "Tiendas")).toBe(true);
    expect(puedeImportarMarcasDelGrupo(gerenteDeTiendas, "Taller")).toBe(false);
    expect(puedeImportarMarcasDelGrupo(gerenteDeVariosGrupos, "Taller")).toBe(true);
    for (const quien of [recursosHumanos, gerenteSinGrupos, gerenteDeAdministracion]) expect(puedeImportarMarcasDelGrupo(quien, "Administración")).toBe(false);
  });

  it("un actor sin grupos cargados se trata como sin grupos", () => {
    expect(puedeOperarAsistenciaDelGrupo({ id: "x", rol: "gerente_de_area" }, "Tiendas")).toBe(false);
  });
});

describe("relaciones laborales", () => {
  it("solo Recursos Humanos y el Administrador registran y confirman ingreso y cese", () => {
    expect(puedeGestionarRelacionesLaborales(recursosHumanos)).toBe(true);
    expect(puedeGestionarRelacionesLaborales(administrador)).toBe(true);
    for (const quien of [finanzas, gerenteDeTiendas, gerenteDeVariosGrupos, gerenteDeAdministracion, gerenteSinGrupos]) {
      expect(puedeGestionarRelacionesLaborales(quien)).toBe(false);
    }
  });

  it("Finanzas las consulta en solo lectura; los gerentes de área no", () => {
    expect(puedeConsultarRelacionesLaborales(finanzas)).toBe(true);
    expect(puedeConsultarRelacionesLaborales(recursosHumanos)).toBe(true);
    expect(puedeConsultarRelacionesLaborales(administrador)).toBe(true);
    for (const quien of [gerenteDeTiendas, gerenteDeAdministracion, gerenteSinGrupos]) {
      expect(puedeConsultarRelacionesLaborales(quien)).toBe(false);
    }
  });

  it("Recursos Humanos no recibe ningún otro permiso", () => {
    expect(puedeAdministrarCuentas(recursosHumanos)).toBe(false);
    expect(puedeConfigurarGlobalmente(recursosHumanos)).toBe(false);
    expect(puedeConsultarConfiguracion(recursosHumanos)).toBe(false);
    expect(puedeConsultarHorarios(recursosHumanos)).toBe(false);
    expect(puedeConsultarAsistencias(recursosHumanos)).toBe(false);
    expect(puedeGestionarPeriodos(recursosHumanos)).toBe(false);
    expect(puedeImportarMarcas(recursosHumanos)).toBe(false);
    expect(puedeRevisarAsistencias(recursosHumanos)).toBe(false);
  });
});

describe("exigir", () => {
  it("lanza el mensaje cuando la condición es falsa", () => {
    expect(() => exigir(false, "No tiene permiso.")).toThrow("No tiene permiso.");
    expect(() => exigir(true, "No tiene permiso.")).not.toThrow();
  });
});
