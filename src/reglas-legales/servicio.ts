import { db } from "@/db/client";

import { RepositorioPostgresDeReglasLegales } from "./repositorio-postgres";

export const repositorioDeReglasLegales = new RepositorioPostgresDeReglasLegales(db);
