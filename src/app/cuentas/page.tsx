import { redirect } from "next/navigation";

import { BotonDeAccionConfirmada } from "@/app/boton-de-accion-confirmada";
import { NOMBRE_DE_ROL, puedeAdministrarCuentas, puedeConfigurarGlobalmente, rolesQueSePuedenCrear } from "@/autenticacion/permisos";
import { repositorioDeCuentas } from "@/autenticacion/servicio";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";

import { quitarGerenteDesdeFormulario } from "./actions";
import { AsignadorDeGerente } from "./asignador-de-gerente";
import { FormularioDeCuenta } from "./formulario-de-cuenta";

export const dynamic = "force-dynamic";

export default async function PaginaDeCuentas() {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeAdministrarCuentas(actor)) return <main className="centrado"><section className="estado-vacio"><h1>Sin permiso</h1><p>Su rol no permite administrar cuentas. Solo Finanzas y el Administrador del sistema pueden hacerlo.</p></section></main>;

  const [cuentas, grupos] = await Promise.all([repositorioDeCuentas.listarCuentas(), repositorioDeCuentas.listarGruposConGerente()]);
  const gerentes = cuentas.filter((cuenta) => cuenta.rol === "gerente_de_area");
  const nombreDeCuenta = new Map(cuentas.map((cuenta) => [cuenta.id, cuenta.nombreUsuario]));

  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina"><div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>Cuentas</h1><p>Cree cuentas de acceso y asigne a cada gerente de área los grupos que dirige.</p></div></header>

    <section className="tarjeta panel">
      <header className="panel-cabecera"><div><h2>Crear cuenta</h2><p>{puedeConfigurarGlobalmente(actor) ? "Puede crear cuentas de cualquier rol." : "Puede crear cuentas de gerente de área y de Recursos Humanos."}</p></div></header>
      <FormularioDeCuenta roles={rolesQueSePuedenCrear(actor)} />
    </section>

    <section className="tarjeta panel">
      <header className="panel-cabecera"><div><h2>Gerentes por grupo</h2><p>Cada grupo tiene como máximo un gerente de área; un gerente puede dirigir varios grupos.</p></div><span className="insignia neutro">{grupos.filter((grupo) => grupo.gerenteId).length} de {grupos.length} grupos con gerente</span></header>
      {grupos.length ? <div className="panel-tabla"><table><thead><tr><th>Grupo</th><th>Gestión de asistencia</th><th>Gerente de área</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{grupos.map((grupo) => <tr key={grupo.nombre}>
        <td>{grupo.nombre}</td>
        <td>{grupo.gestionaAsistencia ? "Gestiona asistencia y horarios" : "No gestiona asistencia"}</td>
        <td>{grupo.gerenteId ? nombreDeCuenta.get(grupo.gerenteId) ?? "Cuenta desconocida" : <span className="insignia neutro">Sin gerente</span>}</td>
        <td>{grupo.gerenteId
          ? <BotonDeAccionConfirmada accion={quitarGerenteDesdeFormulario} confirmar="Quitar gerente" descripcion={`${nombreDeCuenta.get(grupo.gerenteId) ?? "El gerente"} dejará de operar ${grupo.nombre}. Sus registros anteriores se conservan.`} etiqueta="Quitar gerente" peligro titulo={`¿Quitar el gerente de ${grupo.nombre}?`}><input name="grupo" type="hidden" value={grupo.nombre} /></BotonDeAccionConfirmada>
          : gerentes.length ? <AsignadorDeGerente gerentes={gerentes} grupo={grupo.nombre} /> : <span className="pista-configuracion">Cree primero una cuenta de gerente de área para asignarla.</span>}</td>
      </tr>)}</tbody></table></div> : <section className="estado-vacio"><h3>No hay grupos</h3>{puedeConfigurarGlobalmente(actor) ? <p>Cree un grupo en <a href="/configuracion">Configuración</a> para poder asignarle un gerente.</p> : <p>Pida al Administrador del sistema que cree los grupos operativos.</p>}</section>}
    </section>

    <section className="tarjeta panel">
      <header className="panel-cabecera"><div><h2>Cuentas</h2><p>Cuentas de acceso y, en los gerentes de área, los grupos que dirigen.</p></div><span className="insignia neutro">{cuentas.length} cuentas</span></header>
      {cuentas.length ? <div className="panel-tabla"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Grupos asignados</th></tr></thead><tbody>{cuentas.map((cuenta) => <tr key={cuenta.id}><td>{cuenta.nombreUsuario}</td><td>{NOMBRE_DE_ROL[cuenta.rol]}</td><td>{cuenta.rol === "gerente_de_area" ? (cuenta.grupos.length ? cuenta.grupos.join(", ") : <span className="insignia neutro">Sin grupos</span>) : "—"}</td></tr>)}</tbody></table></div> : <section className="estado-vacio"><h3>No hay cuentas</h3><p>Cree la primera con el formulario de arriba.</p></section>}
    </section>
  </main>;
}
