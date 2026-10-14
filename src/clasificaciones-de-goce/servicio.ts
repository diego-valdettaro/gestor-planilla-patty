import { db } from "@/db/client";

import { RepositorioPostgresDeClasificacionesDeGoce } from "./repositorio-postgres";

export const repositorioDeClasificacionesDeGoce = new RepositorioPostgresDeClasificacionesDeGoce(db);
