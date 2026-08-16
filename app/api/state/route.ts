import { actor, getState } from "@/lib/server-data";
import { enforceRateLimit, enforceSameOrigin, requireContentType } from "@/lib/security";
import { errorResponse, json } from "@/lib/http";
import { validatePayload } from "@/lib/validation";
import { authoriseStateAction } from "@/lib/state-actions/authorization";
import {
  handleCommunicationAction,
  isCommunicationAction,
} from "@/lib/state-actions/communications";
import { handleClientWorkpaperAction } from "@/lib/state-actions/client-workpapers";
import { handleRequestReviewAction } from "@/lib/state-actions/requests-review";
import { handlePracticeAdminAction } from "@/lib/state-actions/practice-admin";
import { handleConcernLockAction } from "@/lib/state-actions/concerns-lock";
import { resolvePublicBodyIds } from "@/lib/public-ids";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const who = await actor();
    return json(await getState(who));
  } catch (error) {
    return errorResponse(error, "Unable to load application data");
  }
}
export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    requireContentType(request, "json");
    const who = await actor();
    await enforceRateLimit(who.tenantId, `state:${who.email}`, 120, 60_000);
    const input = (await request.json()) as Record<string, unknown>;
    validatePayload(input);
    const action = String(input.action || "");
    const body = await resolvePublicBodyIds(who.tenantId, input);
    await authoriseStateAction(who, action, body);
    if (isCommunicationAction(action)) {
      const response = await handleCommunicationAction(action, body, who);
      if (response) return response;
      return json(await getState(who));
    }
    const handlers = [
      handleClientWorkpaperAction,
      handleRequestReviewAction,
      handlePracticeAdminAction,
      handleConcernLockAction,
    ];
    for (const handleAction of handlers) {
      const result = await handleAction(action, body, who);
      if (result === false) continue;
      if (result instanceof Response) return result;
      return json(await getState(who));
    }
    if (action !== "refresh")
      return Response.json({ error: "Unknown action" }, { status: 400 });
    return json(await getState(who));
  } catch (error) {
    return errorResponse(error, "Unable to save change");
  }
}
