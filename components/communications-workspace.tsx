"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
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
} from "@/lib/types";

type Mutate = (
  action: string,
  payload?: Record<string, unknown>,
) => Promise<AppState>;

export function CommunicationsWorkspace({
  state,
  engagementId,
  selectEngagement,
  mutate,
  notify,
}: {
  state: AppState;
  engagementId: number;
  selectEngagement: (id: number) => void;
  mutate: Mutate;
  notify: (message: string) => void;
}) {
  const [filter, setFilter] = useState<"ALL" | "UNREAD" | "OPEN" | "RESOLVED">("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const threads = useMemo(
    () =>
      state.conversations
        .filter((thread) => thread.engagementId === engagementId)
        .filter((thread) => {
          if (filter === "UNREAD") return isUnread(state, thread);
          if (filter === "OPEN") return thread.status !== "RESOLVED";
          if (filter === "RESOLVED") return thread.status === "RESOLVED";
          return true;
        })
        .filter((thread) => {
          const needle = query.trim().toLowerCase();
          if (!needle) return true;
          const messages = state.conversationMessages
            .filter((message) => message.threadId === thread.id)
            .map((message) => message.body)
            .join(" ");
          return `${thread.subject} ${thread.category} ${messages}`
            .toLowerCase()
            .includes(needle);
        })
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
    [state, engagementId, filter, query],
  );
  const selected =
    threads.find((thread) => thread.id === selectedId) ?? threads[0] ?? null;

  useEffect(() => {
    if (!selected || !isUnread(state, selected)) return;
    void mutate("markConversationRead", { threadId: selected.id });
  }, [selected?.id, selected?.lastMessageAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const unread = state.conversations.filter(
    (thread) => thread.engagementId === engagementId && isUnread(state, thread),
  ).length;
  const engagement = state.engagements.find((item) => item.id === engagementId)!;

  return (
    <section className="communications-page">
      <header className="communications-titlebar">
        <div>
          <p className="eyebrow">CLIENT COLLABORATION</p>
          <h1>Secure messages</h1>
          <p>
            One controlled record for client enquiries, evidence discussions and
            completion communications.
          </p>
        </div>
        <button className="primary" onClick={() => setNewOpen(true)}>
          <Plus /> New conversation
        </button>
      </header>
      <label className="engagement-select communications-engagement">
        Engagement
        <select
          value={engagementId}
          onChange={(event) => {
            selectEngagement(Number(event.target.value));
            setSelectedId(null);
          }}
        >
          {state.engagements.map((item) => (
            <option key={item.id} value={item.id}>
              {item.clientName} · {date(item.periodEnd)}
            </option>
          ))}
        </select>
      </label>
      <div className={`communications-shell ${selected ? "has-selection" : ""}`}>
        <aside className="conversation-index">
          <div className="conversation-search">
            <Search />
            <input
              aria-label="Search conversations"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search subject or message"
            />
          </div>
          <div className="conversation-filters" aria-label="Conversation filters">
            {(["ALL", "UNREAD", "OPEN", "RESOLVED"] as const).map((item) => (
              <button
                key={item}
                className={filter === item ? "active" : ""}
                onClick={() => setFilter(item)}
              >
                {label(item)}
                {item === "UNREAD" && unread > 0 && <b>{unread}</b>}
              </button>
            ))}
          </div>
          <div className="conversation-list">
            {threads.map((thread) => {
              const latest = lastMessage(state, thread.id);
              const unreadThread = isUnread(state, thread);
              return (
                <button
                  key={thread.id}
                  className={`${selected?.id === thread.id ? "active" : ""} ${unreadThread ? "unread" : ""}`}
                  onClick={() => setSelectedId(thread.id)}
                >
                  <span className="conversation-avatar">
                    {initials(counterparty(state, thread.id)?.name || "Client")}
                  </span>
                  <span className="conversation-summary">
                    <span>
                      <strong>{thread.subject}</strong>
                      <time>{relative(thread.lastMessageAt)}</time>
                    </span>
                    <small>
                      {counterparty(state, thread.id)?.name || engagement.clientName}
                    </small>
                    <p>{latest?.body || "Conversation created"}</p>
                    <span className="conversation-tags">
                      <i>{label(thread.category)}</i>
                      {thread.priority !== "NORMAL" && (
                        <i className={`priority-${thread.priority.toLowerCase()}`}>
                          {label(thread.priority)}
                        </i>
                      )}
                      {unreadThread && <b>New</b>}
                    </span>
                  </span>
                </button>
              );
            })}
            {!threads.length && (
              <div className="conversation-empty">
                <Inbox />
                <strong>No conversations found</strong>
                <p>Change the filter or begin a new client conversation.</p>
              </div>
            )}
          </div>
        </aside>
        {selected ? (
          <ConversationDetail
            key={selected.id}
            state={state}
            thread={selected}
            mutate={mutate}
            notify={notify}
            back={() => setSelectedId(null)}
          />
        ) : (
          <div className="conversation-placeholder">
            <MessageSquare />
            <h2>Select a conversation</h2>
            <p>Messages, evidence and delivery history will appear here.</p>
          </div>
        )}
      </div>
      {newOpen && (
        <NewConversation
          state={state}
          engagementId={engagementId}
          close={() => setNewOpen(false)}
          mutate={mutate}
          notify={notify}
        />
      )}
    </section>
  );
}

function ConversationDetail({
  state,
  thread,
  mutate,
  notify,
  back,
}: {
  state: AppState;
  thread: ConversationThread;
  mutate: Mutate;
  notify: (message: string) => void;
  back: () => void;
}) {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<ConversationMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const messages = state.conversationMessages.filter(
    (item) => item.threadId === thread.id,
  );
  const request = state.requests.find((item) => item.id === thread.requestId);
  const engagement = state.engagements.find(
    (item) => item.id === thread.engagementId,
  )!;
  const participants = state.conversationParticipants.filter(
    (item) => item.threadId === thread.id,
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const attachmentIds: number[] = [];
      if (file) {
        const form = new FormData();
        form.set("file", file);
        form.set("engagementId", String(thread.engagementId));
        form.set("conversationThreadId", String(thread.id));
        form.set("fileSection", "COMMUNICATION");
        const response = await fetch("/api/files", { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Attachment upload failed");
        attachmentIds.push(result.document.id);
      }
      await mutate("sendConversationMessage", {
        threadId: thread.id,
        message,
        replyToMessageId: replyTo?.id ?? null,
        attachmentIds,
      });
      setMessage("");
      setFile(null);
      setReplyTo(null);
      notify("Message delivered to the secure client portal");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Message could not be sent");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: string) => {
    setBusy(true);
    setError("");
    try {
      await mutate("updateConversation", {
        threadId: thread.id,
        status,
        priority: thread.priority,
        assignedTo: thread.assignedTo,
        resolutionNote,
      });
      setResolutionNote("");
      notify(status === "RESOLVED" ? "Conversation resolved" : "Conversation reopened");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Status could not be changed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="conversation-detail">
      <header className="conversation-header">
        <button className="conversation-back" aria-label="Back to conversations" onClick={back}>
          <ArrowLeft />
        </button>
        <div>
          <span className="conversation-state">
            <i className={thread.status.toLowerCase()} /> {label(thread.status)}
          </span>
          <h2>{thread.subject}</h2>
          <p>
            {participants.map((participant) => participant.name).join(", ")} · {label(thread.category)}
          </p>
        </div>
        <span className="secure-thread"><ShieldCheck /> Secure record</span>
      </header>
      <div className="conversation-body">
        <div className="message-stream" aria-live="polite">
          <div className="conversation-start">
            <LockNotice />
            <p>
              Conversation opened {dateTime(thread.createdAt)}. Messages and files are retained in the
              engagement record.
            </p>
          </div>
          {messages.map((item) => {
            const mine = item.authorEmail.toLowerCase() === state.actor.email.toLowerCase();
            const replied = messages.find((candidate) => candidate.id === item.replyToMessageId);
            const attachments = state.documents.filter(
              (document) => document.conversationMessageId === item.id,
            );
            return (
              <div
                key={item.id}
                className={`message-row ${mine ? "mine" : "theirs"} ${item.authorType === "SYSTEM" ? "system" : ""}`}
              >
                {item.authorType !== "SYSTEM" && (
                  <span className="message-avatar">{initials(item.authorName)}</span>
                )}
                <div className="message-content">
                  {item.authorType !== "SYSTEM" && (
                    <header>
                      <strong>{item.authorName}</strong>
                      <span>{item.authorType === "CLIENT" ? "Client" : "Practice"}</span>
                    </header>
                  )}
                  {replied && (
                    <blockquote>
                      <strong>{replied.authorName}</strong>
                      {replied.body}
                    </blockquote>
                  )}
                  <p>{item.body}</p>
                  {attachments.map((document) => (
                    <a className="message-attachment" href={`/api/files?id=${document.id}`} key={document.id}>
                      <FileText />
                      <span>
                        <strong>{document.fileName}</strong>
                        <small>{fileSize(document.byteSize)} · {document.sha256.slice(0, 10)}…</small>
                      </span>
                    </a>
                  ))}
                  <footer>
                    <time>{dateTime(item.createdAt)}</time>
                    {mine && item.authorType !== "SYSTEM" && (
                      <span><CheckCircle2 /> Delivered</span>
                    )}
                    {item.authorType !== "SYSTEM" && (
                      <button onClick={() => setReplyTo(item)}><Reply /> Reply</button>
                    )}
                  </footer>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <aside className="conversation-context">
          <h3>Conversation details</h3>
          <dl>
            <div><dt>Charity</dt><dd>{engagement.clientName}</dd></div>
            <div><dt>Year end</dt><dd>{date(engagement.periodEnd)}</dd></div>
            <div><dt>Priority</dt><dd><Priority value={thread.priority} /></dd></div>
            <div><dt>Owner</dt><dd>{ownerName(state, thread.assignedTo)}</dd></div>
          </dl>
          {request && (
            <div className="linked-record">
              <FileText />
              <div>
                <small>LINKED EVIDENCE REQUEST</small>
                <strong>{request.reference}</strong>
                <p>{request.title}</p>
                <span>{label(request.status)} · due {date(request.dueDate)}</span>
              </div>
            </div>
          )}
          <label>
            Priority
            <select
              value={thread.priority}
              onChange={(event) =>
                void mutate("updateConversation", {
                  threadId: thread.id,
                  status: thread.status,
                  priority: event.target.value,
                  assignedTo: thread.assignedTo,
                })
              }
            >
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </label>
          <label>
            Conversation owner
            <select
              value={thread.assignedTo ?? ""}
              onChange={(event) =>
                void mutate("updateConversation", {
                  threadId: thread.id,
                  status: thread.status,
                  priority: thread.priority,
                  assignedTo: event.target.value,
                })
              }
            >
              <option value="">Unassigned</option>
              {state.users.filter((user) => user.status === "ACTIVE").map((user) => (
                <option value={user.email} key={user.id}>{user.name}</option>
              ))}
            </select>
          </label>
          <label>
            {thread.status === "RESOLVED" ? "Reason for reopening" : "Resolution summary"}
            <textarea
              value={resolutionNote}
              onChange={(event) => setResolutionNote(event.target.value)}
              placeholder={
                thread.status === "RESOLVED"
                  ? "Explain why further communication is required"
                  : "Record the outcome before closing"
              }
            />
          </label>
          <button
            className="secondary conversation-resolution"
            disabled={busy || !resolutionNote.trim()}
            onClick={() => changeStatus(thread.status === "RESOLVED" ? "OPEN" : "RESOLVED")}
          >
            {thread.status === "RESOLVED" ? <Archive /> : <CheckCircle2 />}
            {thread.status === "RESOLVED" ? "Reopen conversation" : "Resolve conversation"}
          </button>
        </aside>
      </div>
      <footer className="message-composer">
        {error && <div className="composer-error">{error}</div>}
        {thread.status === "RESOLVED" ? (
          <div className="resolved-banner">
            <CheckCircle2 /> This conversation is resolved. Reopen it to send a further message.
          </div>
        ) : (
          <>
            {replyTo && (
              <div className="replying-to">
                <Reply />
                <span><strong>Replying to {replyTo.authorName}</strong>{replyTo.body}</span>
                <button onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X /></button>
              </div>
            )}
            {file && (
              <div className="pending-attachment">
                <Paperclip /> <span>{file.name}</span>
                <button onClick={() => setFile(null)} aria-label="Remove attachment"><X /></button>
              </div>
            )}
            <textarea
              aria-label="Message"
              maxLength={10_000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Write a clear message to the client…"
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void send();
              }}
            />
            <div>
              <label className="attach-button">
                <input
                  type="file"
                  accept=".pdf,.docx,.xlsx,.csv,.jpg,.jpeg,.png"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <Paperclip /> Attach evidence
              </label>
              <span>{message.length.toLocaleString()}/10,000 · Ctrl + Enter to send</span>
              <button className="primary" disabled={busy || !message.trim()} onClick={() => void send()}>
                {busy ? <Loader2 className="spin" /> : <Send />}
                {busy ? "Sending…" : "Send message"}
              </button>
            </div>
          </>
        )}
      </footer>
    </article>
  );
}

function NewConversation({
  state,
  engagementId,
  close,
  mutate,
  notify,
}: {
  state: AppState;
  engagementId: number;
  close: () => void;
  mutate: Mutate;
  notify: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const engagement = state.engagements.find((item) => item.id === engagementId)!;
  const client = state.clients.find((item) => item.id === engagement.clientId)!;
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal communications-modal" role="dialog" aria-modal="true" aria-labelledby="new-conversation-title">
        <header>
          <div><p className="eyebrow">CLIENT COLLABORATION</p><h2 id="new-conversation-title">New conversation</h2></div>
          <button onClick={close} aria-label="Close"><X /></button>
        </header>
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const values = Object.fromEntries(new FormData(event.currentTarget).entries());
            void mutate("createConversation", { ...values, engagementId })
              .then(() => {
                notify("Conversation opened and delivered to the client portal");
                close();
              })
              .catch((reason) => setError(reason instanceof Error ? reason.message : "Conversation could not be created"))
              .finally(() => setBusy(false));
          }}
        >
          {error && <div className="error-banner">{error}</div>}
          <div className="recipient-card">
            <span className="conversation-avatar">{initials(client.contactName)}</span>
            <span><small>TO</small><strong>{client.contactName}</strong><p>{client.contactEmail} · {client.name}</p></span>
            <ShieldCheck />
          </div>
          <input type="hidden" name="contactName" value={client.contactName} />
          <input type="hidden" name="contactEmail" value={client.contactEmail} />
          <label>Subject<input name="subject" required maxLength={160} placeholder="Concise description of the matter" /></label>
          <div className="two-col">
            <label>Category<select name="category" defaultValue="GENERAL"><option value="GENERAL">General</option><option value="EVIDENCE">Evidence</option><option value="GOVERNANCE">Governance</option><option value="REPORTING">Reporting</option><option value="TECHNICAL">Technical</option></select></label>
            <label>Priority<select name="priority" defaultValue="NORMAL"><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
          </div>
          <label>Message<textarea name="message" required maxLength={10_000} placeholder="Set out the question, required action and relevant timing." /></label>
          <footer>
            <span><ShieldCheck /> Delivered through the secure client portal</span>
            <button type="button" className="secondary" onClick={close}>Cancel</button>
            <button className="primary" disabled={busy}>{busy ? <Loader2 className="spin" /> : <Send />} Send</button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function LockNotice() {
  return <ShieldCheck aria-label="Secure conversation" />;
}

function isUnread(state: AppState, thread: ConversationThread) {
  const participant = state.conversationParticipants.find(
    (item) => item.threadId === thread.id && item.email.toLowerCase() === state.actor.email.toLowerCase(),
  );
  const incoming = state.conversationMessages
    .filter(
      (item) =>
        item.threadId === thread.id &&
        item.authorEmail.toLowerCase() !== state.actor.email.toLowerCase(),
    )
    .at(-1);
  return Boolean(incoming && (!participant?.lastReadAt || incoming.createdAt > participant.lastReadAt));
}

function lastMessage(state: AppState, threadId: number) {
  return state.conversationMessages.filter((item) => item.threadId === threadId).at(-1);
}

function counterparty(state: AppState, threadId: number) {
  return state.conversationParticipants.find(
    (item) => item.threadId === threadId && item.participantType === "CLIENT",
  );
}

function ownerName(state: AppState, email: string | null) {
  if (!email) return "Unassigned";
  return state.users.find((user) => user.email.toLowerCase() === email.toLowerCase())?.name || email;
}

function Priority({ value }: { value: string }) {
  return <span className={`priority-badge priority-${value.toLowerCase()}`}>{label(value)}</span>;
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function initials(value: string) {
  return value.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "CL";
}

function date(value: string) {
  return new Date(value + (value.includes("T") ? "" : "T12:00:00Z")).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dateTime(value: string) {
  return new Date(value.endsWith("Z") ? value : `${value}Z`).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relative(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value.endsWith("Z") ? value : `${value}Z`).getTime()) / 60_000));
  if (minutes < 60) return `${minutes || 1}m`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 10_080) return `${Math.floor(minutes / 1_440)}d`;
  return date(value);
}

function fileSize(bytes: number) {
  if (bytes < 1_024 * 1_024) return `${Math.ceil(bytes / 1_024)} KB`;
  return `${(bytes / 1_024 / 1_024).toFixed(1)} MB`;
}
