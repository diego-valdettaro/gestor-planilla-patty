"use client";

import { useActionState } from "react";

import { iniciarSesionDesdeFormulario, type EstadoDeInicioSesion } from "./actions";

const estadoInicial: EstadoDeInicioSesion = {};

export default function PaginaDeInicioDeSesion() {
  const [estado, accion] = useActionState(iniciarSesionDesdeFormulario, estadoInicial);

  return (
    <main className="centrado">
      <form action={accion} className="tarjeta formulario-inicio-sesion">
        <p className="eyebrow">Planilla Patty</p>
        <h1>Iniciar sesión</h1>
        <label>
          Usuario
          <input autoComplete="username" name="nombreUsuario" required />
        </label>
        <label>
          Contraseña
          <input autoComplete="current-password" name="contrasena" required type="password" />
        </label>
        {estado.error && <p aria-live="polite" role="alert">{estado.error}</p>}
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
