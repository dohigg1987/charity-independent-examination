import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { actor, audit, prepareAuditInsert } from "@/lib/server-data";
import {
  canAccessClient,
  canManagePractice,
  canPrepare,
  canRespondForClient,
  requirePermission,
} from "@/lib/authz";
import {
  enforceRateLimit,
  enforceSameOrigin,
  requireContentType,
  safeDownloadName,
  securityHeaders,
  verifyFile,
} from "@/lib/security";
import { errorResponse, json } from "@/lib/http";
import { resolveOptionalPublicId, resolvePublicId } from "@/lib/public-ids";

export const dynamic = "force-dynamic";
function bucket() {
  const value = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!value) throw new Error("Document storage is unavailable");
  return value;
}

function randomInternalId(): number {
  const words = crypto.getRandomValues(new Uint32Array(2));
  return (words[0] & 0x1fffff) * 0x100000000 + words[1];
}

async function deleteObjectAfterFailedWrite(key: string) {
  try {
    await bucket().delete(key);
  } catch {
    // Preserve the database error. R2 lifecycle cleanup is the final safety net.
  }
}

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    requireContentType(request, "multipart");
    const who = await actor();
    await enforceRateLimit(who.tenantId, `upload:${who.email}`, 20, 10 * 60_000);
    const form = await request.formData();
    const file = form.get("file");
    const clientId = await resolveOptionalPublicId(who.tenantId, "client", form.get("clientId"), "clientId");
    const permanentCategory = String(form.get("permanentCategory") || "");
    const requestId = await resolveOptionalPublicId(who.tenantId, "request", form.get("requestId"), "requestId");
    const engagementId = await resolveOptionalPublicId(who.tenantId, "engagement", form.get("engagementId"), "engagementId");
    let taskId = await resolveOptionalPublicId(who.tenantId, "task", form.get("taskId"), "taskId");
    let procedureId = await resolveOptionalPublicId(who.tenantId, "procedure", form.get("procedureId"), "procedureId");
    const concernId = await resolveOptionalPublicId(who.tenantId, "concern", form.get("concernId"), "concernId");
    let conversationThreadId = await resolveOptionalPublicId(who.tenantId, "thread", form.get("conversationThreadId"), "conversationThreadId");
    const responseNote = String(form.get("message") || "").trim();
    const fileSection = String(form.get("fileSection") || "WORKPAPER");
    if (!(file instanceof File))
      return Response.json({ error: "A file is required" }, { status: 400 });
    if (file.size > 25 * 1024 * 1024)
      return Response.json(
        { error: "File exceeds the 25 MB limit" },
        { status: 400 },
      );
    if (responseNote.length > 10_000)
      return Response.json(
        { error: "Message cannot exceed 10,000 characters" },
        { status: 400 },
      );
    const bytes = await file.arrayBuffer();
    const verified = verifyFile(file, bytes);
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (clientId && permanentCategory) {
      requirePermission(
        canManagePractice(who),
        "Practice administrator permission is required",
      );
      const client = (
        await getDb()
          .select()
          .from(s.clients)
          .where(and(eq(s.clients.id, clientId), eq(s.clients.tenantId, who.tenantId)))
          .limit(1)
      )[0];
      if (!client)
        return Response.json({ error: "Client not found" }, { status: 404 });
      const key = `tenants/${who.tenantId}/clients/${client.publicId}/permanent/${crypto.randomUUID()}-${safeDownloadName(file.name)}`;
      await bucket().put(key, bytes, {
        httpMetadata: { contentType: verified.mimeType },
        customMetadata: {
          tenantId: who.tenantId,
          clientId: client.publicId,
          category: permanentCategory,
          uploadedBy: who.email,
          sha256: digest,
          validation: "signature-verified",
        },
      });
      const db = getDb();
      const documentId = randomInternalId();
      const documentPublicId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      try {
        const permanentInsert = db.insert(s.permanentDocuments).values({
          id: documentId,
          publicId: documentPublicId,
          tenantId: who.tenantId,
          clientId,
          category: permanentCategory,
          fileName: file.name,
          mimeType: verified.mimeType,
          byteSize: file.size,
          storageKey: key,
          sha256: digest,
          uploadedBy: who.email,
          createdAt,
        });
        const { statement: permanentAudit } = await prepareAuditInsert(
          who.tenantId,
          null,
          who.email,
          "PERMANENT_FILE_UPLOADED",
          "permanent_document",
          documentPublicId,
          {
            clientId,
            category: permanentCategory,
            fileName: file.name,
            sha256: digest,
          },
        );
        await db.batch([permanentInsert, permanentAudit]);
      } catch (error) {
        await deleteObjectAfterFailedWrite(key);
        throw error;
      }
      return json(
        {
          document: {
            id: documentPublicId,
            clientId: client.publicId,
            category: permanentCategory,
            fileName: file.name,
            mimeType: verified.mimeType,
            byteSize: file.size,
            sha256: digest,
            uploadedBy: who.email,
            status: "CURRENT",
            createdAt,
          },
        },
        { status: 201 },
      );
    }
    const annualSection =
      fileSection === "TRIAL_BALANCE" ||
      fileSection === "DRAFT_ACCOUNTS" ||
      fileSection === "ANNUAL_SUPPORT";
    if (
      !engagementId ||
      (!requestId &&
        !taskId &&
        !procedureId &&
        !concernId &&
        !conversationThreadId &&
        !annualSection)
    )
      return Response.json(
        {
          error:
            "An annual file, request, conversation, direction or procedure is required",
        },
        { status: 400 },
      );
    const engagement = (
      await getDb()
        .select()
        .from(s.engagements)
        .where(and(eq(s.engagements.id, engagementId), eq(s.engagements.tenantId, who.tenantId)))
        .limit(1)
    )[0];
    if (!engagement)
      return Response.json(
        { error: "Annual engagement file not found" },
        { status: 404 },
      );
    if (who.kind === "CLIENT")
      requirePermission(
        Boolean(requestId || conversationThreadId) &&
          canRespondForClient(who, engagement.clientId),
        "Client uploads must support an authorised request or conversation",
      );
    else
      requirePermission(
        canPrepare(who),
        "Engagement team permission is required",
      );
    if (engagement.lockedAt)
      return Response.json(
        {
          error:
            "This annual file is locked. Reopen it before uploading further evidence.",
        },
        { status: 409 },
      );
    if (requestId) {
      const evidence = (
        await getDb()
          .select()
          .from(s.evidenceRequests)
          .where(and(eq(s.evidenceRequests.id, requestId), eq(s.evidenceRequests.tenantId, who.tenantId)))
          .limit(1)
      )[0];
      if (!evidence || evidence.engagementId !== engagementId)
        return Response.json(
          { error: "Evidence request does not belong to this engagement" },
          { status: 400 },
        );
      if (
        who.kind === "CLIENT" &&
        who.clientRoles[engagement.clientId] !== "PORTAL_ADMIN"
      )
        requirePermission(
          evidence.contactEmail.toLowerCase() === who.email.toLowerCase(),
          "This evidence request is not assigned to the signed-in account",
        );
      taskId = taskId ?? evidence.taskId;
      procedureId = procedureId ?? evidence.procedureId;
      if (!conversationThreadId)
        conversationThreadId =
          (
            await getDb()
              .select({ id: s.conversationThreads.id })
              .from(s.conversationThreads)
              .where(and(eq(s.conversationThreads.requestId, requestId), eq(s.conversationThreads.tenantId, who.tenantId)))
              .limit(1)
          )[0]?.id ?? null;
    }
    if (conversationThreadId) {
      const thread = (
        await getDb()
          .select()
          .from(s.conversationThreads)
          .where(and(eq(s.conversationThreads.id, conversationThreadId), eq(s.conversationThreads.tenantId, who.tenantId)))
          .limit(1)
      )[0];
      if (!thread || thread.engagementId !== engagementId)
        return Response.json(
          { error: "Conversation does not belong to this engagement" },
          { status: 400 },
        );
      if (
        who.kind === "CLIENT" &&
        who.clientRoles[engagement.clientId] !== "PORTAL_ADMIN"
      ) {
        const participant = (
          await getDb()
            .select({ id: s.conversationParticipants.id })
            .from(s.conversationParticipants)
            .where(
              and(
                eq(s.conversationParticipants.tenantId, who.tenantId),
                eq(s.conversationParticipants.threadId, thread.id),
                eq(
                  s.conversationParticipants.email,
                  who.email.toLowerCase(),
                ),
              ),
            )
            .limit(1)
        )[0];
        requirePermission(
          Boolean(participant),
          "This conversation is not assigned to the signed-in account",
        );
      }
      if (thread.status === "RESOLVED")
        return Response.json(
          { error: "Reopen the conversation before adding an attachment" },
          { status: 409 },
        );
    }
    if (procedureId) {
      const procedure = (
        await getDb()
          .select()
          .from(s.procedures)
          .where(and(eq(s.procedures.id, procedureId), eq(s.procedures.tenantId, who.tenantId)))
          .limit(1)
      )[0];
      if (!procedure)
        return Response.json({ error: "Procedure not found" }, { status: 400 });
      taskId = taskId ?? procedure.taskId;
      if (taskId !== procedure.taskId)
        return Response.json(
          { error: "Procedure does not belong to this direction" },
          { status: 400 },
        );
    }
    if (concernId) {
      const concern = (
        await getDb()
          .select()
          .from(s.concerns)
          .where(and(eq(s.concerns.id, concernId), eq(s.concerns.tenantId, who.tenantId)))
          .limit(1)
      )[0];
      if (!concern || concern.engagementId !== engagementId)
        return Response.json(
          { error: "Concern does not belong to this engagement" },
          { status: 400 },
        );
    }
    if (taskId) {
      const task = (
        await getDb()
          .select()
          .from(s.tasks)
          .where(and(eq(s.tasks.id, taskId), eq(s.tasks.tenantId, who.tenantId)))
          .limit(1)
      )[0];
      if (!task || task.engagementId !== engagementId)
        return Response.json(
          { error: "Workpaper does not belong to this engagement" },
          { status: 400 },
        );
    }
    const key = `tenants/${who.tenantId}/engagements/${engagement.publicId}/${fileSection.toLowerCase()}/${crypto.randomUUID()}-${safeDownloadName(file.name)}`;
    await bucket().put(key, bytes, {
      httpMetadata: { contentType: verified.mimeType },
      customMetadata: {
        tenantId: who.tenantId,
        engagementId: engagement.publicId,
        fileSection,
        uploadedBy: who.email,
        sha256: digest,
        validation: "signature-verified",
      },
    });
    const db = getDb();
    const documentId = randomInternalId();
    const documentPublicId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const createsRequestReply = Boolean(requestId && conversationThreadId);
    const conversationMessageId = createsRequestReply
      ? randomInternalId()
      : null;
    const conversationMessagePublicId = createsRequestReply
      ? crypto.randomUUID()
      : null;
    try {
      const statements = [];
      const documentInsert = db.insert(s.documents).values({
        id: documentId,
        publicId: documentPublicId,
        tenantId: who.tenantId,
        engagementId,
        requestId,
        taskId,
        procedureId,
        concernId,
        conversationThreadId,
        conversationMessageId,
        fileSection,
        fileName: file.name,
        mimeType: verified.mimeType,
        byteSize: file.size,
        storageKey: key,
        sha256: digest,
        uploadedBy: who.email,
        malwareStatus: "SIGNATURE_VERIFIED",
        createdAt,
      });
      if (
        requestId &&
        conversationThreadId &&
        conversationMessageId &&
        conversationMessagePublicId
      ) {
        statements.push(db.insert(s.conversationMessages).values({
          id: conversationMessageId,
          publicId: conversationMessagePublicId,
          tenantId: who.tenantId,
          threadId: conversationThreadId,
          authorEmail: who.email,
          authorName: who.name,
          authorType: who.kind === "CLIENT" ? "CLIENT" : "PRACTICE",
          body: responseNote || `Uploaded evidence: ${file.name}`,
          createdAt,
        }));
        statements.push(documentInsert);
        statements.push(db
          .update(s.conversationThreads)
          .set({
            status:
              who.kind === "CLIENT" ? "WAITING_PRACTICE" : "WAITING_CLIENT",
            lastMessageAt: createdAt,
            updatedAt: createdAt,
          })
          .where(
            and(
              eq(s.conversationThreads.id, conversationThreadId),
              eq(s.conversationThreads.tenantId, who.tenantId),
            ),
          ));
      } else statements.push(documentInsert);
      if (requestId)
        statements.push(db
          .update(s.evidenceRequests)
          .set({ status: "RECEIVED", receivedAt: createdAt })
          .where(
            and(
              eq(s.evidenceRequests.id, requestId),
              eq(s.evidenceRequests.tenantId, who.tenantId),
            ),
          ));
      const { statement: documentAudit } = await prepareAuditInsert(
        who.tenantId,
        engagementId,
        who.email,
        "DOCUMENT_UPLOADED",
        "document",
        documentPublicId,
        {
          fileName: file.name,
          fileSection,
          sha256: digest,
          requestId,
          taskId,
          procedureId,
          concernId,
          conversationThreadId,
          conversationMessageId: conversationMessagePublicId,
          responseIncluded: Boolean(responseNote),
          staged: Boolean(conversationThreadId && !conversationMessageId),
        },
      );
      statements.push(documentAudit);
      await db.batch(
        statements as [
          typeof statements[number],
          ...typeof statements[number][],
        ],
      );
    } catch (error) {
      await deleteObjectAfterFailedWrite(key);
      throw error;
    }
    return json(
      {
        document: {
          id: documentPublicId,
          engagementId: engagement.publicId,
          fileSection,
          fileName: file.name,
          mimeType: verified.mimeType,
          byteSize: file.size,
          sha256: digest,
          uploadedBy: who.email,
          malwareStatus: "SIGNATURE_VERIFIED",
          createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, "Upload failed");
  }
}

