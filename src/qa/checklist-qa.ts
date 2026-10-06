const MAX_PASOS = 6;

export interface IssueDeGitHub {
  title: string;
  body: string;
  url: string;
}

function seccion(markdown: string, nombres: string[]): string | undefined {
  const lineas = markdown.split(/\r?\n/);
  const inicio = lineas.findIndex((linea) => {
    const encabezado = /^#{2,6}\s+(.+?)\s*#*\s*$/.exec(linea.trim());
    return encabezado !== null && nombres.some((nombre) => encabezado[1].toLocaleLowerCase("es") === nombre);
  });
  if (inicio < 0) return undefined;

  const fin = lineas.findIndex((linea, indice) => indice > inicio && /^#{1,6}\s+/.test(linea.trim()));
  return lineas.slice(inicio + 1, fin < 0 ? undefined : fin).join("\n");
}

function elementosDeLista(markdown: string): string[] {
  return markdown.split(/\r?\n/).flatMap((linea) => {
    const elemento = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.+?)\s*$/.exec(linea);
    if (!elemento) return [];
    const texto = elemento[1].replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").trim();
    return texto ? [texto] : [];
  });
}

function esObservable(criterio: string): boolean {
  if (/\b(?:parser|pruebas?|tests?|typecheck|build|workflow|documentar|documentaci[oó]n|c[oó]digo|migraci[oó]n|CI)\b|pnpm validate/i.test(criterio)) {
    return false;
  }
  return /\b(?:muestra|aparece|permite|puede|carga|abre|accede|navega|funciona|iniciar sesi[oó]n|guardar|eliminar|crear|editar|descargar|exportar|importar|preparando|prepara|levantando|levanta|prioriza|informa|servidor|URL|cuentas)\b/i.test(criterio);
}

export function pasosDeQaManual(cuerpo: string): string[] {
  const qaManual = seccion(cuerpo, ["qa manual"]);
  if (qaManual !== undefined) return elementosDeLista(qaManual).slice(0, MAX_PASOS);

  const criterios = seccion(cuerpo, ["acceptance criteria", "criterios de aceptación", "criterios de aceptacion"]);
  if (!criterios) return [];
  return elementosDeLista(criterios)
    .filter(esObservable)
    .slice(0, MAX_PASOS)
    .map((criterio) => `Comprobar que ${criterio[0].toLocaleLowerCase("es")}${criterio.slice(1)}`);
}

export function resumenDeRevision(datos: {
  numero: number;
  rama: string;
  nombreBase: string;
  puerto: number;
  issue?: IssueDeGitHub;
}): string[] {
  const { numero, rama, nombreBase, puerto, issue } = datos;
  const lineas = ["Entorno de revisión listo:"];
  if (!issue) lineas.push("  No pude consultar la issue con gh (CLI, conexión o permisos). El servidor arrancará igual.");
  lineas.push(
    `  Issue:   ${issue?.title ?? `#${numero}`} (${issue?.url ?? `https://github.com/diego-valdettaro/gestor-planilla-patty/issues/${numero}`})`,
    `  Rama:    ${rama}`,
    `  Base:    ${nombreBase}`,
    `  URL:     http://localhost:${puerto}`,
    "  Cuentas: admin · finanzas · rrhh · gerente-tiendas · gerente-administracion · gerente-sin-grupos (clave = usuario)",
  );
  const pasos = issue ? pasosDeQaManual(issue.body) : [];
  if (pasos.length) {
    lineas.push("  QA manual:");
    pasos.forEach((paso, indice) => lineas.push(`    ${indice + 1}. ${paso}`));
  } else {
    lineas.push("  QA manual: sin pasos disponibles; consultá la issue directamente.");
  }
  lineas.push("  Ctrl+C corta el servidor; el contenedor de PostgreSQL sigue activo. Al terminar la revisión: pnpm revisar:limpiar");
  return lineas;
}
