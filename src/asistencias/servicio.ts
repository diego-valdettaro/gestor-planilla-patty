import { db } from "@/db/client";

import { RepositorioPostgresDeAsistencias } from "./repositorio-postgres";

export const repositorioDeAsistencias = new RepositorioPostgresDeAsistencias(db);
