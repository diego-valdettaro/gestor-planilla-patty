import { db } from "@/db/client";
import { RepositorioPostgresDePeriodos } from "./repositorio-postgres";
export const repositorioDePeriodos = new RepositorioPostgresDePeriodos(db);
