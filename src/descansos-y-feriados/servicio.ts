import { db } from "@/db/client";

import { RepositorioPostgresDeDescansosYFeriados } from "./repositorio-postgres";

export const repositorioDeDescansosYFeriados = new RepositorioPostgresDeDescansosYFeriados(db);
