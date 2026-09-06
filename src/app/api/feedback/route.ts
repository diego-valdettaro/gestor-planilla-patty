import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { analizarFeedbackConOpenAI, crearIssueEnGitHub } from "@/feedback/infraestructura";
import { procesarFeedback } from "@/feedback/procesar-feedback";

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await obtenerActorActual();
    const datos = await request.json() as { comentario?: unknown; ruta?: unknown };
    if (typeof datos.comentario !== "string" || typeof datos.ruta !== "string") throw new Error("El comentario no es válido.");

    const issue = await procesarFeedback({ comentario: datos.comentario, ruta: datos.ruta, rol: actor.rol }, {
      analizar: analizarFeedbackConOpenAI,
      crearIssue: crearIssueEnGitHub,
    });
    return Response.json(issue, { status: 201 });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "No se pudo procesar el feedback.";
    return Response.json({ error: mensaje }, { status: 400 });
  }
}
