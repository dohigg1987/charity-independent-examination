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
    const statements = orderCreateTablesBeforeDependants(
      source.split("--> statement-breakpoint").map(translate).filter(Boolean),
    );
    for (const [index, sql] of statements.entries()) {
      try { await client.query(sql); }
      catch (error) { throw new Error(`${file} statement ${index + 1}: ${error instanceof Error ? error.message : "migration failed"}; SQL: ${sql.slice(0, 180).replace(/\s+/g, " ")}`, { cause: error }); }
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
  // A newly provisioned Neon baseline has no pre-0017 D1 audit rows to seal.
  // The SQLite-only recursive FNV expression is intentionally omitted; all
  // audit events subsequently written to Neon use the application SHA-256 chain.
  if (/^WITH\s+RECURSIVE\b/i.test(sql) && /__audit_legacy_fingerprints/i.test(sql)) return "";
  if (/^CREATE\s+TRIGGER\b/i.test(sql)) {
    if (/_tenant_update_guard\b/i.test(sql)) return "";
    if (/_tenant_insert_guard\b/i.test(sql)) {
      const table = sql.match(/\bON\s+`([^`]+)`/i)?.[1];
      if (!table) throw new Error("Could not identify tenant guard table.");
      return `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" SET NOT NULL, ALTER COLUMN "public_id" SET NOT NULL`;
    }
    return translateTrigger(sql);
  }
  if (/^DROP\s+TRIGGER\b/i.test(sql)) return translateDropTrigger(sql);
  sql = sql.replaceAll("`", '"')
    .replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, "BIGSERIAL PRIMARY KEY")
    .replace(/\bREAL\b/gi, "DOUBLE PRECISION")
    .replace(/\bBLOB\b/gi, "BYTEA")
    .replace(/\bDEFAULT\s+false\b/gi, "DEFAULT 0")
    .replace(/\bDEFAULT\s+true\b/gi, "DEFAULT 1")
    .replace(/date\(("[^"]+"),\s*'-1 year',\s*'\+1 day'\)/gi, "((CAST($1 AS date) - INTERVAL '1 year' + INTERVAL '1 day')::text)")
    .replace(/printf\('%03d',\s*("[^"]+")\)/gi, "lpad($1::text, 3, '0')")
    .replace(/COALESCE\(([^)]*),\s*CURRENT_TIMESTAMP\)/gi, "COALESCE($1, CURRENT_TIMESTAMP::text)")
    .replace(/,\s*true\s*,/gi, ", 1,")
    .replace(/lower\(hex\(randomblob\(4\)\).*?hex\(randomblob\(6\)\)\)/gi, "gen_random_uuid()::text")
    .replace(/\bunicode\s*\(/gi, "ascii(")
    .replace(/\bDROP\s+TABLE\s+("[^"]+"|\w+)\s*;?$/i, "DROP TABLE $1 CASCADE")
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
  if (/INSERT\s+INTO/i.test(sql) && /INSERT\s+OR\s+IGNORE\s+INTO/i.test(source) && !/ON\s+CONFLICT/i.test(sql)) sql = `${sql.replace(/;\s*$/, "")} ON CONFLICT DO NOTHING`;
  return sql;
}

function orderCreateTablesBeforeDependants(statements) {
  const creates = new Map();
  const remainder = [];
  for (const sql of statements) {
    const match = sql.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("[^"]+"|\w+)/i);
    if (match) creates.set(unquote(match[1]), sql);
    else remainder.push(sql);
  }

  const ordered = [];
  const pending = new Map(creates);
  while (pending.size) {
    let progressed = false;
    for (const [table, sql] of pending) {
      const dependencies = [...sql.matchAll(/REFERENCES\s+("[^"]+"|\w+)/gi)]
        .map((match) => unquote(match[1]))
        .filter((dependency) => dependency !== table && creates.has(dependency));
      if (dependencies.some((dependency) => pending.has(dependency))) continue;
      ordered.push(sql);
      pending.delete(table);
      progressed = true;
    }
    if (!progressed) {
      throw new Error(`Cyclic table dependencies in migration: ${[...pending.keys()].join(", ")}`);
    }
  }
  return [...ordered, ...remainder];
}

function unquote(identifier) {
  return identifier.startsWith('"') ? identifier.slice(1, -1) : identifier;
}

function translateTrigger(source) {
  const sql = source.replaceAll("`", '"').trim().replace(/;\s*$/, "");
  const match = sql.match(/^CREATE\s+TRIGGER\s+"([^"]+)"\s+(BEFORE|AFTER)\s+([\s\S]+?)\s+ON\s+"([^"]+)"\s+([\s\S]+)$/i);
  if (!match) throw new Error(`Unsupported SQLite trigger header: ${sql.slice(0, 100)}`);
  const [, name, timing, event, table, rest] = match;
  const beginAt = rest.search(/\bBEGIN\b/i);
  if (beginAt < 0) throw new Error(`Unsupported SQLite trigger body: ${name}`);
  const prefix = rest.slice(0, beginAt).trim();
  const condition = prefix.replace(/^WHEN\s+/i, "").trim();
  const body = rest.slice(beginAt + 5).replace(/\bEND\s*$/i, "").trim().replace(/;\s*$/, "");
  const abort = body.match(/^SELECT\s+RAISE\(ABORT,\s*'((?:''|[^'])*)'\)$/i);
  const returnValue = /^DELETE\b/i.test(event) ? "OLD" : "NEW";
  const functionName = `clarity_trigger_${name}`;
  let functionBody;
  if (abort) {
    const message = abort[1].replaceAll("'", "''");
    functionBody = `${condition ? `IF (${translateTriggerExpression(condition)}) THEN ` : ""}RAISE EXCEPTION '${message}';${condition ? " END IF;" : ""}`;
  } else {
    if (condition) throw new Error(`Unsupported conditional action trigger: ${name}`);
    functionBody = `${translateTriggerExpression(body)};`;
  }
  return `CREATE OR REPLACE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $clarity$ BEGIN ${functionBody} RETURN ${returnValue}; END $clarity$; CREATE TRIGGER "${name}" ${timing.toUpperCase()} ${event} ON "${table}" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`;
}

function translateTriggerExpression(source) {
  return source.replaceAll("`", '"')
    .replace(/\bIS\s+NOT\s+(?!NULL\b)/gi, "IS DISTINCT FROM ")
    .replace(/\bIS\s+NOT\s+OLD\./gi, "IS DISTINCT FROM OLD.")
    .replace(/\bIS\s+OLD\./gi, "IS NOT DISTINCT FROM OLD.")
    .replace(/([A-Za-z]+\."[^"]+")\s+GLOB\s+'\*\[\^0-9a-f\]\*'/gi, "$1 ~ '[^0-9a-f]'");
}

function translateDropTrigger(source) {
  const name = source.match(/^DROP\s+TRIGGER\s+`?([^`;\s]+)`?/i)?.[1];
  if (!name) throw new Error("Could not identify trigger to drop.");
  const literal = name.replaceAll("'", "''");
  return `DO $clarity$ DECLARE target record; BEGIN FOR target IN SELECT n.nspname, c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE t.tgname='${literal}' LOOP EXECUTE format('DROP TRIGGER %I ON %I.%I', '${literal}', target.nspname, target.relname); END LOOP; END $clarity$`;
}

