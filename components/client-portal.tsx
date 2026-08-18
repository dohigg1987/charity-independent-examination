"use client";
/* eslint-disable react-hooks/set-state-in-effect -- initial authenticated portal state is loaded after mount */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  Tab,
  TabList,
  Textarea,
} from "@fluentui/react-components";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Loader2,
  LockKeyhole,
  LogOut,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { Logo } from "./logo";
import { ClientMessages } from "./client-messages";
import type { AppState, EvidenceRequest, PublicId } from "@/lib/types";
import {
  choosePortalEngagement,
  isRequestOverdue,
  portalCompletion,
} from "@/lib/client-portal";

type ResponseDraft = { file: File | null; note: string };
type PortalReceipt = {
  requestReference: string;
  fileName?: string;
  sha256?: string;
};

export function ClientPortal({ previewMode = false }: { previewMode?: boolean }) {
  const [state, setState] = useState<AppState | null>(null);
  const [engagementId, setEngagementId] = useState<PublicId | null>(null);
  const [expanded, setExpanded] = useState<PublicId | null>(null);
  const [drafts, setDrafts] = useState<Record<PublicId, ResponseDraft>>({});
  const [portalView, setPortalView] = useState<"overview" | "messages">("overview");
  const [portalThreadId, setPortalThreadId] = useState<PublicId | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<PublicId | null>(null);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<PortalReceipt | null>(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const load = async (preferredEngagementId?: PublicId | null) => {
    const r = await fetch("/api/state", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "The client portal could not be opened");
    setState(j);
    setError("");
    const requestedValue = new URLSearchParams(window.location.search).get(
      "engagement",
    );
    const requested = requestedValue || null;
    const chosen = choosePortalEngagement(
      j.engagements.map((item: { id: PublicId }) => item.id),
      preferredEngagementId ?? engagementId,
      requested,
    );
    setEngagementId(chosen);
    setExpanded((current) => {
      const currentIsOutstanding = j.requests.some(
        (item: { id: PublicId; engagementId: PublicId; status: string }) =>
          item.id === current &&
          item.engagementId === chosen &&
          item.status !== "RECEIVED",
      );
      if (currentIsOutstanding) return current;
      return (
        j.requests.find(
          (item: { engagementId: PublicId; status: string }) =>
            item.engagementId === chosen && item.status !== "RECEIVED",
        )?.id ?? null
      );
    });
    setLoading(false);
  };
  useEffect(() => {
    load().catch((reason) => {
      setError(
        reason instanceof Error
          ? reason.message
          : "The client portal could not be opened",
      );
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- initial authenticated load only
  const engagement = state?.engagements.find((e) => e.id === engagementId);
  const client = state?.clients.find((c) => c.id === engagement?.clientId);
  const requests = useMemo(
    () => state?.requests.filter((r) => r.engagementId === engagementId) ?? [],
    [state, engagementId],
  );
  const outstanding = requests.filter((r) => r.status !== "RECEIVED");
  const received = requests.filter((r) => r.status === "RECEIVED");
  const upload = async (request: EvidenceRequest) => {
    const draft = drafts[request.id] ?? { file: null, note: "" };
    if ((!draft.file && !draft.note.trim()) || !engagement) return;
    setBusyRequestId(request.id);
    setError("");
    try {
      let uploaded: { fileName: string; sha256: string } | null = null;
      if (draft.file) {
        const form = new FormData();
        form.set("file", draft.file);
        form.set("requestId", String(request.id));
        form.set("engagementId", String(engagement.id));
        if (draft.note.trim()) form.set("message", draft.note.trim());
        const result = await fetch("/api/files", {
          method: "POST",
          body: form,
        });
        const json = await result.json();
        if (!result.ok) throw new Error(json.error);
        uploaded = json.document;
      } else if (draft.note.trim()) {
        const reply = await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "addClientReply",
            engagementId: engagement.id,
            requestId: request.id,
            body: draft.note.trim(),
          }),
        });
        const replyJson = await reply.json();
        if (!reply.ok) throw new Error(replyJson.error);
      }
      setDrafts((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      setReceipt({
        requestReference: request.reference,
        fileName: uploaded?.fileName,
        sha256: uploaded?.sha256,
      });
      setSuccess(`Response received for ${request.reference}`);
      await load(engagement.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Response failed");
    } finally {
      setBusyRequestId(null);
    }
  };
  if (!state || !engagement || !client)
    return (
      <div className="loading-screen">
        <Logo />
        {loading ? <Spinner size="medium" label="Opening secure portal" /> : null}
        <p>
          {error ||
            (state
              ? "No annual engagement is currently available to this account."
              : "Opening the secure client portal…")}
        </p>
        {!loading && (
          <Button
            appearance="secondary"
            icon={<RefreshCw />}
            className="secondary"
            onClick={() => {
              setLoading(true);
              load().catch((reason) => {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "The client portal could not be opened",
                );
                setLoading(false);
              });
            }}
          >
            Retry
          </Button>
        )}
      </div>
    );
  const progress = state.portalProgress?.find(
    (item) => item.engagementId === engagement.id,
  );
  const completion = portalCompletion(
    progress?.totalTasks ?? 0,
    progress?.reviewedTasks ?? 0,
  );
  const unreadMessages = state.conversations.filter((thread) => {
    if (thread.engagementId !== engagement.id) return false;
    const participant = state.conversationParticipants.find(
      (item) =>
        item.threadId === thread.id &&
        item.email.toLowerCase() === state.actor.email.toLowerCase(),
    );
    const incoming = state.conversationMessages
      .filter(
        (item) =>
          item.threadId === thread.id &&
          item.authorEmail.toLowerCase() !== state.actor.email.toLowerCase(),
      )
      .at(-1);
    return Boolean(
      incoming &&
        (!participant?.lastReadAt || incoming.createdAt > participant.lastReadAt),
    );
  }).length;
  const clientRole =
    state.actor.clientRoles?.[client.id] ?? state.actor.role ?? "READ_ONLY";
  const canRespond =
    !previewMode && clientRole !== "READ_ONLY" && !engagement.lockedAt;
  const portalUserName = previewMode
    ? client.contactName || "Client contact"
    : state.actor.name;
  const engagementThreadIds = new Set(
    state.conversations
      .filter((thread) => thread.engagementId === engagement.id)
      .map((thread) => thread.id),
  );
  const examinerName =
    state.conversationParticipants.find(
      (participant) =>
        engagementThreadIds.has(participant.threadId) &&
        participant.participantType === "PRACTICE",
    )?.name ?? "Examination team";
  const updateDraft = (requestId: PublicId, change: Partial<ResponseDraft>) =>
    setDrafts((current) => ({
      ...current,
      [requestId]: {
        file: current[requestId]?.file ?? null,
        note: current[requestId]?.note ?? "",
        ...change,
      },
    }));
  const selectEngagement = (id: PublicId) => {
    setEngagementId(id);
    setPortalView("overview");
    setPortalThreadId(null);
    setDrafts({});
    setReceipt(null);
    setSuccess("");
    setError("");
    setExpanded(
      state.requests.find(
        (request) =>
          request.engagementId === id && request.status !== "RECEIVED",
      )?.id ?? null,
    );
    const url = new URL(window.location.href);
    url.searchParams.set("engagement", String(id));
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  };
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <Logo />
        <div className="portal-header-tools">
          {state.engagements.length > 1 && (
            <label className="portal-engagement-switcher">
              <span>Annual file</span>
              <Select
                aria-label="Select annual engagement"
                value={engagement.id}
                onChange={(event) => selectEngagement(event.target.value)}
              >
                {state.engagements.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.clientName} · {fmt(item.periodEnd)}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <TabList className="portal-nav" aria-label="Client portal" selectedValue={portalView} onTabSelect={(_, data) => setPortalView(data.value as "overview" | "messages")}>
            <Tab value="overview">Overview</Tab>
            <Tab value="messages">Messages{unreadMessages > 0 && <b>{unreadMessages}</b>}</Tab>
          </TabList>
          <span className="secure">
            <LockKeyhole />
            Secure client portal
          </span>
          <span className="portal-identity">
            <span className="avatar client-avatar">
              {initials(portalUserName)}
            </span>
            <span>
              <strong>{portalUserName}</strong>
              <small>
                {previewMode ? "Practitioner preview" : label(clientRole)}
              </small>
            </span>
          </span>
          {previewMode ? (
            <Link
              className="portal-sign-out"
              href="/"
              aria-label="Return to practitioner workspace"
            >
              <ArrowLeft /> Workspace
            </Link>
          ) : (
            <a
              className="portal-sign-out"
              href="/signout-with-chatgpt?return_to=%2Fclient"
              aria-label="Sign out of the client portal"
            >
              <LogOut /> Sign out
            </a>
          )}
        </div>
      </header>
      <main className="portal-main">
        {error && (
          <MessageBar intent="error" className="error-banner">
            <MessageBarBody>{error}</MessageBarBody>
            <Button appearance="transparent" size="small" icon={<X />} onClick={() => setError("")} aria-label="Dismiss error" />
          </MessageBar>
        )}
        {success && (
          <div className="portal-success" role="status">
            <CheckCircle2 />
            <span>
              <strong>{success}</strong>
              {receipt?.fileName && (
                <small>
                  {receipt.fileName}
                  {receipt.sha256
                    ? ` · Receipt ${receipt.sha256.slice(0, 12).toUpperCase()}`
                    : ""}
                </small>
              )}
            </span>
            <button
              onClick={() => {
                setSuccess("");
                setReceipt(null);
              }}
              aria-label="Dismiss confirmation"
            >
              <X />
            </button>
          </div>
        )}
        {previewMode && (
          <div className="portal-preview-note" role="note">
            <LockKeyhole />
            <p>
              <strong>Read-only practitioner preview</strong>
              This is the customer experience for {client.name}. Messages,
              responses and uploads are disabled in preview mode.
            </p>
            <Link href="/">Return to workspace</Link>
          </div>
        )}
        {!canRespond && !previewMode && (
          <div className="portal-permission-note" role="note">
            <LockKeyhole />
            <p>
              <strong>
                {engagement.lockedAt ? "Annual file locked" : "Read-only access"}
              </strong>
              {engagement.lockedAt
                ? "This examination file has been completed and no further responses can be submitted. Existing records remain available."
                : "This account can review requests, messages and receipts. A portal administrator can grant contributor access when responses are required."}
            </p>
          </div>
        )}
        {portalView === "overview" ? <><div className="portal-welcome">
          <div>
            <p className="eyebrow">{client.name.toUpperCase()}</p>
            <h1>Welcome, {portalUserName.split(" ")[0] || "client"}</h1>
            <p>
              {state.practiceName} is completing your independent
              examination for the year ended {fmt(engagement.periodEnd)}.
            </p>
          </div>
          <div className="portal-status">
            <span>Examination status</span>
            <strong>{label(engagement.status)}</strong>
            <i>
              <b style={{ width: `${completion}%` }} />
            </i>
            <small>{completion}% of work programme reviewed</small>
          </div>
        </div>
        <div className="portal-grid">
          <section>
            <div className="portal-section-title">
              <div>
                <h2>Information requested</h2>
                <p>
                  Upload evidence directly into the controlled engagement
                  record.
                </p>
              </div>
              <span>{outstanding.length} outstanding</span>
            </div>
            {outstanding.map((request) => {
              const draft = drafts[request.id] ?? { file: null, note: "" };
              const requestThread = state.conversations.find(
                (thread) => thread.requestId === request.id,
              );
              const overdue = isRequestOverdue(
                request.dueDate,
                request.status,
              );
              const busy = busyRequestId === request.id;
              return (
                <article
                  className={`request-card ${overdue ? "urgent" : ""}`}
                  key={request.id}
                >
                  {expanded === request.id ? (
                    <>
                      <div className="request-card-head">
                        <span className="file-icon">
                          <FileText />
                        </span>
                        <div>
                          <span className="overdue">
                            {overdue ? "OVERDUE" : "ACTION REQUIRED"}
                          </span>
                          <h3>{request.title}</h3>
                          <p>
                            {request.reference} · Requested by {examinerName}
                          </p>
                        </div>
                      </div>
                      <div className="request-body">
                        <p>{request.description}</p>
                        <div className="due">
                          <Clock3 />
                          <span>
                            <small>Due date</small>
                            <strong>{fmt(request.dueDate)}</strong>
                          </span>
                        </div>
                        {requestThread && (
                          <div className="portal-request-thread">
                            <h4>Conversation</h4>
                            {state.conversationMessages
                              .filter(
                                (message) =>
                                  message.threadId === requestThread.id,
                              )
                              .slice(-2)
                              .map((message) => (
                                <div key={message.id}>
                                  <strong>{message.authorName}</strong>
                                  <p>{message.body}</p>
                                  <small>{fmtTime(message.createdAt)}</small>
                                </div>
                              ))}
                            <button
                              type="button"
                              className="request-conversation-link"
                              onClick={() => {
                                setPortalThreadId(requestThread.id);
                                setPortalView("messages");
                              }}
                            >
                              <MessageSquare /> Open full conversation
                            </button>
                          </div>
                        )}
                        {canRespond && (
                          <>
                            <label
                              className={`drop-zone ${draft.file ? "has-files" : ""}`}
                            >
                              <input
                                type="file"
                                accept=".pdf,.docx,.xlsx,.csv,.jpg,.jpeg,.png"
                                onChange={(event) => {
                                  const selected =
                                    event.target.files?.[0] ?? null;
                                  if (
                                    selected &&
                                    selected.size > 25 * 1024 * 1024
                                  ) {
                                    setError(
                                      "The selected file exceeds the 25 MB limit",
                                    );
                                    event.target.value = "";
                                    updateDraft(request.id, { file: null });
                                    return;
                                  }
                                  setError("");
                                  updateDraft(request.id, { file: selected });
                                }}
                              />
                              <UploadCloud />
                              <strong>
                                {draft.file
                                  ? draft.file.name
                                  : "Choose a file to upload"}
                              </strong>
                              <small>
                                PDF, DOCX, XLSX, CSV, JPG or PNG · Maximum 25 MB
                              </small>
                            </label>
                            <Textarea
                              aria-label={`Response to ${request.reference}`}
                              value={draft.note}
                              maxLength={10_000}
                              onChange={(event) =>
                                updateDraft(request.id, {
                                  note: event.target.value,
                                })
                              }
                              placeholder="Add a reply for your examiner (optional)"
                              resize="vertical"
                            />
                            <div className="portal-response-meta">
                              <span>{draft.note.length.toLocaleString()}/10,000</span>
                              <span>One response creates one controlled receipt</span>
                            </div>
                            <button
                              type="button"
                              className="primary wide"
                              disabled={
                                (!draft.file && !draft.note.trim()) ||
                                busyRequestId !== null
                              }
                              onClick={() => upload(request)}
                            >
                              {busy ? <Loader2 className="spin" /> : <Send />}
                              {busy ? "Sending securely…" : "Submit response"}
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="collapsed">
                      <span className="file-icon amber">
                        <FileText />
                      </span>
                      <div>
                        <span className="due-soon">
                          {overdue
                            ? "OVERDUE"
                            : `DUE ${fmt(request.dueDate).toUpperCase()}`}
                        </span>
                        <h3>{request.title}</h3>
                        <p>{request.reference}</p>
                      </div>
                      <button
                        type="button"
                        aria-expanded="false"
                        onClick={() => setExpanded(request.id)}
                      >
                        View request
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
            {!outstanding.length && (
              <div className="portal-empty">
                <CheckCircle2 />
                <h3>You&apos;re up to date</h3>
                <p>There are no outstanding evidence requests.</p>
              </div>
            )}
            {received.map((request) => {
              const documents = state.documents.filter(
                (document) => document.requestId === request.id,
              );
              return (
                <article className="portal-completed-request" key={request.id}>
                  <header>
                    <CheckCircle2 />
                    <span>
                      <strong>{request.title}</strong>
                      <small>
                        {request.reference} · Received{" "}
                        {request.receivedAt
                          ? fmt(request.receivedAt)
                          : "securely"}
                      </small>
                    </span>
                    <b>Received</b>
                  </header>
                  {documents.length > 0 && (
                    <div className="portal-received-files">
                      {documents.map((document) => (
                        <a
                          key={document.id}
                          href={`/api/files?id=${document.id}`}
                          title={`Download ${document.fileName}`}
                        >
                          <Download />
                          <span>
                            <strong>{document.fileName}</strong>
                            <small>
                              {Math.ceil(document.byteSize / 1024)} KB · Receipt{" "}
                              {document.sha256.slice(0, 12).toUpperCase()}
                            </small>
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
          <aside>
            <div className="portal-side-card">
              <h2>Your engagement</h2>
              <dl>
                <div>
                  <dt>Reporting period</dt>
                  <dd>{fmt(engagement.periodEnd)}</dd>
                </div>
                <div>
                  <dt>Engagement lead</dt>
                  <dd>{examinerName}</dd>
                </div>
                <div>
                  <dt>Charity number</dt>
                  <dd>{engagement.charityNumber}</dd>
                </div>
                <div>
                  <dt>Accounting basis</dt>
                  <dd>{engagement.accountingBasis}</dd>
                </div>
              </dl>
            </div>
            <div className="portal-side-card contact">
              <span className="avatar large">{initials(examinerName)}</span>
              <h3>{examinerName}</h3>
              <p>Independent Examiner</p>
              <button type="button" onClick={() => setPortalView("messages")}>
                Open secure messages
                {unreadMessages > 0 && <b>{unreadMessages} unread</b>}
              </button>
            </div>
            <div className="security-note">
              <ShieldCheck />
              <p>
                <strong>Your information is protected</strong>Files use
                encrypted transport and controlled object storage. Every upload
                and download is recorded in the engagement audit trail.
              </p>
            </div>
          </aside>
        </div></> : <ClientMessages state={state} engagement={engagement} refresh={() => load(engagement.id)} notify={(message) => setSuccess(message)} initialThreadId={portalThreadId} canRespond={canRespond} />}
      </main>
      <footer className="portal-footer">
        <span>
          Powered by <strong>Clarity IE</strong>
        </span>
        <span>Secure engagement workspace</span>
      </footer>
    </div>
  );
}

function label(v: string) {
  return v
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmt(v: string) {
  return new Date(v + (/T/.test(v) ? "" : "T12:00:00Z")).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long", year: "numeric" },
  );
}
function fmtTime(v: string) {
  return new Date(v.endsWith("Z") ? v : v + "Z").toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function initials(v: string) {
  return (
    v
      .split(/\s+/)
      .map((x) => x[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "CL"
  );
}
