"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Inbox,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Reply,
  Search,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import type {
  AppState,
  ConversationMessage,
  ConversationThread,
  Engagement,
  PublicId,
} from "@/lib/types";

export function ClientMessages({
  state,
  engagement,
  refresh,
  notify,
  initialThreadId,
  canRespond,
}: {
  state: AppState;
  engagement: Engagement;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  initialThreadId?: PublicId | null;
  canRespond: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<PublicId | null>(() => {
    if (initialThreadId) return initialThreadId;
    return (
      state.conversations
        .filter((thread) => thread.engagementId === engagement.id)
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))[0]?.id ??
      null
    );
  });
  const [newOpen, setNewOpen] = useState(false);
  const threads = useMemo(
    () =>
      state.conversations
        .filter((thread) => thread.engagementId === engagement.id)
        .filter((thread) => {
          const needle = query.trim().toLowerCase();
          if (!needle) return true;
          const bodies = state.conversationMessages
            .filter((message) => message.threadId === thread.id)
            .map((message) => message.body)
            .join(" ");
          return `${thread.subject} ${bodies}`.toLowerCase().includes(needle);
        })
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
    [state, engagement.id, query],
  );
  const selected =
    selectedId === null
      ? null
      : threads.find((thread) => thread.id === selectedId) ?? null;
  return (
    <section className="client-messages-page">
      <header className="client-messages-title">
        <div>
          <p className="eyebrow">SECURE COLLABORATION</p>
          <h1>Messages</h1>
          <p>Discuss requests and engagement matters directly with the examination team.</p>
        </div>
        {canRespond ? (
          <button className="primary" onClick={() => setNewOpen(true)}><Plus /> New conversation</button>
        ) : (
          <span className="client-read-only-badge"><ShieldCheck /> Read only</span>
        )}
      </header>
      <div className={`communications-shell client-communications ${selected ? "has-selection" : ""}`}>
        <aside className="conversation-index">
          <div className="conversation-search"><Search /><input aria-label="Search messages" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search messages" /></div>
          <div className="client-inbox-heading"><span><Inbox /> Inbox</span><b>{threads.filter((thread) => unread(state, thread)).length} unread</b></div>
          <div className="conversation-list">
            {threads.map((thread) => {
              const latest = messagesFor(state, thread.id).at(-1);
              return (
                <button key={thread.id} className={`${selected?.id === thread.id ? "active" : ""} ${unread(state, thread) ? "unread" : ""}`} onClick={() => setSelectedId(thread.id)}>
                  <span className="conversation-avatar">{initials(practiceParticipant(state, thread.id)?.name || "Examiner")}</span>
                  <span className="conversation-summary">
                    <span><strong>{thread.subject}</strong><time>{relative(thread.lastMessageAt)}</time></span>
                    <small>{practiceParticipant(state, thread.id)?.name || "Examination team"}</small>
                    <p>{latest?.body || "Conversation opened"}</p>
                    <span className="conversation-tags"><i>{label(thread.category)}</i>{unread(state, thread) && <b>New</b>}</span>
                  </span>
                </button>
              );
            })}
            {!threads.length && <div className="conversation-empty"><MessageSquare /><strong>No messages yet</strong><p>{canRespond ? "Start a conversation with the examination team." : "No secure conversations are currently available to this account."}</p></div>}
          </div>
        </aside>
        {selected ? (
          <ClientThread state={state} engagement={engagement} thread={selected} refresh={refresh} notify={notify} back={() => setSelectedId(null)} canRespond={canRespond} />
        ) : (
          <div className="conversation-placeholder"><MessageSquare /><h2>Select a message</h2><p>The complete secure conversation will appear here.</p></div>
        )}
      </div>
      {newOpen && canRespond && <NewClientConversation state={state} engagement={engagement} refresh={refresh} notify={notify} close={() => setNewOpen(false)} selectThread={setSelectedId} />}
    </section>
  );
}

