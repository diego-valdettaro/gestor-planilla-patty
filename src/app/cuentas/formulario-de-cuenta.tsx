"use client";

import { useActionState } from "react";

import { NOMBRE_DE_ROL, type Rol } from "@/autenticacion/permisos";

import { crearCuentaDesdeFormulario, type EstadoDeFormularioDeCuentas } from "./actions";

const estadoInicial: EstadoDeFormularioDeCuentas = {};

export function FormularioDeCuenta({ roles }: { roles: Rol[] }) {
  const [estado, accion, pendiente] = useActionState(crearCuentaDesdeFormulario, estadoInicial);
  return <form action={accion} className="filtros panel-filtros" key={estado.listo ?? 0}>
    <label>Nombre de usuario<input autoComplete="off" name="nombreUsuario" required /></label>
    <label>Contraseña inicial<input autoComplete="new-password" minLength={8} name="contrasena" required type="password" /></label>
    <label>Rol<select defaultValue="" name="rol" required><option disabled value="">Rol…</option>{roles.map((rol) => <option key={rol} value={rol}>{NOMBRE_DE_ROL[rol]}</option>)}</select></label>
    <button className="boton-principal" disabled={pendiente} type="submit">Crear cuenta</button>
    {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
    {estado.listo ? <p className="mensaje-operacion listo" role="status">La cuenta quedó creada.</p> : null}
  </form>;
}
