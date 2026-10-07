import { db } from "@/db/client";

import { RepositorioPostgresDeCondicionesLaborales } from "./repositorio-postgres";

export const repositorioDeCondicionesLaborales = new RepositorioPostgresDeCondicionesLaborales(db);
