import { describe, expect, it } from "vitest";

import { enlacesPermitidos, esEnlaceActivo, seccionActiva } from "./enlaces-navegacion";

describe("enlaces de navegación", () => {
  it("muestra solo las rutas permitidas al rol", () => {
    expect(enlacesPermitidos("operaciones").map((enlace) => enlace.href)).toEqual(["/turnos"]);
    expect(enlacesPermitidos("finanzas").map((enlace) => enlace.href)).toEqual(["/asistencias", "/periodos"]);
    expect(enlacesPermitidos("administracion")).toHaveLength(4);
  });

  it("marca activa la ruta y sus subrutas, sin confundir prefijos parecidos", () => {
    expect(esEnlaceActivo("/asistencias", "/asistencias")).toBe(true);
    expect(esEnlaceActivo("/asistencias/importar", "/asistencias")).toBe(true);
    expect(esEnlaceActivo("/asistenciasx", "/asistencias")).toBe(false);
  });

  it("nombra la sección activa para la barra superior", () => {
    expect(seccionActiva("/asistencias/importar", enlacesPermitidos("administracion"))?.etiqueta).toBe("Asistencia");
    expect(seccionActiva("/otra", enlacesPermitidos("administracion"))).toBeUndefined();
  });
});
