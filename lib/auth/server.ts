import type { NeonAuth } from "@neondatabase/auth/next/server";
let instance: NeonAuth | null | undefined;
export async function getAuth(): Promise<NeonAuth | null> {
  if (instance !== undefined) return instance;
  const baseUrl = process.env.NEON_AUTH_BASE_URL?.trim();
  const secret = process.env.NEON_AUTH_COOKIE_SECRET?.trim();
  if (!baseUrl || !secret || secret.length < 32) return (instance = null);
  const { createNeonAuth } = await import("@neondatabase/auth/next/server");
  return (instance = createNeonAuth({ baseUrl, cookies: { secret, sessionDataTtl: 300 }, logLevel: process.env.NODE_ENV === "production" ? "warn" : "info" }));
}

