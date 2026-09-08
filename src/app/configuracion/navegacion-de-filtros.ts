import type { FiltroDeColaboradores } from "./visibilidad-de-colaboradores";

// Serializa el filtro de Colaboradores a la URL que resuelve el servidor.
// `grupo` vacío o `mostrarInactivos` apagado no agregan parámetro: la URL por
// defecto es `/configuracion` a secas.
export function rutaDeFiltros(filtro: FiltroDeColaboradores): string {
  const parametros = new URLSearchParams();
  if (filtro.grupo) parametros.set("grupo", filtro.grupo);
  if (filtro.mostrarInactivos) parametros.set("inactivos", "1");
  const consulta = parametros.toString();
  return consulta ? `/configuracion?${consulta}` : "/configuracion";
}

// Al cambiar un filtro solo debe refrescarse la tabla, no saltar el scroll al
// principio de la página (QA de #32). `router.push` del App Router desplaza al
// top por defecto; con esto se queda donde está.
export const NAVEGACION_SIN_SALTO = { scroll: false } as const;
