import { db } from "@/db/client";

import { RepositorioPostgresDeRelacionesLaborales } from "./repositorio-postgres";

export const repositorioDeRelacionesLaborales = new RepositorioPostgresDeRelacionesLaborales(db);
