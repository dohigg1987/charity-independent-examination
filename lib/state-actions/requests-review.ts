import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { prepareAuditInsert } from "@/lib/server-data";
import type { Principal } from "@/lib/authz";
import {
  prepareConversationParticipantWrite,
  randomInternalId,
} from "@/lib/state-actions/communications";
import { statusAfterMessage } from "@/lib/communications";
import { requireOpenEngagement as requireOpen } from "@/lib/state-actions/engagements";

export type StateActionResult = Response | true | false;

const actions = new Set([
  "addComment",
  "createRequest",
  "updateRequest",
  "createReviewNote",
  "resolveNote",
  "reopenNote",
]);

export async function handleRequestReviewAction(
  action: string,
  body: Record<string, unknown>,
  who: Principal,
): Promise<StateActionResult> {
  if (!actions.has(action)) return false;
  const db = getDb();
    if (action === "addComment") {
      const bodyText = String(body.body || "").trim();
      if (!bodyText)
        return Response.json({ error: "Comment is required" }, { status: 400 });
      const engagementId = Number(body.engagementId);
      if (!engagementId)
        return Response.json(
          { error: "Engagement is required" },
          { status: 400 },
        );
      await requireOpen(engagementId);
      const taskId = body.taskId ? Number(body.taskId) : null;
      const requestId = body.requestId ? Number(body.requestId) : null;
      if (taskId) {
        const task = (
          await db
            .select({ engagementId: s.tasks.engagementId })
            .from(s.tasks)
            .where(
              and(
                eq(s.tasks.id, taskId),
                eq(s.tasks.tenantId, who.tenantId),
              ),
            )
            .limit(1)
        )[0];
        if (!task || task.engagementId !== engagementId)
          return Response.json(
            { error: "Linked task does not belong to this engagement" },
            { status: 400 },
          );
      }
      if (requestId) {
        const evidenceRequest = (
          await db
            .select({ engagementId: s.evidenceRequests.engagementId })
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
            { error: "Linked request does not belong to this engagement" },
            { status: 400 },
          );
      }
      const visibility = String(body.visibility || "INTERNAL");
      const commentPublicId = crypto.randomUUID();
      const statements = [];
      statements.push(
        db.insert(s.comments).values({
          id: randomInternalId(),
          tenantId: who.tenantId,
          publicId: commentPublicId,
          engagementId,
          taskId,
          requestId,
          authorEmail: who.email,
          authorName: who.name,
          visibility,
          body: bodyText,
        }),
      );
      if (requestId) {
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
        if (thread) {
          const now = new Date().toISOString();
          statements.push(
            db.insert(s.conversationMessages).values({
              id: randomInternalId(),
              tenantId: who.tenantId,
              publicId: crypto.randomUUID(),
              threadId: thread.id,
              authorEmail: who.email,
              authorName: who.name,
              authorType: who.kind === "CLIENT" ? "CLIENT" : "PRACTICE",
              body: bodyText,
              createdAt: now,
            }),
            db
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
              ),
            await prepareConversationParticipantWrite(thread.id, who, now),
          );
        }
      }
      statements.push(
        (await prepareAuditInsert(
          who.tenantId,
          engagementId,
          who.email,
          "COMMENT_ADDED",
          "comment",
          commentPublicId,
          { taskId: body.taskId },
        )).statement,
      );
      await db.batch(
        statements as [
          (typeof statements)[number],
          ...(typeof statements)[number][],
        ],
      );
    } else if (action === "createRequest") {
      const engagementId = Number(body.engagementId),
        procedureId = body.procedureId ? Number(body.procedureId) : null;
      if (!engagementId)
        return Response.json(
          { error: "Engagement is required" },
          { status: 400 },
        );
      await requireOpen(engagementId);
      let taskId = body.taskId ? Number(body.taskId) : null;
      if (procedureId) {
        const procedure = (
          await db
            .select()
            .from(s.procedures)
            .where(and(eq(s.procedures.id, procedureId), eq(s.procedures.tenantId, who.tenantId)))
            .limit(1)
        )[0];
        if (!procedure)
          return Response.json(
            { error: "Linked procedure not found" },
            { status: 404 },
          );
        const task = (
          await db
            .select()
            .from(s.tasks)
            .where(and(eq(s.tasks.id, procedure.taskId), eq(s.tasks.tenantId, who.tenantId)))
            .limit(1)
        )[0];
        if (!task || task.engagementId !== engagementId)
          return Response.json(
            { error: "Linked procedure does not belong to this engagement" },
            { status: 400 },
          );
        taskId = task.id;
      } else if (taskId) {
        const task = (
          await db
            .select({ engagementId: s.tasks.engagementId })
            .from(s.tasks)
            .where(
              and(
                eq(s.tasks.id, taskId),
                eq(s.tasks.tenantId, who.tenantId),
              ),
            )
            .limit(1)
        )[0];
        if (!task || task.engagementId !== engagementId)
          return Response.json(
            { error: "Linked task does not belong to this engagement" },
            { status: 400 },
          );
      }
      const ref = `REQ-${String(Date.now()).slice(-5)}`;
      const requestId = randomInternalId();
      const requestPublicId = crypto.randomUUID();
      const title = String(body.title || "Evidence request");
      const description = String(
        body.description || "Please provide the requested evidence.",
      );
      const contactName = String(body.contactName || "Client contact");
      const contactEmail = String(
        body.contactEmail || "client@example.org",
      );
      const requestInsert = db.insert(s.evidenceRequests).values({
        id: requestId,
        tenantId: who.tenantId,
        publicId: requestPublicId,
        engagementId,
        taskId,
        procedureId,
        reference: ref,
        title,
        description,
        contactName,
        contactEmail,
        dueDate: String(
          body.dueDate ||
            new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        ),
      });
      const now = new Date().toISOString();
      const threadId = randomInternalId();
      const threadInsert = db.insert(s.conversationThreads).values({
        id: threadId,
        tenantId: who.tenantId,
        publicId: crypto.randomUUID(),
        engagementId,
        requestId,
        subject: title,
        category: "EVIDENCE",
        priority: "NORMAL",
        status: "WAITING_CLIENT",
        assignedTo: who.email,
        createdBy: who.email,
        lastMessageAt: now,
      });
      const participantInsert = db.insert(s.conversationParticipants).values([
        {
          id: randomInternalId(),
          tenantId: who.tenantId,
          publicId: crypto.randomUUID(),
          threadId,
          email: who.email,
          name: who.name,
          participantType: "PRACTICE",
          lastReadAt: now,
        },
        {
          id: randomInternalId(),
          tenantId: who.tenantId,
          publicId: crypto.randomUUID(),
          threadId,
          email: contactEmail.toLowerCase(),
          name: contactName,
          participantType: "CLIENT",
        },
      ]);
      const messageInsert = db.insert(s.conversationMessages).values({
        id: randomInternalId(),
        tenantId: who.tenantId,
        publicId: crypto.randomUUID(),
        threadId,
        authorEmail: who.email,
        authorName: who.name,
        authorType: "PRACTICE",
        body: description,
        createdAt: now,
      });
      const { statement: requestAudit } = await prepareAuditInsert(
        who.tenantId,
        engagementId,
        who.email,
        "REQUEST_SENT",
        "evidence_request",
        requestPublicId,
        { reference: ref, conversationThreadId: threadId },
      );
      await db.batch([
        requestInsert,
        threadInsert,
        participantInsert,
        messageInsert,
        requestAudit,
      ]);
    } else if (action === "updateRequest") {
      const id = Number(body.requestId);
      const row = (
        await db
          .select()
          .from(s.evidenceRequests)
          .where(and(eq(s.evidenceRequests.id, id), eq(s.evidenceRequests.tenantId, who.tenantId)))
          .limit(1)
      )[0];
      if (!row)
        return Response.json(
          { error: "Evidence request not found" },
          { status: 404 },
        );
      const status = String(body.status || row.status);
      const requestUpdate = db
        .update(s.evidenceRequests)
        .set({
          title: String(body.title || row.title),
          description: String(body.description || row.description),
          dueDate: String(body.dueDate || row.dueDate),
          status,
          receivedAt:
            status === "RECEIVED"
              ? row.receivedAt || new Date().toISOString()
              : null,
        })
        .where(and(eq(s.evidenceRequests.id, id), eq(s.evidenceRequests.tenantId, who.tenantId)));
      const { statement: requestAudit } = await prepareAuditInsert(
        who.tenantId,
        row.engagementId,
        who.email,
        "REQUEST_UPDATED",
        "evidence_request",
        String(id),
        { status },
      );
      await db.batch([requestUpdate, requestAudit]);
    } else if (action === "createReviewNote") {
      const engagementId = Number(body.engagementId);
      if (!engagementId || !body.title || !body.body)
        return Response.json(
          { error: "Engagement, title and review point are required" },
          { status: 400 },
        );
      await requireOpen(engagementId);
      const taskId = body.taskId ? Number(body.taskId) : null;
      if (taskId) {
        const task = (
          await db
            .select({ engagementId: s.tasks.engagementId })
            .from(s.tasks)
            .where(
              and(
                eq(s.tasks.id, taskId),
                eq(s.tasks.tenantId, who.tenantId),
              ),
            )
            .limit(1)
        )[0];
        if (!task || task.engagementId !== engagementId)
          return Response.json(
            { error: "Linked task does not belong to this engagement" },
            { status: 400 },
          );
      }
      const count =
        (
          await db
            .select()
            .from(s.reviewNotes)
            .where(and(eq(s.reviewNotes.engagementId, engagementId), eq(s.reviewNotes.tenantId, who.tenantId)))
        ).length + 1;
      const publicId = crypto.randomUUID();
      const severity = String(body.severity || "MEDIUM");
      const noteInsert = db
        .insert(s.reviewNotes)
        .values({
          tenantId: who.tenantId,
          publicId,
          engagementId,
          taskId,
          reference: `RN-${String(count).padStart(3, "0")}`,
          title: String(body.title),
          body: String(body.body),
          severity,
          raisedBy: who.name,
        });
      const { statement: noteAudit } = await prepareAuditInsert(
        who.tenantId,
        engagementId,
        who.email,
        "REVIEW_NOTE_RAISED",
        "review_note",
        publicId,
        { severity },
      );
      await db.batch([noteInsert, noteAudit]);
    } else if (action === "resolveNote") {
      const id = Number(body.noteId);
      const note = (
        await db
          .select()
          .from(s.reviewNotes)
          .where(and(eq(s.reviewNotes.id, id), eq(s.reviewNotes.tenantId, who.tenantId)))
          .limit(1)
      )[0];
      if (!note)
        return Response.json(
          { error: "Review note not found" },
          { status: 404 },
        );
      const response = String(body.response || "").trim();
      if (!response)
        return Response.json(
          { error: "A clearance response is required" },
          { status: 400 },
        );
      const noteUpdate = db
        .update(s.reviewNotes)
        .set({
          status: "CLEARED",
          response,
          clearedBy: who.name,
          clearedAt: new Date().toISOString(),
        })
        .where(and(eq(s.reviewNotes.id, id), eq(s.reviewNotes.tenantId, who.tenantId)));
      const { statement: noteAudit } = await prepareAuditInsert(
        who.tenantId,
        note.engagementId,
        who.email,
        "REVIEW_NOTE_CLEARED",
        "review_note",
        String(id),
        { response },
      );
      await db.batch([noteUpdate, noteAudit]);
    } else if (action === "reopenNote") {
      const id = Number(body.noteId);
      const note = (
        await db
          .select()
          .from(s.reviewNotes)
          .where(and(eq(s.reviewNotes.id, id), eq(s.reviewNotes.tenantId, who.tenantId)))
          .limit(1)
      )[0];
      if (!note)
        return Response.json(
          { error: "Review note not found" },
          { status: 404 },
        );
      const noteUpdate = db
        .update(s.reviewNotes)
        .set({ status: "OPEN", clearedBy: null, clearedAt: null })
        .where(and(eq(s.reviewNotes.id, id), eq(s.reviewNotes.tenantId, who.tenantId)));
      const { statement: noteAudit } = await prepareAuditInsert(
        who.tenantId,
        note.engagementId,
        who.email,
        "REVIEW_NOTE_REOPENED",
        "review_note",
        String(id),
        {},
      );
      await db.batch([noteUpdate, noteAudit]);
    }
  return true;
}