export async function GET(request: Request) {
  try {
    const who = await actor();
    const params = new URL(request.url).searchParams;
    const permanentValue = params.get("permanentId");
    const documentValue = params.get("id");
    if (!permanentValue && !documentValue) return new Response("Not found", { status: 404 });
    const permanentId = permanentValue
      ? await resolvePublicId(who.tenantId, "permanentDocument", permanentValue, "permanentId")
      : null;
    const documentId = documentValue
      ? await resolvePublicId(who.tenantId, "document", documentValue, "id")
      : null;
    const doc = permanentId
      ? (
          await getDb()
            .select()
            .from(s.permanentDocuments)
            .where(and(eq(s.permanentDocuments.id, permanentId), eq(s.permanentDocuments.tenantId, who.tenantId)))
            .limit(1)
        )[0]
      : (
          await getDb()
            .select()
            .from(s.documents)
            .where(and(eq(s.documents.id, documentId!), eq(s.documents.tenantId, who.tenantId)))
            .limit(1)
        )[0];
    if (!doc) return new Response("Not found", { status: 404 });
    if ("clientId" in doc)
      requirePermission(
        canAccessClient(who, doc.clientId, doc.tenantId),
        "This permanent-file document is not available to the signed-in account",
      );
    else {
      const engagement = (
        await getDb()
          .select()
          .from(s.engagements)
          .where(and(eq(s.engagements.id, doc.engagementId), eq(s.engagements.tenantId, who.tenantId)))
          .limit(1)
      )[0];
      requirePermission(
        Boolean(engagement) &&
          canAccessClient(who, engagement.clientId, engagement.tenantId),
        "This document is not available to the signed-in account",
      );
      if (who.kind === "CLIENT") {
        requirePermission(
          doc.requestId !== null || doc.conversationThreadId !== null,
          "Client accounts cannot access internal workpapers",
        );
        requirePermission(
          doc.conversationThreadId === null ||
            doc.requestId !== null ||
            doc.conversationMessageId !== null,
          "This attachment has not been sent",
        );
        if (who.clientRoles[engagement.clientId] !== "PORTAL_ADMIN") {
          const assignedRequest = doc.requestId
            ? (
                await getDb()
                  .select({ contactEmail: s.evidenceRequests.contactEmail })
                  .from(s.evidenceRequests)
                  .where(and(eq(s.evidenceRequests.id, doc.requestId), eq(s.evidenceRequests.tenantId, who.tenantId)))
                  .limit(1)
              )[0]
            : null;
          const assignedConversation = doc.conversationThreadId
            ? (
                await getDb()
                  .select({ id: s.conversationParticipants.id })
                  .from(s.conversationParticipants)
                  .where(
                    and(
                      eq(
                        s.conversationParticipants.tenantId,
                        who.tenantId,
                      ),
                      eq(
                        s.conversationParticipants.threadId,
                        doc.conversationThreadId,
                      ),
                      eq(
                        s.conversationParticipants.email,
                        who.email.toLowerCase(),
                      ),
                    ),
                  )
                  .limit(1)
              )[0]
            : null;
          requirePermission(
            assignedRequest?.contactEmail.toLowerCase() ===
              who.email.toLowerCase() || Boolean(assignedConversation),
            "This document is not assigned to the signed-in account",
          );
        }
      }
    }
    const object = await bucket().get(doc.storageKey);
    if (!object) return new Response("Not found", { status: 404 });
    await audit(
      "engagementId" in doc ? doc.engagementId : null,
      who.email,
      "DOCUMENT_DOWNLOADED",
      permanentId ? "permanent_document" : "document",
      doc.publicId,
      {},
    );
    return new Response(object.body, {
      headers: {
        ...securityHeaders(),
        "Content-Type": doc.mimeType,
        "Content-Disposition": `attachment; filename="${safeDownloadName(doc.fileName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, "Download failed");
  }
}
