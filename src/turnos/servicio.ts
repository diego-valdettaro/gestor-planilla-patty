import { db } from "@/db/client";

import { RepositorioPostgresDeTurnos } from "./repositorio-postgres";

export const repositorioDeTurnos = new RepositorioPostgresDeTurnos(db);
