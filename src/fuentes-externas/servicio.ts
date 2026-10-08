import { db } from "@/db/client";

import { RepositorioPostgresDeFuentesExternas } from "./repositorio-postgres";

export const repositorioDeFuentesExternas = new RepositorioPostgresDeFuentesExternas(db);
