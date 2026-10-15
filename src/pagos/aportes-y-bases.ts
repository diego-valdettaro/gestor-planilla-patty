import { buscarConcepto, efectosDeAjuste } from "@/conceptos-de-preliquidacion/catalogo";
import type { EntradaDeBorrador, LineaDeBorrador } from "./calcular-borrador";
import type { RelacionConPersona } from "@/relaciones-laborales/gestionar-relaciones-laborales";
import { esAfp, type ValorLaboral } from "@/condiciones-laborales/catalogo";
import { buscarDefinicion } from "@/reglas-legales/catalogo";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";

/** Solo importa el intervalo de esta relación en el devengue, no otra persona ni el corte del pago. */
export function hayCambioIntramensual(historial: Array<{ valor: ValorLaboral; vigenteDesde: string }>, relacion: RelacionConPersona, mes: string): boolean {
  const desde = relacion.ingreso > `${mes}-01` ? relacion.ingreso : `${mes}-01`;
  const [anio, numero] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(anio, numero, 0)).toISOString().slice(0, 10);
  const hasta = relacion.ceseConfirmado && relacion.cese !== null && relacion.cese < ultimo ? relacion.cese : ultimo;
  const ordenadas = historial.filter(v => v.vigenteDesde <= hasta).sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
  const inicial = ordenadas.filter(v => v.vigenteDesde <= desde).at(-1)?.valor;
  return ordenadas.some(v => v.vigenteDesde > desde && v.valor !== inicial);
}

export function bloqueoPorCambio(mes: string, pieza: string): string {
  return `Pendiente: cambio dentro del mes ${mes} en ${pieza}; falta definir la regla con Finanzas.`;
}

export interface LineaDeAporte {
  concepto: "aporte_onp" | "aporte_obligatorio_afp" | "prima_de_seguro_afp" | "comision_afp" | "essalud_patronal";
  dias?: never;
  importeCentimos: number;
  baseCentimos: number;
  topeCentimos?: number;
  minimoCentimos?: number;
  tasaEnCentesimasDePunto: number;
  tipo: "deduccion_del_trabajador" | "aporte_patronal";
  efectoEnNeto: "resta" | "ninguno";
  mesDeDevengue: string;
  mesDePago: string;
  corte: EntradaDeBorrador["corte"];
  origen: "Reglas legales y condiciones laborales";
}

export function aportesDelDevengue(entrada: EntradaDeBorrador, relacion: RelacionConPersona, bases: BasesPorDevengue[], bloqueos: string[]): LineaDeAporte[] {
  return bases.flatMap(base => {
    const fecha = relacion.ingreso > `${base.mesDeDevengue}-01` ? relacion.ingreso : `${base.mesDeDevengue}-01`;
    const afiliacion = entrada.condiciones.filter(c => c.relacionId === relacion.id && c.dato === "afiliacion_pensionaria" && c.vigenteDesde <= fecha)
      .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde)).at(-1)?.valor;
    const cambioDeAfiliacion = hayCambioIntramensual(entrada.condiciones.filter(c => c.relacionId === relacion.id && c.dato === "afiliacion_pensionaria"), relacion, base.mesDeDevengue);
    if (cambioDeAfiliacion) bloqueos.push(bloqueoPorCambio(base.mesDeDevengue, "afiliación pensionaria"));
    const regla = (codigo: string) => {
      const historial = entrada.reglas.filter(r => r.codigo === codigo);
      if (hayCambioIntramensual(historial, relacion, base.mesDeDevengue)) {
        bloqueos.push(bloqueoPorCambio(base.mesDeDevengue, buscarDefinicion(codigo)?.nombre ?? codigo));
        return undefined;
      }
      const valor = historial.filter(r => r.vigenteDesde <= fecha).sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde)).at(-1)?.valor;
      if (valor === undefined) bloqueos.push(`No hay ${buscarDefinicion(codigo)?.nombre ?? codigo} vigente para el devengue ${base.mesDeDevengue}. Active el valor en Reglas legales.`);
      return valor;
    };
    const lineas: LineaDeAporte[] = [];
    const agregar = (concepto: LineaDeAporte["concepto"], monto: number | null, tasa: number | undefined, limite?: number) => {
      if (monto === null || tasa === undefined) return;
      const patronal = concepto === "essalud_patronal";
      lineas.push({ concepto, importeCentimos: Math.floor(monto * tasa / 10_000 + 0.5), baseCentimos: monto,
        tasaEnCentesimasDePunto: tasa, tipo: patronal ? "aporte_patronal" : "deduccion_del_trabajador", efectoEnNeto: patronal ? "ninguno" : "resta",
        mesDeDevengue: base.mesDeDevengue, mesDePago: entrada.mesDePago, corte: entrada.corte, origen: "Reglas legales y condiciones laborales",
        ...(limite === undefined ? {} : patronal ? { minimoCentimos: limite } : { topeCentimos: limite }) });
    };
    if (!cambioDeAfiliacion && afiliacion === "onp") agregar("aporte_onp", base.pensionariaCentimos, regla("onp_tasa"));
    if (!cambioDeAfiliacion && esAfp(afiliacion)) {
      agregar("aporte_obligatorio_afp", base.pensionariaCentimos, regla("afp_aporte_obligatorio"));
      const prima = regla("afp_prima_seguro");
      const tope = regla("afp_remuneracion_maxima_asegurable");
      const esquema = entrada.condiciones.filter(c => c.relacionId === relacion.id && c.dato === "comision_afp" && c.vigenteDesde <= fecha)
        .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde)).at(-1)?.valor;
      const cambioDeEsquema = hayCambioIntramensual(entrada.condiciones.filter(c => c.relacionId === relacion.id && c.dato === "comision_afp"), relacion, base.mesDeDevengue);
      if (cambioDeEsquema) bloqueos.push(bloqueoPorCambio(base.mesDeDevengue, "esquema de comisión AFP"));
      else if (esquema === "flujo" || esquema === "mixta") agregar("comision_afp", base.pensionariaCentimos, regla(`${afiliacion}_comision_${esquema}`));
      if (prima !== undefined && tope !== undefined && base.pensionariaCentimos !== null) {
        agregar("prima_de_seguro_afp", Math.min(base.pensionariaCentimos, tope), prima, tope);
      }
    }
    agregar("essalud_patronal", base.essaludAplicableCentimos, regla("essalud_tasa"), regla("essalud_base_minima"));
    return lineas;
  });
}

