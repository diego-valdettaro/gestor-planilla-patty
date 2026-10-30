import type { Metadata } from "next";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";

import { Navegacion } from "./navegacion";
import { BotonDeFeedback } from "./boton-feedback";
import { ProveedorCambiosPendientes } from "./asistencias/cambios-pendientes";
import "./global.css";

export const metadata: Metadata = {
  title: "Planilla Patty",
  description: "Gestión de asistencia y planilla",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await obtenerActorActual().catch(() => undefined);
  return (
    <html lang="es">
      <body><ProveedorCambiosPendientes><Navegacion actor={actor} />{children}{actor && <BotonDeFeedback />}</ProveedorCambiosPendientes></body>
    </html>
  );
}
