import { db } from "@/db/client";

import { RepositorioPostgresDeTardanzas } from "./repositorio-postgres";

export const repositorioDeTardanzas = new RepositorioPostgresDeTardanzas(db);
