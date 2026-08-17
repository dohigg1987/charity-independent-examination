import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";
const required = ["NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET"];
const secrets = Object.fromEntries(required.flatMap((name) => process.env[name] ? [[name, process.env[name]]] : []));
for (const name of required) if (!secrets[name]) throw new Error(`${name} is required.`);
if (String(secrets.NEON_AUTH_COOKIE_SECRET).length < 32) throw new Error("NEON_AUTH_COOKIE_SECRET must contain at least 32 characters.");
await mkdir(new URL("../.wrangler/", import.meta.url), { recursive: true });
const target = new URL("../.wrangler/deploy-secrets.json", import.meta.url);
await writeFile(target, `${JSON.stringify(secrets)}\n`, { mode: 0o600 });
process.stdout.write(target.pathname);

