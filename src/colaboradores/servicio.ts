import { db } from "@/db/client";

import { RepositorioPostgresDeColaboradores } from "./repositorio-postgres";

export const repositorioDeColaboradores = new RepositorioPostgresDeColaboradores(db);
