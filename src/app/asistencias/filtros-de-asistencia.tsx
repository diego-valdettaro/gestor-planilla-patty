import React from "react";
import Link from "next/link";

import { rutaDeImportacion } from "./ruta-de-importacion";

interface Colaborador { idHuellero: string; nombre: string; }

export function FiltrosDeAsistencia({ colaborador, colaboradores, mes }: { colaborador?: string; colaboradores: Colaborador[]; mes: string }) {
  return <form className="filtros selector-asistencia" method="get"><label>Colaborador<select defaultValue={colaborador} name="colaborador">{colaboradores.map((item) => <option key={item.idHuellero} value={item.idHuellero}>{item.nombre} · {item.idHuellero}</option>)}</select></label><label>Mes<input defaultValue={mes} name="mes" type="month" /></label><button type="submit">Ver calendario</button><Link className="boton-secundario importar-archivo" href={rutaDeImportacion}>Importar archivo</Link></form>;
}
