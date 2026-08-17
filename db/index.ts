import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { PostgresD1Database } from "./postgres-d1";

export function getDb() {
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  if (connectionString) {
    return drizzle(new PostgresD1Database(connectionString), { schema });
  }
  if (!env.DB) {
    throw new Error(
      "Neon/Postgres is unavailable. Configure the Cloudflare HYPERDRIVE binding (or DATABASE_URL for local development). D1 is retained only for the isolated legacy preview."
    );
  }

  return drizzle(env.DB, { schema });
}

