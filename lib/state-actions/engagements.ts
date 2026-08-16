import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { actor } from "@/lib/server-data";

export async function requireOpenEngagement(engagementId: number) {
  const who = await actor();
  const row = (
    await getDb()
      .select()
      .from(s.engagements)
      .where(
        and(
          eq(s.engagements.id, engagementId),
          eq(s.engagements.tenantId, who.tenantId),
        ),
      )
      .limit(1)
  )[0];
  if (!row) throw new Error("Engagement not found");
  if (row.lockedAt)
    throw new Error(
      "This annual file is locked. Reopen it with a documented reason before making changes.",
    );
  return row;
}
