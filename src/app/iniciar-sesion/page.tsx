import { iniciarSesionDesdeFormulario } from "./actions";

export default function PaginaDeInicioDeSesion() {
  return (
    <main className="centrado">
      <form action={iniciarSesionDesdeFormulario} className="tarjeta formulario-inicio-sesion">
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
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
