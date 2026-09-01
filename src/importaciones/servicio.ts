import { db } from "@/db/client";

import { RepositorioPostgresDeImportaciones } from "./repositorio-postgres";

export const repositorioDeImportaciones = new RepositorioPostgresDeImportaciones(db);
