import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import {
  canManagePractice,
  canPrepare,
  canRespondForClient,
  canReview,
  requirePermission,
  type Principal,
} from "@/lib/authz";

const practiceActions = new Set([
  "createClient",
  "updateClient",
  "createEngagement",
  "updateEngagement",
  "addTeamMember",
  "updateTeamMember",
  "addTrustee",
  "updateTrustee",
  "addClientUser",
  "updateClientUser",
  "updatePracticeSettings",
]);

const platformManagedActions = new Set([
  "updateJurisdiction",
  "createJurisdictionRuleSet",
  "updateJurisdictionRuleSet",
  "publishJurisdictionRuleSet",
  "saveAndPublishJurisdictionRuleSet",
  "createOrganisationType",
  "updateOrganisationType",
]);

const reviewActions = new Set([
  "createReviewNote",
  "resolveNote",
  "reopenNote",
  "resolveConcern",
  "reviewConcern",
  "reopenConcern",
  "lockEngagement",
  "reopenEngagement",
  "setReportConclusion",
  "updateQualityReview",
  "updateGate",
  "moveToReview",
]);

const clientActions = new Set([
  "addClientReply",
  "createConversation",
  "sendConversationMessage",
  "markConversationRead",
  "refresh",
]);

export async function authoriseStateAction(
  principal: Principal,
  action: string,
  body: Record<string, unknown>,
): Promise<void> {
  if (principal.kind === "CLIENT") {
    requirePermission(
      clientActions.has(action),
      "Client accounts may only use authorised portal collaboration actions",
    );
    if (action === "addClientReply" || action === "createConversation") {
      const engagementId = Number(body.engagementId);
      const engagement = (
        await getDb()
          .select()
          .from(s.engagements)
          .where(
            and(
              eq(s.engagements.id, engagementId),
              eq(s.engagements.tenantId, principal.tenantId),
            ),
          )
          .limit(1)
      )[0];
      requirePermission(
        Boolean(engagement) &&
          canRespondForClient(principal, engagement.clientId),
        "This engagement is not available to the signed-in client",
      );
    }
    return;
  }

  requirePermission(
    !platformManagedActions.has(action),
    "Regulatory master data is platform-managed and cannot be changed from a tenant workspace",
  );

  if (practiceActions.has(action))
    requirePermission(
      canManagePractice(principal),
      "Practice administrator permission is required",
    );
  else if (reviewActions.has(action))
    requirePermission(canReview(principal), "Reviewer permission is required");
  else
    requirePermission(
      canPrepare(principal),
      "Engagement team permission is required",
    );
}
