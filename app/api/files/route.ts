import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { actor, audit, seedIfEmpty } from "@/lib/server-data";
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

export const dynamic = "force-dynamic";
function bucket() {
  const value = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!value) throw new Error("Document storage is unavailable");
  return value;
}

export async function POST(request: Request) {
  try {
    await seedIfEmpty();
    enforceSameOrigin(request);
    requireContentType(request, "multipart");
    const who = await actor();
    await enforceRateLimit(`upload:${who.email}`, 20, 10 * 60_000);
    const form = await request.formData();
    const file = form.get("file");
    const clientId = form.get("clientId") ? Number(form.get("clientId")) : null;
    const permanentCategory = String(form.get("permanentCategory") || "");
    const requestId = form.get("requestId")
      ? Number(form.get("requestId"))
      : null;
    const engagementId = Number(form.get("engagementId"));
    let taskId = form.get("taskId") ? Number(form.get("taskId")) : null;
    let procedureId = form.get("procedureId")
      ? Number(form.get("procedureId"))
      : null;
    const concernId = form.get("concernId")
      ? Number(form.get("concernId"))
      : null;
    let conversationThreadId = form.get("conversationThreadId")
      ? Number(form.get("conversationThreadId"))
      : null;
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
          .where(eq(s.clients.id, clientId))
          .limit(1)
      )[0];
      if (!client)
        return Response.json({ error: "Client not found" }, { status: 404 });
      const key = `clients/${clientId}/permanent/${crypto.randomUUID()}-${safeDownloadName(file.name)}`;
      await bucket().put(key, bytes, {
        httpMetadata: { contentType: verified.mimeType },
        customMetadata: {
          clientId: String(clientId),
          category: permanentCategory,
          uploadedBy: who.email,
          sha256: digest,
          validation: "signature-verified",
        },
      });
      const [doc] = await getDb()
        .insert(s.permanentDocuments)
        .values({
          clientId,
          category: permanentCategory,
          fileName: file.name,
          mimeType: verified.mimeType,
          byteSize: file.size,
          storageKey: key,
          sha256: digest,
          uploadedBy: who.email,
        })
        .returning();
      await audit(
        null,
        who.email,
        "PERMANENT_FILE_UPLOADED",
        "permanent_document",
        String(doc.id),
        {
          clientId,
          category: permanentCategory,
          fileName: file.name,
          sha256: digest,
        },
      );
      return json(
        { document: { ...doc, storageKey: undefined } },
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
        .where(eq(s.engagements.id, engagementId))
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
          .where(eq(s.evidenceRequests.id, requestId))
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
              .where(eq(s.conversationThreads.requestId, requestId))
              .limit(1)
          )[0]?.id ?? null;
    }
    if (conversationThreadId) {
      const thread = (
        await getDb()
          .select()
          .from(s.conversationThreads)
          .where(eq(s.conversationThreads.id, conversationThreadId))
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
          .where(eq(s.procedures.id, procedureId))
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
          .where(eq(s.concerns.id, concernId))
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
          .where(eq(s.tasks.id, taskId))
          .limit(1)
      )[0];
      if (!task || task.engagementId !== engagementId)
        return Response.json(
          { error: "Workpaper does not belong to this engagement" },
          { status: 400 },
        );
    }
    const key = `engagements/${engagementId}/${fileSection.toLowerCase()}/${crypto.randomUUID()}-${safeDownloadName(file.name)}`;
    await bucket().put(key, bytes, {
      httpMetadata: { contentType: verified.mimeType },
      customMetadata: {
        engagementId: String(engagementId),
        fileSection,
        requestId: String(requestId),
        procedureId: String(procedureId),
        concernId: String(concernId),
        conversationThreadId: String(conversationThreadId),
        uploadedBy: who.email,
        sha256: digest,
        validation: "signature-verified",
      },
    });
    const [doc] = await getDb()
      .insert(s.documents)
      .values({
        engagementId,
        requestId,
        taskId,
        procedureId,
        concernId,
        conversationThreadId,
        fileSection,
        fileName: file.name,
        mimeType: verified.mimeType,
        byteSize: file.size,
        storageKey: key,
        sha256: digest,
        uploadedBy: who.email,
        malwareStatus: "SIGNATURE_VERIFIED",
      })
      .returning();
    if (requestId && conversationThreadId) {
      const now = new Date().toISOString();
      const [message] = await getDb()
        .insert(s.conversationMessages)
        .values({
          threadId: conversationThreadId,
          authorEmail: who.email,
          authorName: who.name,
          authorType: who.kind === "CLIENT" ? "CLIENT" : "PRACTICE",
          body: responseNote || `Uploaded evidence: ${file.name}`,
          createdAt: now,
        })
        .returning();
      await getDb()
        .update(s.documents)
        .set({ conversationMessageId: message.id })
        .where(eq(s.documents.id, doc.id));
      await getDb()
        .update(s.conversationThreads)
        .set({
          status:
            who.kind === "CLIENT" ? "WAITING_PRACTICE" : "WAITING_CLIENT",
          lastMessageAt: now,
          updatedAt: now,
        })
        .where(eq(s.conversationThreads.id, conversationThreadId));
    }
    if (requestId)
      await getDb()
        .update(s.evidenceRequests)
        .set({ status: "RECEIVED", receivedAt: new Date().toISOString() })
        .where(eq(s.evidenceRequests.id, requestId));
    await audit(
      engagementId,
      who.email,
      "DOCUMENT_UPLOADED",
      "document",
      String(doc.id),
      {
        fileName: file.name,
        fileSection,
        sha256: digest,
        requestId,
        taskId,
        procedureId,
        concernId,
        conversationThreadId,
        responseIncluded: Boolean(responseNote),
      },
    );
    return json(
      { document: { ...doc, storageKey: undefined } },
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
    const permanentId = Number(params.get("permanentId"));
    const id = Number(params.get("id"));
    const doc = permanentId
      ? (
          await getDb()
            .select()
            .from(s.permanentDocuments)
            .where(eq(s.permanentDocuments.id, permanentId))
            .limit(1)
        )[0]
      : (
          await getDb()
            .select()
            .from(s.documents)
            .where(eq(s.documents.id, id))
            .limit(1)
        )[0];
    if (!doc) return new Response("Not found", { status: 404 });
    if ("clientId" in doc)
      requirePermission(
        canAccessClient(who, doc.clientId),
        "This permanent-file document is not available to the signed-in account",
      );
    else {
      const engagement = (
        await getDb()
          .select()
          .from(s.engagements)
          .where(eq(s.engagements.id, doc.engagementId))
          .limit(1)
      )[0];
      requirePermission(
        Boolean(engagement) && canAccessClient(who, engagement.clientId),
        "This document is not available to the signed-in account",
      );
      if (who.kind === "CLIENT") {
        requirePermission(
          doc.requestId !== null || doc.conversationThreadId !== null,
          "Client accounts cannot access internal workpapers",
        );
        if (who.clientRoles[engagement.clientId] !== "PORTAL_ADMIN") {
          const assignedRequest = doc.requestId
            ? (
                await getDb()
                  .select({ contactEmail: s.evidenceRequests.contactEmail })
                  .from(s.evidenceRequests)
                  .where(eq(s.evidenceRequests.id, doc.requestId))
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
      String(permanentId || id),
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
