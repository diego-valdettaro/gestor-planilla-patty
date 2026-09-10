import { db } from "@/db/client";

import { RepositorioPostgresDeTurnos } from "./repositorio-postgres";
import { RepositorioPostgresDeModelosDeHorario } from "./repositorio-postgres-modelos-de-horario";
import { RepositorioPostgresDeGrupos } from "./repositorio-postgres-grupos";

export const repositorioDeTurnos = new RepositorioPostgresDeTurnos(db);
export const repositorioDeModelosDeHorario = new RepositorioPostgresDeModelosDeHorario(db);
export const repositorioDeGrupos = new RepositorioPostgresDeGrupos(db);
