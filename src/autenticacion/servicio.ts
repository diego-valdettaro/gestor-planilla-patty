import { db } from "@/db/client";

import { RepositorioPostgresDeCuentas } from "./repositorio-postgres";

export const repositorioDeCuentas = new RepositorioPostgresDeCuentas(db);
