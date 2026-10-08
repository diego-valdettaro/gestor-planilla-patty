import Link from "next/link";
import { redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeGestionarPagos } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";
import { formatearMes } from "@/fuentes-externas/valores";

import { NavegacionDePagos } from "../../navegacion-de-pagos";
import { SinPermisoDePagos } from "../../sin-permiso";
import { mesDePagoDeLaConsulta } from "../mes-de-pago";

import { FormularioDeImportacionDeFuente } from "./formulario-de-importacion-de-fuente";

export const dynamic = "force-dynamic";

export default async function PaginaDeImportacionDeFuentes({ searchParams }: { searchParams: Promise<{ mes?: string; tipo?: string }> }) {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeGestionarPagos(actor)) return <SinPermisoDePagos />;

  const { mes: mesPedido, tipo: tipoPedido } = await searchParams;
  const { mes, error: errorDeMes } = mesDePagoDeLaConsulta(mesPedido);
  const tipos = TIPOS_DE_FUENTE.filter((tipo) => !tipo.flujoPropio).map(({ codigo, nombre }) => ({ codigo, nombre }));
  const tipoInicial = tipos.find((tipo) => tipo.codigo === tipoPedido)?.codigo ?? tipos[0].codigo;

  return <main className="contenido pagina">
    <header className="encabezado encabezado-pagina">
      <div>
        <p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p>
        <h1>Importar fuente externa · mes de pago {formatearMes(mes)}</h1>
        <p>Cargue un archivo XLSX normalizado con los importes de un tipo de fuente. El archivo se conserva con su hash y responsable. Si hay un error en alguna fila, no se importa ninguna.</p>
        <p><Link href={`/pagos/fuentes-externas?mes=${mes}`}>Volver a fuentes externas</Link></p>
      </div>
    </header>
    <NavegacionDePagos actual="fuentes-externas" />
    {errorDeMes && <p className="mensaje-operacion error" role="alert">{errorDeMes} Se muestra el mes {formatearMes(mes)}.</p>}
    <section aria-labelledby="titulo-importar" className="tarjeta panel">
      <header className="panel-cabecera"><div><h2 id="titulo-importar">Archivo fuente de preliquidación</h2><p>Primero se valida sin guardar nada. Importar otro archivo del mismo tipo y mes reemplaza al anterior y devuelve la fuente a Pendiente.</p></div></header>
      <FormularioDeImportacionDeFuente key={`${mes}-${tipoInicial}`} mes={mes} tipoInicial={tipoInicial} tipos={tipos} />
    </section>
  </main>;
}
