import { readdir, readFile } from "node:fs/promises";
const acceptedBaseline = "0017_productive_mole_man.sql";
const files = (await readdir(new URL("../drizzle/", import.meta.url))).filter((name) => name.endsWith(".sql") && name > acceptedBaseline).sort();
const destructive = /\b(DROP\s+(?:TABLE|COLUMN|INDEX)|TRUNCATE|ALTER\s+TABLE\s+\S+\s+RENAME)\b/i;
for (const file of files) {
  const sql = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
  if (destructive.test(sql) && process.env.ALLOW_DESTRUCTIVE_MIGRATIONS !== "true") throw new Error(`${file} contains a destructive operation. Use the audited manual override only after a restore rehearsal.`);
}
console.log(`Checked ${files.length} migrations after the accepted pre-Neon baseline.`);

