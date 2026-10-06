import { redirect } from "next/navigation";

import { NOMBRE_DE_ROL } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";

import { rutaDeInicio } from "./enlaces-navegacion";

export default async function Inicio() {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  const ruta = rutaDeInicio(actor);
  if (ruta) redirect(ruta);

  return <main className="centrado"><section className="estado-vacio"><h1>Sin acciones disponibles todavía</h1>{actor.rol === "gerente_de_area"
    ? <p>Todavía no tiene grupos asignados. Pida a Finanzas o al Administrador del sistema que se los asigne.</p>
    : <p>Su rol ({NOMBRE_DE_ROL[actor.rol]}) aún no tiene pantallas en la aplicación. Cuando se habiliten, aparecerán en el menú.</p>}</section></main>;
}
