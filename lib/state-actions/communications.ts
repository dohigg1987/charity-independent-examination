import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import {
  canAccessClient,
  canRespondForClient,
  requirePermission,
  type Principal,
} from "@/lib/authz";
import {
  CONVERSATION_CATEGORIES,
  CONVERSATION_PRIORITIES,
  CONVERSATION_STATUSES,
  conversationTransitionIssue,
  statusAfterMessage,
  type ConversationStatus,
} from "@/lib/communications";
import { prepareAuditInsert } from "@/lib/server-data";
import { requireOneOf } from "@/lib/validation";
import { requireOpenEngagement } from "@/lib/state-actions/engagements";

const communicationActions = new Set([
  "createConversation",
  "sendConversationMessage",
  "markConversationRead",
  "updateConversation",
  "addClientReply",
]);

export function isCommunicationAction(action: string): boolean {
  return communicationActions.has(action);
}

export function randomInternalId(): number {
  const words = crypto.getRandomValues(new Uint32Array(2));
  return (words[0] & 0x1fffff) * 0x100000000 + words[1];
}

async function accessibleConversation(id: number, who: Principal) {
  const db = getDb();
  const thread = (
    await db
      .select()
      .from(s.conversationThreads)
      .where(
        and(
          eq(s.conversationThreads.id, id),
          eq(s.conversationThreads.tenantId, who.tenantId),
        ),
      )
      .limit(1)
  )[0];
  if (!thread) throw new Error("Conversation not found");
  const engagement = (
    await db
      .select()
      .from(s.engagements)
      .where(
        and(
          eq(s.engagements.id, thread.engagementId),
          eq(s.engagements.tenantId, who.tenantId),
        ),
      )
      .limit(1)
  )[0];
  requirePermission(
    Boolean(engagement) &&
      canAccessClient(who, engagement.clientId, engagement.tenantId),
    "This conversation is not available to the signed-in account",
  );
  if (
    who.kind === "CLIENT" &&
    who.clientRoles[engagement.clientId] !== "PORTAL_ADMIN"
  ) {
    const participant = (
      await db
        .select({ id: s.conversationParticipants.id })
        .from(s.conversationParticipants)
        .where(
          and(
            eq(s.conversationParticipants.threadId, id),
            eq(s.conversationParticipants.email, who.email.toLowerCase()),
            eq(s.conversationParticipants.tenantId, who.tenantId),
          ),
        )
        .limit(1)
    )[0];
    requirePermission(
      Boolean(participant),
      "This conversation is not assigned to the signed-in account",
    );
  }
  return { thread, engagement };
}

export async function upsertConversationParticipant(
  threadId: number,
  who: Principal,
  lastReadAt?: string,
) {
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(s.conversationParticipants)
      .where(
        and(
          eq(s.conversationParticipants.threadId, threadId),
          eq(s.conversationParticipants.email, who.email),
          eq(s.conversationParticipants.tenantId, who.tenantId),
        ),
      )
      .limit(1)
  )[0];
  if (existing) {
    if (lastReadAt)
      await db
        .update(s.conversationParticipants)
        .set({ lastReadAt })
        .where(
          and(
            eq(s.conversationParticipants.id, existing.id),
            eq(s.conversationParticipants.tenantId, who.tenantId),
          ),
        );
    return;
  }
  await db.insert(s.conversationParticipants).values({
    tenantId: who.tenantId,
    threadId,
    email: who.email,
    name: who.name,
    participantType: who.kind === "CLIENT" ? "CLIENT" : "PRACTICE",
    lastReadAt: lastReadAt ?? null,
  });
}

export async function prepareConversationParticipantWrite(
  threadId: number,
  who: Principal,
  lastReadAt?: string,
) {
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(s.conversationParticipants)
      .where(
        and(
          eq(s.conversationParticipants.threadId, threadId),
          eq(s.conversationParticipants.email, who.email),
          eq(s.conversationParticipants.tenantId, who.tenantId),
        ),
      )
      .limit(1)
  )[0];
  if (existing)
    return db
      .update(s.conversationParticipants)
      .set(lastReadAt ? { lastReadAt } : {})
      .where(
        and(
          eq(s.conversationParticipants.id, existing.id),
          eq(s.conversationParticipants.tenantId, who.tenantId),
        ),
      );
  return db.insert(s.conversationParticipants).values({
    tenantId: who.tenantId,
    threadId,
    email: who.email,
    name: who.name,
    participantType: who.kind === "CLIENT" ? "CLIENT" : "PRACTICE",
    lastReadAt: lastReadAt ?? null,
  });
}

