import { env } from "cloudflare:workers";
import { Client } from "pg";

export const dynamic = "force-dynamic";

export async function GET() {
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  let database = false;
  if (connectionString) {
    const client = new Client({ connectionString });
    try { await client.connect(); database = Boolean((await client.query("SELECT 1 AS ok")).rows[0]?.ok); }
    catch { database = false; }
    finally { await client.end().catch(() => undefined); }
  }
  const objectStorage = Boolean(env.BUCKET);
  const healthy = database && objectStorage;
  return Response.json({
    status: healthy ? "ok" : "degraded",
    environment: env.APP_ENV ?? "unknown",
    commit: env.BUILD_COMMIT_SHA ?? "unknown",
    version: env.CF_VERSION_METADATA?.id ?? "unknown",
    checks: { database, objectStorage },
  }, { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } });
}

