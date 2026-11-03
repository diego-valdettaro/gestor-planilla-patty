import React from "react";

import { IconoCandado } from "@/app/icono-candado";

import type { EstadoDeCeldaAsistencia } from "./estado-de-celda";

// El glifo acompaña al nombre del estado, nunca lo reemplaza: ✓ Registrada, candado en Liquidado (igual que en Horarios).
export function GlifoDeEstado({ estado }: { estado: EstadoDeCeldaAsistencia }) {
  if (estado === "registrada") return <span aria-hidden="true" className="glifo-de-estado">✓</span>;
  if (estado === "liquidado") return <IconoCandado />;
  return null;
}
