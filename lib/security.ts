import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { RequestSecurityError } from "@/lib/file-security";
export {
  RequestSecurityError,
  safeDownloadName,
  securityHeaders,
  verifyFile,
} from "@/lib/file-security";

export function enforceSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const target = new URL(request.url);
  if (new URL(origin).origin !== target.origin) {
    throw new RequestSecurityError("Cross-origin request rejected", 403);
  }
}

export function requireContentType(
  request: Request,
  expected: "json" | "multipart",
): void {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const valid =
    expected === "json"
      ? contentType.startsWith("application/json")
      : contentType.startsWith("multipart/form-data");
  if (!valid)
    throw new RequestSecurityError(`Expected ${expected} request content`, 415);
}

export async function enforceRateLimit(
  tenantId: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const row = (
    await db
      .select()
      .from(s.rateLimits)
      .where(eq(s.rateLimits.key, `${tenantId}:${key}`))
      .limit(1)
  )[0];
  if (!row || now - row.windowStart >= windowMs) {
    await db
      .insert(s.rateLimits)
      .values({ tenantId, key: `${tenantId}:${key}`, windowStart: now, count: 1 })
      .onConflictDoUpdate({
        target: s.rateLimits.key,
        set: { windowStart: now, count: 1 },
      });
    return;
  }
  if (row.count >= limit)
    throw new RequestSecurityError("Request rate limit exceeded", 429);
  await db
    .update(s.rateLimits)
    .set({ count: row.count + 1 })
    .where(eq(s.rateLimits.key, `${tenantId}:${key}`));
}
