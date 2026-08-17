"use client";
type AuthModule = typeof import("@neondatabase/auth/next");
type ClarityAuthClient = ReturnType<AuthModule["createAuthClient"]>;
let instance: ClarityAuthClient | undefined;
export async function getAuthClient(): Promise<ClarityAuthClient> {
  if (instance) return instance;
  const { createAuthClient } = await import("@neondatabase/auth/next");
  return (instance = createAuthClient());
}

