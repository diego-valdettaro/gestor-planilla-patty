import type { Metadata } from "next";

import "./global.css";

export const metadata: Metadata = {
  title: "Planilla Patty",
  description: "Gestión de asistencia y planilla",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
