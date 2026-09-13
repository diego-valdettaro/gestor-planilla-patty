import React from "react";
import Link from "next/link";

import { rutaDeImportacion } from "./ruta-de-importacion";

export function FiltrosDeAsistencia({ grupo, grupos, semana }: { grupo?: string; grupos: string[]; semana: string }) {
  return <form className="filtros selector-asistencia" method="get"><label>Grupo operativo<select defaultValue={grupo} name="grupo">{grupos.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Semana<input defaultValue={semana} name="semana" suppressHydrationWarning type="date" /></label><button type="submit">Ver semana</button><Link className="boton-secundario importar-archivo" href={rutaDeImportacion}>Importar archivo</Link></form>;
}