export interface BasesPorDevengue {
  mesDeDevengue: string;
  pensionariaCentimos: number | null;
  essaludRemunerativaCentimos: number | null;
  essaludAplicableCentimos: number | null;
  quintaCentimos: number | null;
}

/** Cada devengue conserva su base; una deducción o un abono no rebaja remuneración. */
export function basesPorDevengue(entrada: EntradaDeBorrador, relacion: RelacionConPersona, lineas: LineaDeBorrador[], mesesPendientes: Set<string>): BasesPorDevengue[] {
  const externos = entrada.importes.filter(i => i.dni === relacion.dni && i.anuladoEn === null && i.mesDeAplicacion === entrada.mesDePago);
  const componentes = [
    ...lineas.map(l => ({ mes: l.mesDeDevengue, monto: l.importeCentimos, efectos: buscarConcepto(l.concepto)?.bases })),
    ...externos.map(i => ({ mes: i.mesDeDevengue, monto: i.monto,
      efectos: i.concepto === "ajuste_de_preliquidacion" && i.conceptoAjustado && i.sentidoAjuste
        ? efectosDeAjuste(i.conceptoAjustado, i.sentidoAjuste).bases : buscarConcepto(i.concepto)?.bases })),
  ];
  const meses = [...new Set([entrada.mesDePago, ...componentes.map(c => c.mes)])].sort();
  return meses.map(mesDeDevengue => {
    if (mesesPendientes.has(mesDeDevengue)) return { mesDeDevengue, pensionariaCentimos: null, essaludRemunerativaCentimos: null, essaludAplicableCentimos: null, quintaCentimos: null };
    const sumar = (base: "pensionaria" | "essalud" | "quinta") => {
      const desconocida = TIPOS_DE_FUENTE.filter(tipo => entrada.fuentesPendientes.includes(tipo.nombre))
        .some(tipo => tipo.conceptos.some(codigo => {
          const efecto = buscarConcepto(codigo)?.bases[base];
          return efecto !== undefined && efecto !== "no_afecta";
        }));
      if (desconocida) return null;
      return componentes.filter(c => c.mes === mesDeDevengue).reduce((total, c) => {
        const efecto = c.efectos?.[base];
        return total + (efecto === "suma" ? c.monto : efecto === "resta" ? -c.monto : 0);
      }, 0);
    };
    const historiaMinimo = entrada.reglas.filter(r => r.codigo === "essalud_base_minima");
    const fecha = relacion.ingreso > `${mesDeDevengue}-01` ? relacion.ingreso : `${mesDeDevengue}-01`;
    const minimo = hayCambioIntramensual(historiaMinimo, relacion, mesDeDevengue) ? undefined : historiaMinimo.filter(r => r.vigenteDesde <= fecha)
      .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde)).at(-1)?.valor;
    const remunerativa = sumar("essalud");
    return { mesDeDevengue, pensionariaCentimos: sumar("pensionaria"), essaludRemunerativaCentimos: remunerativa,
      essaludAplicableCentimos: minimo === undefined || remunerativa === null ? null : Math.max(remunerativa, minimo), quintaCentimos: sumar("quinta") };
  });
}
