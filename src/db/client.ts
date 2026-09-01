import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL debe estar definida para iniciar la aplicación.");
}

const pool = new Pool({ connectionString: databaseUrl });

export const db = drizzle({ client: pool, schema });