export function conversationText(value: unknown, field = "Message") {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} is required`);
  if (text.length > 10_000)
    throw new Error(`${field} cannot exceed 10,000 characters`);
  return text;
}

export async function handleCommunicationAction(
  action: string,
  body: Record<string, unknown>,
  who: Principal,
): Promise<Response | null> {
  const db = getDb();

  if (action === "createConversation") {
    const engagementId = Number(body.engagementId);
    const engagement = await requireOpenEngagement(engagementId);
    requirePermission(
      canAccessClient(who, engagement.clientId, engagement.tenantId),
      "This engagement is not available to the signed-in account",
    );
    if (who.kind === "CLIENT")
      requirePermission(
        canRespondForClient(who, engagement.clientId),
        "Read-only client accounts cannot start conversations",
      );
    const subject = conversationText(body.subject, "Subject");
    if (subject.length > 160)
      return Response.json(
        { error: "Subject cannot exceed 160 characters" },
        { status: 400 },
      );
    const message = conversationText(body.message);
    const category = requireOneOf(
      String(body.category || "GENERAL"),
      CONVERSATION_CATEGORIES,
      "conversation category",
    );
    const priority =
      who.kind === "CLIENT"
        ? "NORMAL"
        : requireOneOf(
            String(body.priority || "NORMAL"),
            CONVERSATION_PRIORITIES,
            "conversation priority",
          );
    const requestId = body.requestId ? Number(body.requestId) : null;
    if (requestId) {
      const requestRow = (
        await db
          .select()
          .from(s.evidenceRequests)
          .where(
            and(
              eq(s.evidenceRequests.id, requestId),
              eq(s.evidenceRequests.tenantId, who.tenantId),
            ),
          )
          .limit(1)
      )[0];
      if (!requestRow || requestRow.engagementId !== engagementId)
        return Response.json(
          { error: "Linked request does not belong to this engagement" },
          { status: 400 },
        );
      const existing = (
        await db
          .select()
          .from(s.conversationThreads)
          .where(
            and(
              eq(s.conversationThreads.requestId, requestId),
              eq(s.conversationThreads.tenantId, who.tenantId),
            ),
          )
          .limit(1)
      )[0];
      if (existing)
        return Response.json(
          { error: "This evidence request already has a conversation" },
          { status: 409 },
        );
    }
    const now = new Date().toISOString();
    const threadId = randomInternalId(),
      threadPublicId = crypto.randomUUID(),
      messageId = randomInternalId(),
      messagePublicId = crypto.randomUUID();
    const threadInsert = db.insert(s.conversationThreads).values({
        id: threadId,
        publicId: threadPublicId,
        tenantId: who.tenantId,
        engagementId,
        requestId,
        subject,
        category,
        priority,
        status: statusAfterMessage(who.kind),
        assignedTo: who.kind === "INTERNAL" ? who.email : null,
        createdBy: who.email,
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
    const statements = [];
    statements.push(
      threadInsert,
      db.insert(s.conversationParticipants).values({
        id: randomInternalId(),
        publicId: crypto.randomUUID(),
        tenantId: who.tenantId,
        threadId,
        email: who.email,
        name: who.name,
        participantType: who.kind === "CLIENT" ? "CLIENT" : "PRACTICE",
        lastReadAt: now,
      }),
    );
    if (who.kind === "INTERNAL") {
      const client = (
        await db
          .select()
          .from(s.clients)
          .where(
            and(
              eq(s.clients.id, engagement.clientId),
              eq(s.clients.tenantId, who.tenantId),
            ),
          )
          .limit(1)
      )[0];
      if (client)
        statements.push(db.insert(s.conversationParticipants).values({
          id: randomInternalId(),
          publicId: crypto.randomUUID(),
          tenantId: who.tenantId,
          threadId,
          email: String(body.contactEmail || client.contactEmail)
            .trim()
            .toLowerCase(),
          name: String(body.contactName || client.contactName).trim(),
          participantType: "CLIENT",
        }));
    }
    statements.push(db.insert(s.conversationMessages).values({
        id: messageId,
        publicId: messagePublicId,
        tenantId: who.tenantId,
        threadId,
        authorEmail: who.email,
        authorName: who.name,
        authorType: who.kind === "CLIENT" ? "CLIENT" : "PRACTICE",
        body: message,
        createdAt: now,
      }));
    statements.push((await prepareAuditInsert(
      who.tenantId,
      engagementId,
      who.email,
      "CONVERSATION_CREATED",
      "conversation_thread",
      threadPublicId,
      { category, priority, requestId, firstMessageId: messagePublicId },
    )).statement);
    await db.batch(statements as [typeof statements[number], ...typeof statements[number][]]);
    return null;
  }

  if (action === "sendConversationMessage") {
    const threadId = Number(body.threadId);
    const { thread, engagement } = await accessibleConversation(threadId, who);
    if (who.kind === "CLIENT")
      requirePermission(
        canRespondForClient(who, engagement.clientId),
        "Read-only client accounts cannot send messages",
      );
    await requireOpenEngagement(thread.engagementId);
    if (thread.status === "RESOLVED")
      return Response.json(
        { error: "Reopen this conversation before adding a further message" },
        { status: 409 },
      );
    const message = conversationText(body.message);
    const replyToMessageId = body.replyToMessageId
      ? Number(body.replyToMessageId)
      : null;
    if (replyToMessageId) {
      const reply = (
        await db
          .select()
          .from(s.conversationMessages)
          .where(
            and(
              eq(s.conversationMessages.id, replyToMessageId),
              eq(s.conversationMessages.tenantId, who.tenantId),
            ),
          )
          .limit(1)
      )[0];
      if (!reply || reply.threadId !== threadId)
        return Response.json(
          { error: "The replied-to message is not in this conversation" },
          { status: 400 },
        );
    }
    const rawAttachmentIds = Array.isArray(body.attachmentIds)
      ? body.attachmentIds
      : [];
    const attachmentIds = rawAttachmentIds
      .map(Number)
      .filter((value) => Number.isInteger(value) && value > 0);
    if (attachmentIds.length > 5)
      return Response.json(
        { error: "A message can contain no more than five attachments" },
        { status: 400 },
      );
    const attachmentRows: (typeof s.documents.$inferSelect)[] = [];
    for (const documentId of attachmentIds) {
      const document = (
        await db
          .select()
          .from(s.documents)
          .where(
            and(
              eq(s.documents.id, documentId),
              eq(s.documents.tenantId, who.tenantId),
            ),
          )
          .limit(1)
      )[0];
      if (
        !document ||
        document.conversationThreadId !== threadId ||
        document.conversationMessageId !== null ||
        document.uploadedBy.toLowerCase() !== who.email.toLowerCase()
      )
        return Response.json(
          { error: "An attachment is not available for this message" },
          { status: 400 },
        );
      attachmentRows.push(document);
    }
    const now = new Date().toISOString(),
      messageId = randomInternalId(),
      messagePublicId = crypto.randomUUID();
    const statements = [];
    statements.push(db.insert(s.conversationMessages).values({
        id: messageId,
        publicId: messagePublicId,
        tenantId: who.tenantId,
        threadId,
        replyToMessageId,
        authorEmail: who.email,
        authorName: who.name,
        authorType: who.kind === "CLIENT" ? "CLIENT" : "PRACTICE",
        body: message,
        createdAt: now,
      }));
    for (const document of attachmentRows)
      statements.push(db
        .update(s.documents)
        .set({ conversationMessageId: messageId })
        .where(
          and(
            eq(s.documents.id, document.id),
            eq(s.documents.tenantId, who.tenantId),
          ),
        ));
    statements.push(db
      .update(s.conversationThreads)
      .set({
        status: statusAfterMessage(who.kind),
        lastMessageAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(s.conversationThreads.id, threadId),
          eq(s.conversationThreads.tenantId, who.tenantId),
        ),
      ));
    statements.push(await prepareConversationParticipantWrite(threadId, who, now));
    statements.push((await prepareAuditInsert(
      who.tenantId,
      thread.engagementId,
      who.email,
      "CONVERSATION_MESSAGE_SENT",
      "conversation_message",
      messagePublicId,
      { threadId: thread.publicId, replyToMessageId, attachmentIds },
    )).statement);
    await db.batch(statements as [typeof statements[number], ...typeof statements[number][]]);
    return null;
  }

  if (action === "markConversationRead") {
    const threadId = Number(body.threadId);
    const { thread } = await accessibleConversation(threadId, who);
    const participantWrite = await prepareConversationParticipantWrite(
        threadId,
        who,
        new Date().toISOString(),
      ),
      auditInsert = (await prepareAuditInsert(
        who.tenantId,
        thread.engagementId,
        who.email,
        "CONVERSATION_READ",
        "conversation_thread",
        String(threadId),
        {},
      )).statement;
    await db.batch(
      [participantWrite, auditInsert] as [
        typeof participantWrite,
        typeof auditInsert,
      ],
    );
    return null;
  }

  if (action === "updateConversation") {
    requirePermission(
      who.kind === "INTERNAL",
      "Only the engagement team can manage conversation status",
    );
    const threadId = Number(body.threadId);
    const { thread } = await accessibleConversation(threadId, who);
    await requireOpenEngagement(thread.engagementId);
    const status = requireOneOf(
      String(body.status || thread.status),
      CONVERSATION_STATUSES,
      "conversation status",
    );
    const priority = requireOneOf(
      String(body.priority || thread.priority),
      CONVERSATION_PRIORITIES,
      "conversation priority",
    );
    const assignedTo = Object.prototype.hasOwnProperty.call(body, "assignedTo")
      ? String(body.assignedTo || "").trim().toLowerCase() || null
      : thread.assignedTo;
    if (assignedTo) {
      const assignee = (
        await db
          .select()
          .from(s.users)
          .where(
            and(
              eq(s.users.email, assignedTo.toLowerCase()),
              eq(s.users.status, "ACTIVE"),
              eq(s.users.tenantId, who.tenantId),
            ),
          )
          .limit(1)
      )[0];
      if (!assignee)
        return Response.json(
          { error: "Conversation owner must be an active practice user" },
          { status: 400 },
        );
    }
    const resolutionNote = String(body.resolutionNote || "").trim();
    const transitionIssue = conversationTransitionIssue(
      thread.status as ConversationStatus,
      status as ConversationStatus,
      resolutionNote,
    );
    if (transitionIssue)
      return Response.json({ error: transitionIssue }, { status: 400 });
    const now = new Date().toISOString();
    const statements = [];
    statements.push(db
      .update(s.conversationThreads)
      .set({
        status,
        priority,
        assignedTo,
        resolvedAt:
          status === "RESOLVED"
            ? thread.status === "RESOLVED"
              ? thread.resolvedAt
              : now
            : null,
        resolvedBy:
          status === "RESOLVED"
            ? thread.status === "RESOLVED"
              ? thread.resolvedBy
              : who.email
            : null,
        updatedAt: now,
        lastMessageAt: resolutionNote ? now : thread.lastMessageAt,
      })
      .where(
        and(
          eq(s.conversationThreads.id, threadId),
          eq(s.conversationThreads.tenantId, who.tenantId),
        ),
      ));
    if (resolutionNote)
      statements.push(db.insert(s.conversationMessages).values({
        id: randomInternalId(),
        publicId: crypto.randomUUID(),
        tenantId: who.tenantId,
        threadId,
        authorEmail: who.email,
        authorName: who.name,
        authorType: "SYSTEM",
        body:
          status === "RESOLVED"
            ? `Conversation resolved: ${resolutionNote}`
            : `Conversation reopened: ${resolutionNote}`,
        createdAt: now,
      }));
    statements.push(await prepareConversationParticipantWrite(threadId, who, now));
    statements.push((await prepareAuditInsert(
      who.tenantId,
      thread.engagementId,
      who.email,
      status === "RESOLVED"
        ? "CONVERSATION_RESOLVED"
        : "CONVERSATION_UPDATED",
      "conversation_thread",
      thread.publicId,
      { status, priority, assignedTo, resolutionNote },
    )).statement);
    await db.batch(statements as [typeof statements[number], ...typeof statements[number][]]);
    return null;
  }

  if (action === "addClientReply") {
    const engagementId = Number(body.engagementId);
    const requestId = body.requestId ? Number(body.requestId) : null;
    const bodyText = conversationText(body.body, "Reply");
    if (!engagementId || !bodyText)
      return Response.json(
        { error: "Engagement and reply are required" },
        { status: 400 },
      );
    const engagement = await requireOpenEngagement(engagementId);
    let threadPublicId: string | null = null;
    const statements = [];
    if (requestId) {
      const evidenceRequest = (
        await db
          .select()
          .from(s.evidenceRequests)
          .where(
            and(
              eq(s.evidenceRequests.id, requestId),
              eq(s.evidenceRequests.tenantId, who.tenantId),
            ),
          )
          .limit(1)
      )[0];
      if (!evidenceRequest || evidenceRequest.engagementId !== engagementId)
        return Response.json(
          { error: "Evidence request does not belong to this engagement" },
          { status: 400 },
        );
      if (
        who.kind === "CLIENT" &&
        who.clientRoles[engagement.clientId] !== "PORTAL_ADMIN"
      )
        requirePermission(
          evidenceRequest.contactEmail.toLowerCase() ===
            who.email.toLowerCase(),
          "This evidence request is not assigned to the signed-in account",
        );
      const thread = (
        await db
          .select()
          .from(s.conversationThreads)
          .where(
            and(
              eq(s.conversationThreads.requestId, requestId),
              eq(s.conversationThreads.tenantId, who.tenantId),
            ),
          )
          .limit(1)
      )[0];
      if (thread?.status === "RESOLVED")
        return Response.json(
          { error: "Reopen the conversation before adding a response" },
          { status: 409 },
        );
      if (thread) {
        const now = new Date().toISOString();
        const messageId = randomInternalId();
        statements.push(db.insert(s.conversationMessages).values({
            id: messageId,
            publicId: crypto.randomUUID(),
            tenantId: who.tenantId,
            threadId: thread.id,
            authorEmail: who.email,
            authorName: who.name,
            authorType: who.kind === "CLIENT" ? "CLIENT" : "PRACTICE",
            body: bodyText,
            createdAt: now,
          }));
        threadPublicId = thread.publicId;
        statements.push(db
          .update(s.conversationThreads)
          .set({
            status: statusAfterMessage(who.kind),
            lastMessageAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(s.conversationThreads.id, thread.id),
              eq(s.conversationThreads.tenantId, who.tenantId),
            ),
          ));
        statements.push(await prepareConversationParticipantWrite(thread.id, who, now));
        statements.push(db
          .update(s.evidenceRequests)
          .set({ status: "RECEIVED", receivedAt: now })
          .where(
            and(
              eq(s.evidenceRequests.id, requestId),
              eq(s.evidenceRequests.tenantId, who.tenantId),
            ),
          ));
      } else {
        statements.push(db
          .update(s.evidenceRequests)
          .set({ status: "RECEIVED", receivedAt: new Date().toISOString() })
          .where(
            and(
              eq(s.evidenceRequests.id, requestId),
              eq(s.evidenceRequests.tenantId, who.tenantId),
            ),
          ));
      }
    }
    const commentPublicId = crypto.randomUUID();
    statements.push(db.insert(s.comments).values({
      id: randomInternalId(),
      publicId: commentPublicId,
      tenantId: who.tenantId,
      engagementId,
      requestId,
      authorEmail: who.email,
      authorName: who.name,
      visibility: "CLIENT",
      body: bodyText,
    }));
    statements.push((await prepareAuditInsert(
      who.tenantId,
      engagementId,
      who.email,
      "CLIENT_REPLY_ADDED",
      "comment",
      commentPublicId,
      {
        requestId,
        threadId: threadPublicId,
        status: requestId ? "RECEIVED" : "COMMENTED",
      },
    )).statement);
    await db.batch(statements as [typeof statements[number], ...typeof statements[number][]]);
    return null;
  }

  throw new Error(`Unsupported communication action: ${action}`);
}
