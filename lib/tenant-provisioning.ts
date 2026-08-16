import { getDb } from "@/db";
import * as s from "@/db/schema";

export type TenantProvisioningRequest = {
  name: string;
  slug: string;
  administratorName: string;
  administratorEmail: string;
};

/**
 * Control-plane primitive for creating an isolated practice workspace.
 * This function is intentionally not reachable from an application route.
 */
export async function provisionTenant(input: TenantProvisioningRequest) {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const administratorName = input.administratorName.trim();
  const administratorEmail = input.administratorEmail.trim().toLowerCase();
  if (!name || !administratorName)
    throw new Error("Practice and administrator names are required");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error("Practice slug must contain lowercase letters, numbers and hyphens");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(administratorEmail))
    throw new Error("A valid administrator email is required");

  const tenantId = crypto.randomUUID();
  const db = getDb();
  await db.batch([
    db.insert(s.tenants).values({ id: tenantId, slug, name }),
    db.insert(s.practiceSettings).values({
      tenantId,
      updatedBy: administratorEmail,
    }),
    db.insert(s.users).values({
      tenantId,
      email: administratorEmail,
      name: administratorName,
      role: "ADMIN",
      status: "ACTIVE",
    }),
  ]);
  return { tenantId, slug, administratorEmail };
}
