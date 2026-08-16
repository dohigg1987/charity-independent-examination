import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { AccessDeniedError } from "@/lib/authz";

export const DEVELOPMENT_TENANT_ID = "00000000-0000-4000-8000-000000000001";
const TENANT_HEADER = "x-clarity-tenant";

export async function requestedTenantId(): Promise<string | null> {
  const value = (await headers()).get(TENANT_HEADER)?.trim();
  return value || null;
}

export async function resolveInternalMembership(email: string) {
  const requested = await requestedTenantId();
  const db = getDb();
  const rows = await db
    .select()
    .from(s.users)
    .where(
      requested
        ? and(
            eq(s.users.email, email),
            eq(s.users.tenantId, requested),
            eq(s.users.status, "ACTIVE"),
          )
        : and(eq(s.users.email, email), eq(s.users.status, "ACTIVE")),
    );
  if (rows.length > 1)
    throw new AccessDeniedError(
      "Select a practice before continuing. Tenant selection cannot be inferred.",
    );
  return rows[0] ?? null;
}

export async function resolveClientMemberships(email: string) {
  const requested = await requestedTenantId();
  const db = getDb();
  const rows = await db
    .select()
    .from(s.clientUsers)
    .where(
      requested
        ? and(
            eq(s.clientUsers.email, email),
            eq(s.clientUsers.tenantId, requested),
            eq(s.clientUsers.status, "ACTIVE"),
          )
        : and(
            eq(s.clientUsers.email, email),
            eq(s.clientUsers.status, "ACTIVE"),
          ),
    );
  const tenants = new Set(rows.map((row) => row.tenantId));
  if (tenants.size > 1)
    throw new AccessDeniedError(
      "Select a practice before continuing. Tenant selection cannot be inferred.",
    );
  return rows;
}

export function tenantWhere<T>(tenantId: string, column: T) {
  return eq(column as Parameters<typeof eq>[0], tenantId);
}

export function requireTenantRow<T extends { tenantId: string }>(
  row: T | undefined,
  tenantId: string,
  notFoundMessage: string,
): T {
  if (!row || row.tenantId !== tenantId) throw new Error(notFoundMessage);
  return row;
}
