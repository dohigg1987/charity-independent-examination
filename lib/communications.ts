export const CONVERSATION_CATEGORIES = [
  "GENERAL",
  "EVIDENCE",
  "GOVERNANCE",
  "REPORTING",
  "TECHNICAL",
] as const;

export const CONVERSATION_PRIORITIES = ["NORMAL", "HIGH", "URGENT"] as const;

export const CONVERSATION_STATUSES = [
  "OPEN",
  "WAITING_CLIENT",
  "WAITING_PRACTICE",
  "RESOLVED",
] as const;

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export function statusAfterMessage(actorKind: "INTERNAL" | "CLIENT"):
  | "WAITING_CLIENT"
  | "WAITING_PRACTICE" {
  return actorKind === "CLIENT" ? "WAITING_PRACTICE" : "WAITING_CLIENT";
}

export function conversationTransitionIssue(
  current: ConversationStatus,
  next: ConversationStatus,
  note: string,
): string | null {
  if (next === "RESOLVED" && current !== "RESOLVED" && !note.trim())
    return "A resolution summary is required to close a conversation";
  if (current === "RESOLVED" && next !== "RESOLVED" && !note.trim())
    return "A reason is required to reopen a conversation";
  return null;
}
