export interface FeedbackRecibido {
  comentario: string;
  ruta: string;
  rol: "operaciones" | "administracion" | "finanzas";
}

export interface PropuestaDeIssue {
  titulo: string;
  resumen: string;
  criteriosDeAceptacion: string[];
}

export interface DependenciasDeFeedback {
  analizar(feedback: FeedbackRecibido): Promise<PropuestaDeIssue>;
  crearIssue(propuesta: PropuestaDeIssue, feedback: FeedbackRecibido): Promise<{ url: string }>;
}

export async function procesarFeedback(
  feedback: FeedbackRecibido,
  dependencias: DependenciasDeFeedback,
): Promise<{ url: string }> {
  if (!feedback.comentario.trim()) throw new Error("Escriba un comentario antes de enviarlo.");
  if (feedback.comentario.length > 5_000) throw new Error("El comentario no puede superar los 5.000 caracteres.");
  if (!feedback.ruta.startsWith("/")) throw new Error("La página de origen no es válida.");

  const propuesta = await dependencias.analizar({
    ...feedback,
    comentario: feedback.comentario.trim(),
  });

  if (!propuesta.titulo.trim() || !propuesta.resumen.trim() || !propuesta.criteriosDeAceptacion.length) {
    throw new Error("No se pudo preparar el issue a partir del comentario.");
  }

  return dependencias.crearIssue(propuesta, feedback);
}
