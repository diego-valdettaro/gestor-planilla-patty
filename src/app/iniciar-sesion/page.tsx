"use client";

import { useActionState } from "react";

import { iniciarSesionDesdeFormulario, type EstadoDeInicioSesion } from "./actions";

const estadoInicial: EstadoDeInicioSesion = {};

export default function PaginaDeInicioDeSesion() {
  const [estado, accion] = useActionState(iniciarSesionDesdeFormulario, estadoInicial);

  return (
    <main className="pagina-ajustes pagina-acceso">
      <form action={accion} aria-labelledby="titulo-inicio-sesion" className="tarjeta-acceso">
        <div className="marca-acceso">
          <p className="nombre-marca">Patty</p>
          <p className="eyebrow">Planilla</p>
        </div>
        <h1 id="titulo-inicio-sesion">Iniciar sesión</h1>
        <div className="campos-acceso">
          <label>
            Usuario
            <input autoComplete="username" name="nombreUsuario" required />
          </label>
          <label>
            Contraseña
            <input autoComplete="current-password" name="contrasena" required type="password" />
          </label>
        </div>
        {estado.error && <p aria-live="polite" className="mensaje-operacion error" role="alert">{estado.error}</p>}
        <button className="boton-principal" type="submit">Entrar</button>
      </form>
    </main>
  );
}
