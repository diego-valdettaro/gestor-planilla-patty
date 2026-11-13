import { describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";

import { enlacesPermitidos, esEnlaceActivo, esSeccionActiva, rutaDeInicio, seccionActiva } from "./enlaces-navegacion";

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
  it("G23 usa etiquetas de issue y deja Configuración y Personal antes de operación", () => {
    expect(enlacesPermitidos(administrador).map(({ href, etiqueta }) => [href, etiqueta])).toEqual([
      ["/configuracion", "Configuración"], ["/personal", "Personal"],
      ["/turnos", "Planificación de horarios"], ["/asistencias", "Registro de asistencias"], ["/periodos", "Revisión de asistencia para planilla"],
      ["/pagos", "Pagos"],
    ]);
    expect(enlacesPermitidos(finanzas).map(({ href, etiqueta }) => [href, etiqueta])).toEqual([
      ["/configuracion", "Configuración"], ["/personal", "Personal"], ["/asistencias", "Registro de asistencias"],
      ["/periodos", "Revisión de asistencia para planilla"], ["/pagos", "Pagos"],
    ]);
  });
  it("muestra a cada rol exactamente las rutas que puede abrir", () => {
    expect(rutas(administrador)).toEqual(["/configuracion", "/personal", "/turnos", "/asistencias", "/periodos", "/pagos"]);
    expect(rutas(gerenteDeTiendas)).toEqual(["/configuracion", "/personal", "/turnos", "/asistencias", "/periodos"]);
    expect(rutas(gerenteDeAdministracion)).toEqual(["/configuracion", "/personal", "/asistencias"]);
    expect(rutas(gerenteSinGrupos)).toEqual([]);
    expect(rutas(finanzas)).toEqual(["/configuracion", "/personal", "/asistencias", "/periodos", "/pagos"]);
    expect(rutas(recursosHumanos)).toEqual(["/personal"]);
  });

  it("agrupa Cuentas bajo Configuración y Relaciones laborales bajo Personal", () => {
    const [configuracion, personal] = enlacesPermitidos(administrador);

    expect(esSeccionActiva("/cuentas", configuracion)).toBe(true);
    expect(esSeccionActiva("/cuentas", personal)).toBe(false);
    expect(esSeccionActiva("/relaciones-laborales", personal)).toBe(true);
    expect(esSeccionActiva("/personal", personal)).toBe(true);
    expect(seccionActiva("/cuentas", enlacesPermitidos(finanzas))?.etiqueta).toBe("Configuración");
  });

  it("marca activa la ruta y sus subrutas, sin confundir prefijos parecidos", () => {
    expect(esEnlaceActivo("/asistencias", "/asistencias")).toBe(true);
    expect(esEnlaceActivo("/asistencias/importar", "/asistencias")).toBe(true);
    expect(esEnlaceActivo("/asistenciasx", "/asistencias")).toBe(false);
  });

  it("nombra la sección activa para la barra superior", () => {
    expect(seccionActiva("/asistencias/importar", enlacesPermitidos(administrador))?.etiqueta).toBe("Registro de asistencias");
    expect(seccionActiva("/otra", enlacesPermitidos(administrador))).toBeUndefined();
  });

  it("lleva a cada rol a la primera pantalla que puede abrir, o a ninguna", () => {
    expect(rutaDeInicio(administrador)).toBe("/turnos");
    expect(rutaDeInicio(gerenteDeTiendas)).toBe("/turnos");
    expect(rutaDeInicio(gerenteDeAdministracion)).toBe("/asistencias");
    expect(rutaDeInicio(finanzas)).toBe("/asistencias");
    expect(rutaDeInicio(recursosHumanos)).toBe("/personal");
    expect(rutaDeInicio(gerenteSinGrupos)).toBeUndefined();
  });
});
