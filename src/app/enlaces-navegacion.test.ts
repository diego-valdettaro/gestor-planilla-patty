import { describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";

import { enlacesPermitidos, esEnlaceActivo, rutaDeInicio, seccionActiva } from "./enlaces-navegacion";

const TIENDAS = { nombre: "Tiendas", gestionaAsistencia: true };
const ADMINISTRACION = { nombre: "Administración", gestionaAsistencia: false };

const administrador: Actor = { id: "a", rol: "administrador" };
const gerenteDeTiendas: Actor = { id: "g", rol: "gerente_de_area", grupos: [TIENDAS] };
const gerenteDeAdministracion: Actor = { id: "g2", rol: "gerente_de_area", grupos: [ADMINISTRACION] };
const gerenteSinGrupos: Actor = { id: "g3", rol: "gerente_de_area", grupos: [] };
const finanzas: Actor = { id: "f", rol: "finanzas" };
const recursosHumanos: Actor = { id: "r", rol: "recursos_humanos" };

const rutas = (actor: Actor) => enlacesPermitidos(actor).map((enlace) => enlace.href);

describe("enlaces de navegación", () => {
  it("muestra a cada rol exactamente las rutas que puede abrir", () => {
    expect(rutas(administrador)).toEqual(["/configuracion", "/cuentas", "/turnos", "/asistencias", "/periodos", "/relaciones-laborales"]);
    expect(rutas(gerenteDeTiendas)).toEqual(["/configuracion", "/turnos", "/asistencias", "/periodos"]);
    expect(rutas(gerenteDeAdministracion)).toEqual(["/configuracion"]);
    expect(rutas(gerenteSinGrupos)).toEqual([]);
    expect(rutas(finanzas)).toEqual(["/cuentas", "/asistencias", "/periodos", "/relaciones-laborales", "/pagos"]);
    expect(rutas(recursosHumanos)).toEqual(["/relaciones-laborales"]);
  });

  it("nombra cada sección con el vocabulario del dominio", () => {
    expect(enlacesPermitidos(administrador).map((enlace) => enlace.etiqueta)).toEqual(["Configuración", "Cuentas", "Horarios", "Asistencia", "Períodos de planilla", "Relaciones laborales"]);
    expect(enlacesPermitidos(finanzas).map((enlace) => enlace.etiqueta)).toEqual(["Cuentas", "Asistencia", "Períodos de planilla", "Relaciones laborales", "Pagos"]);
  });

  it("marca activa la ruta y sus subrutas, sin confundir prefijos parecidos", () => {
    expect(esEnlaceActivo("/asistencias", "/asistencias")).toBe(true);
    expect(esEnlaceActivo("/asistencias/importar", "/asistencias")).toBe(true);
    expect(esEnlaceActivo("/asistenciasx", "/asistencias")).toBe(false);
  });

  it("nombra la sección activa para la barra superior", () => {
    expect(seccionActiva("/asistencias/importar", enlacesPermitidos(administrador))?.etiqueta).toBe("Asistencia");
    expect(seccionActiva("/otra", enlacesPermitidos(administrador))).toBeUndefined();
  });

  it("lleva a cada rol a la primera pantalla que puede abrir, o a ninguna", () => {
    expect(rutaDeInicio(administrador)).toBe("/turnos");
    expect(rutaDeInicio(gerenteDeTiendas)).toBe("/turnos");
    expect(rutaDeInicio(gerenteDeAdministracion)).toBe("/configuracion");
    expect(rutaDeInicio(finanzas)).toBe("/asistencias");
    expect(rutaDeInicio(recursosHumanos)).toBe("/relaciones-laborales");
    expect(rutaDeInicio(gerenteSinGrupos)).toBeUndefined();
  });
});
