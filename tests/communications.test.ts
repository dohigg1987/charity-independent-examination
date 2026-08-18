import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  conversationTransitionIssue,
  statusAfterMessage,
} from "../lib/communications";

test("message direction deterministically assigns the next owner", () => {
  assert.equal(statusAfterMessage("INTERNAL"), "WAITING_CLIENT");
  assert.equal(statusAfterMessage("CLIENT"), "WAITING_PRACTICE");
});

test("conversation closure and reopening require an explanatory record", () => {
  assert.match(
    conversationTransitionIssue("WAITING_PRACTICE", "RESOLVED", "") ?? "",
    /resolution summary/i,
  );
  assert.equal(
    conversationTransitionIssue(
      "WAITING_PRACTICE",
      "RESOLVED",
      "The timetable was confirmed and no further action is required.",
    ),
    null,
  );
  assert.match(
    conversationTransitionIssue("RESOLVED", "OPEN", "") ?? "",
    /reason.*reopen/i,
  );
});

test("the communication data model supports threads, participants, receipts and message attachments", async () => {
  const schema = await readFile("db/schema.ts", "utf8");
  for (const control of [
    "conversationThreads",
    "conversationParticipants",
    "conversationMessages",
    "lastReadAt",
    "assignedTo",
    "deliveryStatus",
    "conversationThreadId",
    "conversationMessageId",
  ]) {
    assert.match(schema, new RegExp(control));
  }
  assert.match(schema, /uniqueIndex\("conversation_threads_request_id_idx"\)/);
  assert.match(schema, /uniqueIndex\("conversation_participants_thread_email_idx"\)/);
});

test("client and practitioner portals use the same server-backed conversation actions", async () => {
  const [route, actions, practitioner, client] = await Promise.all([
    readFile("app/api/state/route.ts", "utf8"),
    readFile("lib/state-actions/communications.ts", "utf8"),
    readFile("components/communications-workspace.tsx", "utf8"),
    readFile("components/client-messages.tsx", "utf8"),
  ]);
  assert.match(route, /handleCommunicationAction/);
  for (const action of [
    "createConversation",
    "sendConversationMessage",
    "markConversationRead",
    "updateConversation",
  ]) {
    assert.match(actions, new RegExp(`action === "${action}"`));
  }
  for (const surface of [practitioner, client]) {
    assert.match(surface, /sendConversationMessage/);
    assert.match(surface, /markConversationRead/);
    assert.match(surface, /conversationMessageId/);
    assert.match(surface, /messageReceipt/);
    assert.match(surface, /read \? "Read" : "Sent"/);
  }
  assert.match(
    practitioner,
    /<Button\s+type="submit"[^>]*>[\s\S]*Send<\/Button>/,
  );
});

test("conversation files are tenant-scoped and visible to authorised client participants only", async () => {
  const files = await readFile("app/api/files/route.ts", "utf8");
  assert.match(files, /thread\.engagementId !== engagementId/);
  assert.match(files, /canRespondForClient\(who, engagement\.clientId\)/);
  assert.match(files, /doc\.requestId !== null \|\| doc\.conversationThreadId !== null/);
  assert.match(files, /thread\.status === "RESOLVED"/);
});
