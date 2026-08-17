import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const connectionString = process.env.NEON_DATABASE_URL?.trim();
if (!connectionString) throw new Error("NEON_DATABASE_URL is required for release migrations.");
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["clarity-ie-release-migrations-v1"]);
  await client.query("CREATE TABLE IF NOT EXISTS _clarity_schema_migrations (id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  const files = (await readdir(new URL("../drizzle/", import.meta.url))).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const source = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    const checksum = createHash("sha256").update(source).digest("hex");
    const existing = await client.query("SELECT checksum FROM _clarity_schema_migrations WHERE id = $1", [file]);
    if (existing.rows[0]) { if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration ${file} has changed.`); continue; }
    for (const raw of source.split("--> statement-breakpoint")) {
      const sql = translate(raw);
      if (sql) await client.query(sql);
    }
    await client.query("INSERT INTO _clarity_schema_migrations (id, checksum) VALUES ($1, $2)", [file, checksum]);
    console.log(`Applied ${file}`);
  }
  await client.query("COMMIT");
} catch (error) { await client.query("ROLLBACK"); throw error; }
finally { await client.end(); }

function translate(source) {
  let sql = source.trim();
  if (!sql || /^PRAGMA\b/i.test(sql)) return "";
  sql = sql.replaceAll("`", '"')
    .replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, "BIGSERIAL PRIMARY KEY")
    .replace(/\bREAL\b/gi, "DOUBLE PRECISION")
    .replace(/\bBLOB\b/gi, "BYTEA")
    .replace(/\bDROP\s+TABLE\s+("[^"]+"|\w+)\s*;?$/i, "DROP TABLE $1 CASCADE")
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
  if (/INSERT\s+INTO/i.test(sql) && /INSERT\s+OR\s+IGNORE\s+INTO/i.test(source) && !/ON\s+CONFLICT/i.test(sql)) sql = `${sql.replace(/;\s*$/, "")} ON CONFLICT DO NOTHING`;
  return sql;
}

