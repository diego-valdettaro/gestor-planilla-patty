import { createServer } from "node:net";

export async function puertoDisponible(): Promise<number> {
  const servidor = createServer();

  return new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", () => {
      const direccion = servidor.address();
      if (!direccion || typeof direccion === "string") {
        reject(new Error("No se pudo reservar un puerto temporal."));
        return;
      }
      servidor.close((error) => error ? reject(error) : resolve(direccion.port));
    });
  });
}