function ClientThread({
  state,
  engagement,
  thread,
  refresh,
  notify,
  back,
  canRespond,
}: {
  state: AppState;
  engagement: Engagement;
  thread: ConversationThread;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  back: () => void;
  canRespond: boolean;
}) {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<ConversationMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const messages = messagesFor(state, thread.id);
  const request = state.requests.find((item) => item.id === thread.requestId);
  const practice = practiceParticipant(state, thread.id);

  useEffect(() => {
    if (!unread(state, thread)) return;
    void action("markConversationRead", { threadId: thread.id })
      .then(refresh)
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "The conversation could not be marked as read",
        ),
      );
  }, [thread.id, thread.lastMessageAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [messages.length]);

  const send = async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const attachmentIds: PublicId[] = [];
      if (file) {
        const form = new FormData();
        form.set("file", file);
        form.set("engagementId", String(engagement.id));
        form.set("conversationThreadId", String(thread.id));
        form.set("fileSection", "COMMUNICATION");
        const response = await fetch("/api/files", { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Attachment upload failed");
        attachmentIds.push(result.document.id);
      }
      await action("sendConversationMessage", {
        threadId: thread.id,
        message,
        replyToMessageId: replyTo?.id ?? null,
        attachmentIds,
      });
      setMessage("");
      setFile(null);
      setReplyTo(null);
      await refresh();
      notify("Message sent securely");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Message could not be sent");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="conversation-detail client-thread">
      <header className="conversation-header">
        <button className="conversation-back" aria-label="Back to inbox" onClick={back}><ArrowLeft /></button>
        <span className="conversation-avatar">{initials(practice?.name || "Examiner")}</span>
        <div><h2>{thread.subject}</h2><p>{practice?.name || "Examination team"} · {label(thread.status)}</p></div>
        <span className="secure-thread"><ShieldCheck /> Secure</span>
      </header>
      {request && <div className="client-linked-request"><FileText /><span><small>LINKED REQUEST {request.reference}</small><strong>{request.title}</strong></span><b>{label(request.status)}</b></div>}
      <div className="message-stream">
        <div className="conversation-start"><ShieldCheck /><p>Messages and attachments form part of the secure engagement record.</p></div>
        {messages.map((item) => {
          const mine = item.authorEmail.toLowerCase() === state.actor.email.toLowerCase();
          const replied = messages.find((candidate) => candidate.id === item.replyToMessageId);
          const attachments = state.documents.filter((document) => document.conversationMessageId === item.id);
          return (
            <div key={item.id} className={`message-row ${mine ? "mine" : "theirs"} ${item.authorType === "SYSTEM" ? "system" : ""}`}>
              {item.authorType !== "SYSTEM" && <span className="message-avatar">{initials(item.authorName)}</span>}
              <div className="message-content">
                {item.authorType !== "SYSTEM" && <header><strong>{item.authorName}</strong><span>{item.authorType === "CLIENT" ? "Your organisation" : "Examination team"}</span></header>}
                {replied && <blockquote><strong>{replied.authorName}</strong>{replied.body}</blockquote>}
                <p>{item.body}</p>
                {attachments.map((document) => <a className="message-attachment" href={`/api/files?id=${document.id}`} title={`Download ${document.fileName}`} key={document.id}><FileText /><span><strong>{document.fileName}</strong><small>{Math.ceil(document.byteSize / 1024)} KB · Receipt {document.sha256.slice(0, 12).toUpperCase()}</small></span></a>)}
                <footer><time>{dateTime(item.createdAt)}</time>{mine && item.authorType !== "SYSTEM" && <span><CheckCircle2 /> {messageReceipt(state, item)}</span>}{item.authorType !== "SYSTEM" && <button onClick={() => setReplyTo(item)}><Reply /> Reply</button>}</footer>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <footer className="message-composer client-composer">
        {error && <div className="composer-error">{error}</div>}
        {thread.status === "RESOLVED" ? (
          <div className="resolved-banner"><CheckCircle2 /> This conversation has been resolved by the examination team.</div>
        ) : !canRespond ? (
          <div className="resolved-banner read-only"><ShieldCheck /> This account can read the conversation but cannot send messages.</div>
        ) : (
          <>
            {replyTo && <div className="replying-to"><Reply /><span><strong>Replying to {replyTo.authorName}</strong>{replyTo.body}</span><button onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X /></button></div>}
            {file && <div className="pending-attachment"><Paperclip /><span>{file.name}</span><button onClick={() => setFile(null)} aria-label="Remove attachment"><X /></button></div>}
            <textarea aria-label="Message" value={message} maxLength={10_000} onChange={(event) => setMessage(event.target.value)} placeholder="Write a message to the examination team…" onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void send(); }} />
            <div><label className="attach-button"><input type="file" accept=".pdf,.docx,.xlsx,.csv,.jpg,.jpeg,.png" onChange={(event) => { const selected = event.target.files?.[0] ?? null; if (selected && selected.size > 25 * 1024 * 1024) { setError("The selected file exceeds the 25 MB limit"); setFile(null); event.target.value = ""; return; } setError(""); setFile(selected); }} /><Paperclip /> Attach file</label><span>{message.length.toLocaleString()}/10,000</span><button className="primary" disabled={busy || !message.trim()} onClick={() => void send()}>{busy ? <Loader2 className="spin" /> : <Send />}{busy ? "Sending…" : "Send"}</button></div>
          </>
        )}
      </footer>
    </article>
  );
}

function NewClientConversation({
  state,
  engagement,
  refresh,
  notify,
  close,
  selectThread,
}: {
  state: AppState;
  engagement: Engagement;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  close: () => void;
  selectThread: (id: PublicId | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const threadIds = new Set(
    state.conversations
      .filter((thread) => thread.engagementId === engagement.id)
      .map((thread) => thread.id),
  );
  const examiner = state.conversationParticipants.find(
    (participant) =>
      threadIds.has(participant.threadId) &&
      participant.participantType === "PRACTICE",
  );
  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal communications-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-new-message"
      >
        <header>
          <div>
            <p className="eyebrow">SECURE MESSAGE</p>
            <h2 id="client-new-message">Contact the examination team</h2>
          </div>
          <button type="button" onClick={close} aria-label="Close">
            <X />
          </button>
        </header>
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const values = Object.fromEntries(
              new FormData(event.currentTarget).entries(),
            );
            void action("createConversation", {
              ...values,
              engagementId: engagement.id,
            })
              .then(async (nextState) => {
                const created = nextState.conversations
                  .filter(
                    (thread) =>
                      thread.engagementId === engagement.id &&
                      thread.createdBy.toLowerCase() ===
                        state.actor.email.toLowerCase(),
                  )
                  .sort((a, b) =>
                    b.createdAt.localeCompare(a.createdAt),
                  )[0];
                await refresh();
                selectThread(created?.id ?? null);
                notify("Conversation sent to the examination team");
                close();
              })
              .catch((reason) =>
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Conversation could not be started",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <div className="recipient-card">
            <span className="conversation-avatar">
              {initials(examiner?.name || "Team")}
            </span>
            <span>
              <small>TO</small>
              <strong>{examiner?.name || "Examination team"}</strong>
              <p>Secure engagement workspace</p>
            </span>
            <ShieldCheck />
          </div>
          <label>
            Subject
            <input
              name="subject"
              required
              maxLength={160}
              placeholder="What would you like to discuss?"
            />
          </label>
          <label>
            Category
            <select name="category" defaultValue="GENERAL">
              <option value="GENERAL">General engagement question</option>
              <option value="EVIDENCE">Evidence or information request</option>
              <option value="GOVERNANCE">Trustees or governance</option>
              <option value="REPORTING">Accounts or reporting</option>
              <option value="TECHNICAL">Portal support</option>
            </select>
          </label>
          <label>
            Message
            <textarea
              name="message"
              required
              maxLength={10_000}
              placeholder="Provide enough context for the team to respond."
            />
          </label>
          <footer>
            <span>
              <ShieldCheck /> Secure and recorded
            </span>
            <button type="button" className="secondary" onClick={close}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              {busy ? <Loader2 className="spin" /> : <Send />} Send
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

async function action(name: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, ...payload }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The change could not be saved");
  return result as AppState;
}

function messagesFor(state: AppState, threadId: PublicId) { return state.conversationMessages.filter((message) => message.threadId === threadId); }
function practiceParticipant(state: AppState, threadId: PublicId) { return state.conversationParticipants.find((participant) => participant.threadId === threadId && participant.participantType === "PRACTICE"); }
function unread(state: AppState, thread: ConversationThread) { const participant = state.conversationParticipants.find((item) => item.threadId === thread.id && item.email.toLowerCase() === state.actor.email.toLowerCase()); const incoming = messagesFor(state, thread.id).filter((item) => item.authorEmail.toLowerCase() !== state.actor.email.toLowerCase()).at(-1); return Boolean(incoming && (!participant?.lastReadAt || incoming.createdAt > participant.lastReadAt)); }
function messageReceipt(state: AppState, message: ConversationMessage) { const read = state.conversationParticipants.some((participant) => participant.threadId === message.threadId && participant.email.toLowerCase() !== message.authorEmail.toLowerCase() && Boolean(participant.lastReadAt && participant.lastReadAt >= message.createdAt)); return read ? "Read" : "Sent"; }
function initials(value: string) { return value.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "IE"; }
function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function dateTime(value: string) { return new Date(value.endsWith("Z") ? value : `${value}Z`).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
function relative(value: string) { const minutes = Math.max(0, Math.round((Date.now() - new Date(value.endsWith("Z") ? value : `${value}Z`).getTime()) / 60_000)); if (minutes < 60) return `${minutes || 1}m`; if (minutes < 1_440) return `${Math.floor(minutes / 60)}h`; if (minutes < 10_080) return `${Math.floor(minutes / 1_440)}d`; return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }
