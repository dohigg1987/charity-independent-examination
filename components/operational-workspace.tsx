"use client";
/* eslint-disable react-hooks/set-state-in-effect -- local form drafts reset when the selected persistent record changes */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpenCheck,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  FolderOpen,
  Globe2,
  HelpCircle,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Save,
  RotateCcw,
  Send,
  ShieldCheck,
  UploadCloud,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { Logo } from "./logo";
import { TbWorkspace } from "./tb-workspace";
import { CommunicationsWorkspace } from "./communications-workspace";
import { assessConfiguredEligibility, assessEligibility } from "@/lib/eligibility";
import { conclusionCompatibility, isConcernClosed } from "@/lib/concerns";
import { ruleSeriesIssues } from "@/lib/rule-series";
import type {
  AppState,
  Client,
  Engagement,
  EvidenceRequest,
  Jurisdiction,
  JurisdictionRuleSet,
  OrganisationType,
  Procedure,
  PublicId,
  ReviewNote,
  Task,
  TeamMember,
  Trustee,
} from "@/lib/types";

type View =
  | "portfolio"
  | "engagement"
  | "requests"
  | "messages"
  | "review"
  | "concerns"
  | "reporting"
  | "clients"
  | "team"
  | "templates"
  | "audit"
  | "admin";
type ClientSection = "permanent" | "annual" | "governance";
type Dialog = {
  kind:
    | "client"
    | "editClient"
    | "engagement"
    | "editEngagement"
    | "request"
    | "requestDetail"
    | "review"
    | "clear"
    | "team"
    | "trustee"
    | "editTrustee"
    | "clientUser"
    | "task"
    | "help";
  data?: unknown;
} | null;
type Mutate = (
  action: string,
  payload?: Record<string, unknown>,
) => Promise<AppState>;
type Notify = (m: string) => void;
async function handleUiAction(action: () => Promise<void>) {
  try {
    await action();
  } catch {
    // The shared mutator has already surfaced the server's controlled error.
  }
}
const nav = [
  { id: "portfolio" as View, label: "Portfolio", icon: LayoutDashboard },
  { id: "engagement" as View, label: "Engagements", icon: BookOpenCheck },
  { id: "requests" as View, label: "Client requests", icon: Send },
  { id: "messages" as View, label: "Messages", icon: MessageSquare },
  { id: "review" as View, label: "Review", icon: ClipboardCheck },
  { id: "concerns" as View, label: "Findings & concerns", icon: AlertTriangle },
  { id: "reporting" as View, label: "Reporting", icon: FileCheck2 },
];

export function OperationalWorkspace() {
  const [state, setState] = useState<AppState | null>(null),
    [view, setView] = useState<View>("portfolio"),
    [engagementId, setEngagementId] = useState<PublicId | null>(null),
    [taskId, setTaskId] = useState<PublicId | null>(null),
    [clientId, setClientId] = useState<PublicId | null>(null),
    [clientSection, setClientSection] = useState<ClientSection>("permanent"),
    [query, setQuery] = useState(""),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [dialog, setDialog] = useState<Dialog>(null),
    [mobileNavOpen, setMobileNavOpen] = useState(false),
    [panel, setPanel] = useState<
      "notifications" | "practice" | "profile" | null
    >(null);
  const load = async () => {
    const r = await fetch("/api/state", { cache: "no-store" }),
      j = await r.json();
    if (!r.ok) throw new Error(j.error);
    setState(j);
    setEngagementId((v) => v ?? j.engagements[0]?.id ?? null);
    setTaskId((v) => v ?? j.tasks[0]?.id ?? null);
  };
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };
  const mutate: Mutate = async (action, payload = {}) => {
    setError("");
    const r = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      }),
      j = await r.json();
    if (!r.ok) {
      setError(j.error);
      throw new Error(j.error);
    }
    setState(j);
    return j;
  };
  if (!state)
    return (
      <div className="loading-screen">
        <Logo />
        <Loader2 className="spin" />
        <p>{error || "Loading controlled engagement data…"}</p>
      </div>
    );
  const active =
    state.engagements.find((e) => e.id === engagementId) ??
    state.engagements[0];
  if (!active)
    return (
      <FirstRunWorkspace
        state={state}
        dialog={dialog}
        setDialog={setDialog}
        mutate={mutate}
        notify={notify}
        error={error}
        toast={toast}
      />
    );
  const activeTask =
      state.tasks.find(
        (t) => t.id === taskId && t.engagementId === active.id,
      ) ?? state.tasks.find((t) => t.engagementId === active.id),
    activeClient =
      state.clients.find(
        (c) =>
          c.id ===
          (view === "clients"
            ? (clientId ?? state.clients[0]?.id)
            : active.clientId),
      ) ?? state.clients[0],
    outstanding = state.requests.filter((r) => r.status !== "RECEIVED"),
    unreadMessages = state.conversations.filter((thread) =>
      conversationUnread(state, thread.id),
    ).length,
    openNotes = state.notes.filter((n) => n.status !== "CLEARED");
  const go = (id: PublicId) => {
    setEngagementId(id);
    setTaskId(state.tasks.find((t) => t.engagementId === id)?.id ?? null);
    setView("engagement");
    setQuery("");
  };
  const goClient = (id: PublicId, section: ClientSection = "permanent") => {
    setClientId(id);
    setClientSection(section);
    setView("clients");
    setQuery("");
  };
  const results = query.trim()
    ? {
        engagements: state.engagements
          .filter((e) =>
            (e.clientName + e.charityNumber + e.status)
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .slice(0, 5),
        tasks: state.tasks
          .filter((t) =>
            (t.title + " " + t.direction)
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .slice(0, 5),
      }
    : null;
  return (
    <div className="app-shell" onClick={() => panel && setPanel(null)}>
      <aside
        className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}
        onClick={() => mobileNavOpen && setMobileNavOpen(false)}
      >
        <Logo inverse />
        <button
          className="organisation-switch"
          onClick={(e) => {
            e.stopPropagation();
            setPanel(panel === "practice" ? null : "practice");
          }}
        >
          <span className="org-avatar">DO</span>
          <span>
            <small>Organisation</small>{state.practiceName}
          </span>
          <ChevronDown />
        </button>
        <nav aria-label="Main navigation">
          <p className="nav-label">WORKSPACE</p>
          {nav.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              onClick={() => setView(n.id)}
            >
              <n.icon />
              <span>{n.label}</span>
              {n.id === "requests" && outstanding.length > 0 && (
                <b>{outstanding.length}</b>
              )}
              {n.id === "messages" && unreadMessages > 0 && (
                <b>{unreadMessages}</b>
              )}
              {n.id === "review" && openNotes.length > 0 && (
                <b>{openNotes.length}</b>
              )}
              {n.id === "concerns" &&
                state.concerns.filter((item) => !isConcernClosed(item.status))
                  .length > 0 && (
                  <b>
                    {
                      state.concerns.filter(
                        (item) => !isConcernClosed(item.status),
                      ).length
                    }
                  </b>
                )}
            </button>
          ))}
          <p className="nav-label lower">MANAGE</p>
          <Side
            active={view === "clients"}
            icon={<Building2 />}
            text="Clients"
            click={() => goClient(clientId ?? active.clientId, clientSection)}
          />
          <Side
            active={view === "team"}
            icon={<Users />}
            text="Team"
            click={() => setView("team")}
          />
          <Side
            active={view === "templates"}
            icon={<FolderOpen />}
            text="Templates"
            click={() => setView("templates")}
          />
          <Side
            active={view === "audit"}
            icon={<Activity />}
            text="Audit trail"
            click={() => setView("audit")}
          />
          <Side
            active={view === "admin"}
            icon={<ShieldCheck />}
            text="Administration"
            click={() => setView("admin")}
          />
        </nav>
        <div className="sidebar-foot">
          <ShieldCheck />
          <span>
            <strong>Control framework</strong>
            <small>UK charity regulatory regimes</small>
          </span>
        </div>
        <button
          className="user-card"
          onClick={(e) => {
            e.stopPropagation();
            setPanel(panel === "profile" ? null : "profile");
          }}
        >
          <span className="avatar">{initials(state.actor.name)}</span>
          <span>
            <strong>{state.actor.name}</strong>
            <small>{label(state.actor.role)}</small>
          </span>
          <MoreHorizontal />
        </button>
      </aside>
      {mobileNavOpen && (
        <button
          className="mobile-nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu-button"
            aria-label="Open navigation"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            <Menu />
          </button>
          <div className="search">
            <Search />
            <input
              aria-label="Search"
              placeholder="Search engagements, clients or workpapers"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>⌘ K</kbd>
            {results && (
              <div className="search-results">
                {results.engagements.map((e) => (
                  <button key={e.id} onClick={() => go(e.id)}>
                    <Building2 />
                    <span>
                      <strong>{e.clientName}</strong>
                      <small>
                        {e.charityNumber} · {label(e.status)}
                      </small>
                    </span>
                  </button>
                ))}
                {results.tasks.map((t) => (
                  <button
                    key={`t${t.id}`}
                    onClick={() => {
                      go(t.engagementId);
                      setTaskId(t.id);
                    }}
                  >
                    <FileText />
                    <span>
                      <strong>
                        {regulatoryUnit(
                          state.engagements.find(
                            (engagement) => engagement.id === t.engagementId,
                          )?.jurisdiction,
                        )} {t.direction}: {t.title}
                      </strong>
                      <small>{label(t.status)}</small>
                    </span>
                  </button>
                ))}
                {!results.engagements.length && !results.tasks.length && (
                  <p>No matching records.</p>
                )}
              </div>
            )}
          </div>
          <div className="top-actions">
            <button
              aria-label="Help"
              onClick={() => setDialog({ kind: "help" })}
            >
              <HelpCircle />
            </button>
            <button
              aria-label="Notifications"
              className="notification"
              onClick={(e) => {
                e.stopPropagation();
                setPanel(panel === "notifications" ? null : "notifications");
              }}
            >
              <Bell />
              {openNotes.length + outstanding.length > 0 && <i />}
            </button>
            <Link
              href={`/client?engagement=${active.id}`}
              className="portal-link"
            >
              <LockKeyhole />
              Preview client portal
            </Link>
          </div>
        </header>
        <Breadcrumbs
          view={view}
          client={activeClient}
          engagement={active}
          task={activeTask}
          clientSection={clientSection}
          goPortfolio={() => setView("portfolio")}
          goClients={() =>
            goClient(
              activeClient.id,
              view === "clients" ? clientSection : "permanent",
            )
          }
          goClient={() => goClient(activeClient.id, "permanent")}
          goEngagement={() => go(active.id)}
        />
        {error && (
          <div className="error-banner">
            <strong>Unable to complete the action.</strong>
            {error}
            <button onClick={() => setError("")}>
              <X />
            </button>
          </div>
        )}
        {view === "portfolio" && (
          <Portfolio
            state={state}
            query={query}
            open={go}
            create={() => setDialog({ kind: "engagement" })}
          />
        )}{" "}
        {view === "engagement" && activeTask && (
          <EngagementView
            state={state}
            engagement={active}
            task={activeTask}
            setTaskId={setTaskId}
            mutate={mutate}
            notify={notify}
            edit={() => setDialog({ kind: "editEngagement", data: active })}
            createTask={() => setDialog({ kind: "task" })}
            openConcerns={() => setView("concerns")}
          />
        )}{" "}
        {view === "requests" && (
          <Requests
            state={state}
            engagementId={active.id}
            select={setEngagementId}
            create={() => setDialog({ kind: "request" })}
            detail={(r) => setDialog({ kind: "requestDetail", data: r })}
          />
        )}{" "}
        {view === "messages" && (
          <CommunicationsWorkspace
            state={state}
            engagementId={active.id}
            selectEngagement={setEngagementId}
            mutate={mutate}
            notify={notify}
          />
        )}{" "}
        {view === "review" && (
          <Review
            state={state}
            engagementId={active.id}
            select={setEngagementId}
            create={() => setDialog({ kind: "review" })}
            clear={(n) => setDialog({ kind: "clear", data: n })}
            mutate={mutate}
            notify={notify}
          />
        )}{" "}
        {view === "concerns" && (
          <Findings
            state={state}
            engagement={active}
            select={setEngagementId}
            mutate={mutate}
            notify={notify}
          />
        )}{" "}
        {view === "reporting" && (
          <Reporting
            state={state}
            engagement={active}
            mutate={mutate}
            notify={notify}
          />
        )}{" "}
        {view === "clients" && (
          <Clients
            state={state}
            selectedId={activeClient.id}
            section={clientSection}
            selectClient={(id) => {
              setClientId(id);
              setClientSection("permanent");
            }}
            selectSection={setClientSection}
            create={() => setDialog({ kind: "client" })}
            edit={(c) => setDialog({ kind: "editClient", data: c })}
            addTrustee={(c) => setDialog({ kind: "trustee", data: c })}
            editTrustee={(t) => setDialog({ kind: "editTrustee", data: t })}
            addUser={(c) => setDialog({ kind: "clientUser", data: c })}
            mutate={mutate}
            notify={notify}
            openAnnual={go}
          />
        )}{" "}
        {view === "team" && (
          <Team
            state={state}
            create={() => setDialog({ kind: "team" })}
            mutate={mutate}
            notify={notify}
          />
        )}{" "}
        {view === "templates" && <Templates />}{" "}
        {view === "audit" && <Audit state={state} />}{" "}
        {view === "admin" && (
          <Admin state={state} mutate={mutate} notify={notify} />
        )}
      </main>
      {panel === "notifications" && (
        <Float title="Notifications" close={() => setPanel(null)}>
          <div className="notification-list">
            {outstanding.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setEngagementId(r.engagementId);
                  setView("requests");
                  setPanel(null);
                }}
              >
                <Clock3 />
                <span>
                  <strong>{r.title}</strong>
                  <small>
                    {label(r.status)} · {fmtDate(r.dueDate)}
                  </small>
                </span>
              </button>
            ))}
            {openNotes.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setEngagementId(n.engagementId);
                  setView("review");
                  setPanel(null);
                }}
              >
                <ClipboardCheck />
                <span>
                  <strong>
                    {n.reference}: {n.title}
                  </strong>
                  <small>{label(n.severity)} review point</small>
                </span>
              </button>
            ))}
          </div>
        </Float>
      )}
      {panel === "practice" && (
        <Float title="Practice" close={() => setPanel(null)}>
          <div className="panel-copy">
            <strong>{state.practiceName}</strong>
            <p>
              Independent examination workspace for charities in England and
              Wales.
            </p>
            <small>
              {state.engagements.length} engagements · {state.clients.length}{" "}
              clients
            </small>
          </div>
        </Float>
      )}
      {panel === "profile" && (
        <Float title="Signed-in user" close={() => setPanel(null)}>
          <div className="panel-copy">
            <strong>{state.actor.name}</strong>
            <p>{state.actor.email}</p>
            <small>{label(state.actor.role)} · authenticated user</small>
          </div>
        </Float>
      )}
      {dialog && (
        <DialogView
          dialog={dialog}
          close={() => setDialog(null)}
          state={state}
          active={active}
          mutate={mutate}
          notify={notify}
        />
      )}{" "}
      {toast && (
        <div className="toast">
          <CheckCircle2 />
          {toast}
        </div>
      )}
    </div>
  );
}

function FirstRunWorkspace({
  state,
  dialog,
  setDialog,
  mutate,
  notify,
  error,
  toast,
}: {
  state: AppState;
  dialog: Dialog;
  setDialog: (dialog: Dialog) => void;
  mutate: Mutate;
  notify: Notify;
  error: string;
  toast: string;
}) {
  const hasClient = state.clients.length > 0;
  const firstName = state.actor.name.split(" ")[0] || state.actor.name;
  return (
    <div className="first-run-shell">
      <header className="first-run-header">
        <Logo />
        <div>
          <span className="first-run-identity">
            <span className="avatar">{initials(state.actor.name)}</span>
            <span><strong>{state.actor.name}</strong><small>{state.actor.email}</small></span>
          </span>
          <Link href="/auth/sign-out" className="first-run-signout">Sign out</Link>
        </div>
      </header>
      <main className="first-run-main">
        <section className="first-run-intro">
          <p className="eyebrow">PRACTICE SETUP</p>
          <h1>Welcome to Clarity IE, {firstName}.</h1>
          <p>Your secure practice workspace is ready. Complete these two short steps to open your first independent examination file.</p>
          <div className="first-run-assurance">
            <ShieldCheck />
            <span><strong>Your practice is active</strong><small>{state.practiceName} · Administrator access</small></span>
          </div>
        </section>
        <section className="first-run-card" aria-label="Getting started">
          <header>
            <div><p className="eyebrow">GETTING STARTED</p><h2>Set up your first engagement</h2></div>
            <span>{hasClient ? "1 of 2 complete" : "Ready to begin"}</span>
          </header>
          <ol className="first-run-steps">
            <li className={hasClient ? "complete" : "current"}>
              <span className="step-number">{hasClient ? <Check /> : "1"}</span>
              <div><strong>Add the charity</strong><p>Record the charity, registration number and primary contact.</p>{hasClient && <small>{state.clients[0].name} added</small>}</div>
              <button className={hasClient ? "secondary" : "primary"} onClick={() => setDialog({ kind: "client" })}><Plus />{hasClient ? "Add another" : "Add charity"}</button>
            </li>
            <li className={hasClient ? "current" : "locked"}>
              <span className="step-number">2</span>
              <div><strong>Create the engagement</strong><p>Choose the reporting period, jurisdiction and accounting basis.</p></div>
              <button className="primary" disabled={!hasClient} onClick={() => setDialog({ kind: "engagement" })}><BookOpenCheck />Create engagement</button>
            </li>
          </ol>
          <footer><LockKeyhole /><span><strong>Private by default</strong>Your client records and examination files are only visible to authorised practice users.</span></footer>
        </section>
      </main>
      {error && <div className="error-banner first-run-error"><AlertTriangle />{error}</div>}
      {dialog && (
        <DialogView dialog={dialog} close={() => setDialog(null)} state={state} mutate={mutate} notify={notify} />
      )}
      {toast && <div className="toast"><CheckCircle2 />{toast}</div>}
    </div>
  );
}

function Portfolio({
  state,
  query,
  open,
  create,
}: {
  state: AppState;
  query: string;
  open: (id: PublicId) => void;
  create: () => void;
}) {
  const rows = state.engagements.filter((e) =>
    (e.clientName + e.charityNumber)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <Page
      eye="PORTFOLIO CONTROL"
      title={`Good afternoon, ${state.actor.name.split(" ")[0]}`}
      desc="Current position across the independent examination portfolio."
      action={
        <button className="primary" onClick={create}>
          <Plus />
          New engagement
        </button>
      }
    >
      <section className="stat-grid">
        <Stat
          c="blue"
          icon={<BookOpenCheck />}
          l="Active engagements"
          v={String(
            state.engagements.filter((e) => e.status !== "SIGNED").length,
          )}
          n="Controlled live records"
        />
        <Stat
          c="amber"
          icon={<Clock3 />}
          l="Awaiting client"
          v={String(
            state.requests.filter((r) => r.status !== "RECEIVED").length,
          )}
          n="Evidence requests open"
        />
        <Stat
          c="purple"
          icon={<ClipboardCheck />}
          l="Open review notes"
          v={String(state.notes.filter((n) => n.status !== "CLEARED").length)}
          n="Require clearance"
        />
        <Stat
          c="green"
          icon={<CheckCircle2 />}
          l="Completed"
          v={String(
            state.engagements.filter((e) => e.status === "SIGNED").length,
          )}
          n="Final reports locked"
        />
      </section>
      <section className="panel engagements">
        <div className="panel-title">
          <div>
            <h2>Engagement portfolio</h2>
            <p>All current independent examinations</p>
          </div>
        </div>
        <div className="table-head">
          <span>CHARITY</span>
          <span>YEAR END</span>
          <span>STAGE</span>
          <span>PROGRESS</span>
          <span>RISK</span>
          <span />
        </div>
        {rows.map((e, i) => (
          <button
            className="engagement-row"
            key={e.id}
            onClick={() => open(e.id)}
          >
            <span className="charity-cell">
              <i
                className={`charity-logo ${["willow", "harbour", "oak", "beacon"][i % 4]}`}
              >
                {e.clientName[0]}
              </i>
              <span>
                <strong>{e.clientName}</strong>
                <small>Charity no. {e.charityNumber}</small>
              </span>
            </span>
            <span>{fmtDate(e.periodEnd)}</span>
            <span>
              <b className={`stage ${stageClass(e.status)}`}>
                {label(e.status)}
              </b>
            </span>
            <span className="progress-cell">
              <i>
                <b style={{ width: `${progress(state, e.id)}%` }} />
              </i>
              <small>{progress(state, e.id)}%</small>
            </span>
            <span>{label(e.risk)}</span>
            <ChevronRight />
          </button>
        ))}
      </section>
    </Page>
  );
}

function EngagementView({
  state,
  engagement,
  task,
  setTaskId,
  mutate,
  notify,
  edit,
  createTask,
  openConcerns,
}: {
  state: AppState;
  engagement: Engagement;
  task: Task;
  setTaskId: (id: PublicId) => void;
  mutate: Mutate;
  notify: Notify;
  edit: () => void;
  createTask: () => void;
  openConcerns: () => void;
}) {
  const [conclusion, setConclusion] = useState(task.conclusion);
  useEffect(() => setConclusion(task.conclusion), [task.id, task.conclusion]);
  const tasks = state.tasks.filter((t) => t.engagementId === engagement.id),
    procedures = state.procedures.filter((p) => p.taskId === task.id);
  const save = async (status = task.status) => {
    await mutate("saveTask", {
      taskId: task.id,
      rowVersion: task.rowVersion,
      conclusion,
      status,
    });
    notify(`Task ${task.direction} saved as ${label(status)}`);
  };
  return (
    <div className="engagement-page">
      <div className="engagement-banner">
        <div>
          <strong>{engagement.clientName}</strong>
          <span>·</span>
          <span>{fmtDate(engagement.periodEnd)}</span>
        </div>
        <div className="banner-actions">
          <button className="secondary" onClick={edit}>
            Edit engagement
          </button>
          <button className="secondary" onClick={createTask}>
            <Plus />
            New task
          </button>
          <button
            className="primary"
            onClick={async () => {
              await mutate("moveToReview", { engagementId: engagement.id });
              notify("Engagement moved to review");
            }}
          >
            Send for review
          </button>
        </div>
      </div>
      <div className="engagement-title">
        <span className="charity-logo willow big">
          {engagement.clientName[0]}
        </span>
        <div>
          <h1>{engagement.clientName}</h1>
          <p>
            Year ended {fmtDate(engagement.periodEnd)} · Charity no.{" "}
            {engagement.charityNumber} · {engagement.accountingBasis}
          </p>
        </div>
        <span className="risk-chip">{label(engagement.risk)} risk</span>
      </div>
      <div className="accordion-layout">
        <section className="workpaper-accordions">
          <AnnualFileSection
            state={state}
            engagement={engagement}
            mutate={mutate}
            notify={notify}
            openConcerns={openConcerns}
          />
          {tasks.map((t) => {
            const open = t.id === task.id;
            return (
              <article
                className={`wp-accordion ${open ? "open" : ""}`}
                key={t.id}
              >
                <button
                  className="wp-accordion-head"
                  onClick={() => setTaskId(t.id)}
                >
                  <Status s={t.status} />
                  <span>
                    <small>
                      {t.isCustom
                        ? "CUSTOM TASK"
                        : `${regulatoryUnit(engagement.jurisdiction).toUpperCase()} ${t.direction}`}{" "}
                      · {t.phase}
                    </small>
                    <strong>{t.title}</strong>
                  </span>
                  <span>
                    {
                      state.procedures.filter(
                        (p) => p.taskId === t.id && p.status !== "NOT_STARTED",
                      ).length
                    }
                    /{state.procedures.filter((p) => p.taskId === t.id).length}
                  </span>
                  <ChevronDown />
                </button>
                {open && (
                  <div className="wp-accordion-body">
                    <div className="guidance-box">
                      <BookOpenCheck />
                      <div>
                        <strong>Relevant guidance</strong>
                        <p>{t.guidance || t.objective}</p>
                      </div>
                    </div>
                    <div className="objective">
                      <strong>Objective</strong>
                      <p>{t.objective}</p>
                    </div>
                    <div className="section-title">
                      <h3>Procedure tasks</h3>
                      <span>
                        {
                          procedures.filter((p) => p.status === "REVIEWED")
                            .length
                        }
                        /{procedures.length} reviewed
                      </span>
                    </div>
                    <div className="procedure-workpapers">
                      {procedures.map((p) => (
                        <ProcedureWorkpaper
                          key={p.id}
                          state={state}
                          engagement={engagement}
                          task={t}
                          procedure={p}
                          mutate={mutate}
                          notify={notify}
                        />
                      ))}
                    </div>
                    <div className="conclusion">
                      <div className="section-title">
                        <h3>Conclusion</h3>
                        <span className="required">REQUIRED</span>
                      </div>
                      <textarea
                        maxLength={2000}
                        value={conclusion}
                        onChange={(e) => setConclusion(e.target.value)}
                        placeholder="Record the conclusion, significant judgements and exceptions."
                      />
                      <div className="conclusion-meta">
                        <span>
                          <ShieldCheck />
                          Every saved version is hash-addressed
                        </span>
                        <span>{conclusion.length}/2,000</span>
                      </div>
                    </div>
                    <div className="workpaper-signoff">
                      <div>
                        <span className="avatar small">
                          {initials(state.actor.name)}
                        </span>
                        <p>
                          <strong>
                            {t.preparedBy
                              ? `Prepared by ${t.preparedBy}`
                              : "Not yet prepared"}
                          </strong>
                          <small>
                            {t.reviewedBy
                              ? `Reviewed by ${t.reviewedBy}`
                              : t.preparedAt
                                ? fmtTime(t.preparedAt)
                                : "Conclusion required before preparation"}
                          </small>
                        </p>
                      </div>
                      <div className="signoff-buttons">
                        <button
                          className="secondary"
                          onClick={() => save("IN_PROGRESS")}
                        >
                          <FileText />
                          Save draft
                        </button>
                        <button
                          className="secondary"
                          onClick={() => save("PREPARED")}
                        >
                          <Check />
                          Mark prepared
                        </button>
                        <button
                          className="primary"
                          onClick={() => save("REVIEWED")}
                        >
                          <ShieldCheck />
                          Review sign-off
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
        <ActivityPanel
          state={state}
          engagement={engagement}
          task={task}
          mutate={mutate}
          notify={notify}
        />
      </div>
    </div>
  );
}

function ScopeSection({
  state,
  engagement,
  mutate,
  notify,
}: {
  state: AppState;
  engagement: Engagement;
  mutate: Mutate;
  notify: Notify;
}) {
  const [scope, setScope] = useState(engagement.scopeConclusion),
    [jurisdiction, setJurisdiction] = useState(engagement.jurisdiction),
    [fundProfile, setFundProfile] = useState(engagement.fundProfile),
    [complexity, setComplexity] = useState(engagement.complexity),
    [overrides, setOverrides] = useState({
      governingDocumentAudit: engagement.governingDocumentAudit,
      funderAudit: engagement.funderAudit,
      commissionAudit: engagement.commissionAudit,
      groupAccountsRequired: engagement.groupAccountsRequired,
    });
  useEffect(() => {
    setScope(engagement.scopeConclusion);
    setJurisdiction(engagement.jurisdiction);
    setFundProfile(engagement.fundProfile);
    setComplexity(engagement.complexity);
    setOverrides({
      governingDocumentAudit: engagement.governingDocumentAudit,
      funderAudit: engagement.funderAudit,
      commissionAudit: engagement.commissionAudit,
      groupAccountsRequired: engagement.groupAccountsRequired,
    });
  }, [engagement]);
  const eligibility = configuredEligibility(
    state,
    {
      ...engagement,
      jurisdiction,
      jurisdictionRuleSetId:
        jurisdiction === engagement.jurisdiction
          ? engagement.jurisdictionRuleSetId
          : null,
    },
    overrides,
  );
  const route =
    eligibility.scrutiny === "INDEPENDENT_EXAMINATION"
      ? eligibility.qualifiedExaminerRequired
        ? "Qualified independent examination"
        : "Independent examination"
      : eligibility.scrutiny === "AUDIT"
        ? "Statutory audit route"
        : "No statutory scrutiny";
  const save = async () => {
    await mutate("updateScope", {
      engagementId: engagement.id,
      jurisdiction,
      fundProfile,
      complexity,
      scopeConclusion: scope,
      ...overrides,
    });
    notify("Scope and eligibility assessment saved");
  };
  return (
    <section className="scope-card">
      <header>
        <div>
          <p className="eyebrow">ACCEPTANCE AND SCOPE</p>
          <h2>Limited-assurance route</h2>
        </div>
        <span className={`route-chip ${eligibility.scrutiny.toLowerCase()}`}>
          {route}
        </span>
      </header>
      <div className="limited-assurance-note">
        <ShieldCheck />
        <p>
          <strong>Limited assurance engagement</strong>Use enquiry, analytical
          review and targeted verification. Do not default to audit assertions,
          mandatory sampling, control reliance testing or a true-and-fair audit
          opinion.
        </p>
      </div>
      <div className="scope-grid">
        <label>
          Jurisdiction
          <select
            value={jurisdiction}
            disabled
            title="Jurisdiction is pinned when the annual file is created"
            onChange={(e) => setJurisdiction(e.target.value)}
          >
            {state.jurisdictions
              .filter((item) => item.status === "ACTIVE")
              .map((item) => (
                <option value={item.code} key={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Fund profile
          <select
            value={fundProfile}
            onChange={(e) => setFundProfile(e.target.value)}
          >
            <option value="UNRESTRICTED_ONLY">Unrestricted only</option>
            <option value="MULTI_FUND">Multiple funds</option>
            <option value="ENDOWMENT">Endowment or special trusts</option>
          </select>
        </label>
        <label>
          Complexity
          <select
            value={complexity}
            onChange={(e) => setComplexity(e.target.value)}
          >
            <option value="LOW">Low</option>
            <option value="STANDARD">Standard</option>
            <option value="HIGH">High</option>
          </select>
        </label>
        <label>
          Methodology
          <input value={engagement.methodologyVersion} disabled />
        </label>
      </div>
      <div className="threshold-strip">
        <span>
          <strong>{eligibility.framework}</strong>
          {eligibility.reason}
        </span>
        <span>
          IE over {money(eligibility.thresholds.examinationFloor)} · qualified
          examiner over {money(eligibility.thresholds.qualificationFloor)} ·
          audit over {money(eligibility.thresholds.auditIncome)}
        </span>
      </div>
      <div className="override-grid">
        {(
          [
            ["governingDocumentAudit", "Governing document requires audit"],
            ["funderAudit", "Funder or contract requires audit"],
            ["commissionAudit", "Commission direction requires audit"],
            [
              "groupAccountsRequired",
              "Group accounts or wider law requires audit",
            ],
          ] as const
        ).map(([key, text]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={overrides[key]}
              onChange={(e) =>
                setOverrides({ ...overrides, [key]: e.target.checked })
              }
            />
            {text}
          </label>
        ))}
      </div>
      <label className="scope-conclusion">
        Proportionate scoping conclusion
        <textarea
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          placeholder="Explain how income, assets, basis, legal form, funds, complexity and identified concerns shape the work programme."
        />
      </label>
      <footer>
        <span>
          {engagement.lockedAt ? (
            <>
              <LockKeyhole />
              Locked {fmtTime(engagement.lockedAt)}
            </>
          ) : (
            "Scope determines which procedures apply and the depth of targeted work."
          )}
        </span>
        <button
          className="primary"
          disabled={Boolean(engagement.lockedAt)}
          onClick={save}
        >
          <Check />
          Save scope
        </button>
      </footer>
    </section>
  );
}

function ConcernsSection({
  state,
  engagement,
  mutate,
  notify,
  openConcerns,
}: {
  state: AppState;
  engagement: Engagement;
  mutate: Mutate;
  notify: Notify;
  openConcerns: () => void;
}) {
  const concerns = state.concerns.filter(
    (c) => c.engagementId === engagement.id,
  );
  const open = concerns.filter((item) => !isConcernClosed(item.status)).length;
  const review = concerns.filter(
    (item) => item.status === "READY_FOR_REVIEW",
  ).length;
  const closed = concerns.filter((item) => isConcernClosed(item.status)).length;
  return (
    <>
      <TbWorkspace
        state={state}
        engagement={engagement}
        mutate={mutate}
        notify={notify}
      />
      <section className="concerns-card">
        <div className="concerns-head">
          <span>
            <AlertTriangle />
            <span>
              <strong>Findings and concerns register</strong>
              <small>
                Review anomalies, supporting information, targeted work and
                their effect on the examiner&apos;s conclusion.
              </small>
            </span>
          </span>
          <div className="concern-summary-metrics">
            <span><b>{open}</b> Open</span>
            <span><b>{review}</b> Awaiting review</span>
            <span><b>{closed}</b> Closed</span>
          </div>
          <button className="primary" onClick={openConcerns}>
            Open register <ChevronRight />
          </button>
        </div>
      </section>
    </>
  );
}

function AnnualFileSection({
  state,
  engagement,
  mutate,
  notify,
  openConcerns,
}: {
  state: AppState;
  engagement: Engagement;
  mutate: Mutate;
  notify: Notify;
  openConcerns: () => void;
}) {
  const [busy, setBusy] = useState("");
  const upload = async (file: File | undefined, section: string) => {
    if (!file) return;
    setBusy(section);
    try {
      const f = new FormData();
      f.set("file", file);
      f.set("engagementId", String(engagement.id));
      f.set("fileSection", section);
      const r = await fetch("/api/files", { method: "POST", body: f }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await mutate("refresh");
      notify(
        section === "DRAFT_ACCOUNTS"
          ? "Draft accounts added to the annual file"
          : "Supporting schedule added to the annual file",
      );
    } finally {
      setBusy("");
    }
  };
  const cards = [
    {
      section: "DRAFT_ACCOUNTS",
      title: "Draft accounts",
      copy: "Upload each draft used for TB-to-accounts reconciliation and completion.",
      accept: ".pdf,.doc,.docx,.xls,.xlsx",
    },
    {
      section: "ANNUAL_SUPPORT",
      title: "Annual supporting schedules",
      copy: "Retain year-specific ledgers, reconciliations and supporting schedules outside individual regulatory workpapers.",
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.csv",
    },
  ];
  return (
    <>
      <ScopeSection
        state={state}
        engagement={engagement}
        mutate={mutate}
        notify={notify}
      />
      <ConcernsSection
        state={state}
        engagement={engagement}
        mutate={mutate}
        notify={notify}
        openConcerns={openConcerns}
      />
      <section className="annual-file-front">
        <div className="annual-file-title">
          <div>
            <p className="eyebrow">ANNUAL WORKING-PAPER FILE</p>
            <h2>Year ended {fmtDate(engagement.periodEnd)}</h2>
            <span>
              Core financial information retained outside the regulatory work
              programme.
            </span>
          </div>
          <b>{label(engagement.status)}</b>
        </div>
        <div className="annual-document-grid">
          {cards.map((card) => {
            const docs = state.documents.filter(
              (d) =>
                d.engagementId === engagement.id &&
                d.fileSection === card.section,
            );
            return (
              <article key={card.section}>
                <span className="annual-doc-icon">
                  <FileText />
                </span>
                <div>
                  <h3>{card.title}</h3>
                  <p>{card.copy}</p>
                  {docs.length ? (
                    <div className="annual-document-list">
                      {docs.map((d, index) => (
                        <a href={`/api/files?id=${d.id}`} key={d.id}>
                          <span>
                            <strong>
                              {index === 0 ? "Latest: " : ""}
                              {d.fileName}
                            </strong>
                            <small>
                              {fmtTime(d.createdAt)} ·{" "}
                              {Math.ceil(d.byteSize / 1024)} KB ·{" "}
                              {d.sha256.slice(0, 10)}…
                            </small>
                          </span>
                          <Download />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <small>No file uploaded for this year.</small>
                  )}
                </div>
                <label
                  className={`annual-upload ${engagement.lockedAt ? "disabled-link" : ""}`}
                >
                  <UploadCloud />
                  {busy === card.section ? "Uploading…" : "Upload"}
                  <input
                    disabled={Boolean(engagement.lockedAt)}
                    type="file"
                    accept={card.accept}
                    onChange={(e) => upload(e.target.files?.[0], card.section)}
                  />
                </label>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

function ProcedureWorkpaper({
  state,
  engagement,
  task,
  procedure,
  mutate,
  notify,
}: {
  state: AppState;
  engagement: Engagement;
  task: Task;
  procedure: Procedure;
  mutate: Mutate;
  notify: Notify;
}) {
  const [open, setOpen] = useState(false),
    [evidence, setEvidence] = useState(procedure.evidenceSummary),
    [work, setWork] = useState(procedure.workPerformed),
    [conclusion, setConclusion] = useState(procedure.conclusion),
    [applicability, setApplicability] = useState(procedure.applicability),
    [rationale, setRationale] = useState(procedure.applicabilityRationale),
    [concern, setConcern] = useState(procedure.concernIdentified),
    [concernSummary, setConcernSummary] = useState(procedure.concernSummary),
    [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setEvidence(procedure.evidenceSummary);
    setWork(procedure.workPerformed);
    setConclusion(procedure.conclusion);
    setApplicability(procedure.applicability);
    setRationale(procedure.applicabilityRationale);
    setConcern(procedure.concernIdentified);
    setConcernSummary(procedure.concernSummary);
  }, [procedure]);
  const docs = state.documents.filter((d) => d.procedureId === procedure.id),
    signoffs = state.signoffs.filter((s) => s.procedureId === procedure.id),
    locked = Boolean(engagement.lockedAt);
  const save = async (status = procedure.status) => {
    await mutate("saveProcedure", {
      procedureId: procedure.id,
      rowVersion: procedure.rowVersion,
      evidenceSummary: evidence,
      workPerformed: work,
      conclusion,
      status,
      applicability,
      applicabilityRationale: rationale,
      concernIdentified: concern || applicability === "ESCALATED",
      concernSummary,
    });
    notify(
      `Procedure ${task.direction}.${procedure.sequence} saved as ${label(status)}`,
    );
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const f = new FormData();
      f.set("file", file);
      f.set("engagementId", String(engagement.id));
      f.set("taskId", String(task.id));
      f.set("procedureId", String(procedure.id));
      const r = await fetch("/api/files", { method: "POST", body: f }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await mutate("addComment", {
        engagementId: engagement.id,
        taskId: task.id,
        body: `Evidence linked to procedure ${task.direction}.${procedure.sequence}: ${file.name}`,
      });
      notify("Procedure evidence uploaded and linked");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <article className={`procedure-workpaper ${open ? "open" : ""}`}>
      <button className="procedure-head" onClick={() => setOpen(!open)}>
        <Status s={procedure.status} />
        <span>
          <small>
            PROCEDURE TASK {task.direction}.{procedure.sequence} ·{" "}
            {label(applicability)}
          </small>
          <strong>{procedure.text}</strong>
        </span>
        <span>
          {docs.length} evidence · {label(procedure.status)}
        </span>
        <ChevronDown />
      </button>
      {open && (
        <div className="procedure-body">
          <div className="procedure-guidance">
            <BookOpenCheck />
            <p>
              <strong>Procedure guidance</strong>
              {procedure.guidance ||
                "Apply proportionate enquiry, analytical review or targeted verification under the applicable regulatory area. Record sufficient evidence to support the limited-assurance conclusion."}
            </p>
          </div>
          <div className="applicability-row">
            <label>
              Applicability
              <select
                value={applicability}
                disabled={locked}
                onChange={(e) =>
                  setApplicability(e.target.value as Procedure["applicability"])
                }
              >
                <option value="APPLICABLE">Applicable</option>
                <option value="NOT_APPLICABLE">Not applicable</option>
                <option value="ESCALATED">Escalated targeted work</option>
              </select>
            </label>
            <label className="concern-check">
              <input
                type="checkbox"
                checked={concern}
                disabled={locked}
                onChange={(e) => setConcern(e.target.checked)}
              />
              Concern identified
            </label>
          </div>
          {applicability === "NOT_APPLICABLE" && (
            <label className="procedure-rationale">
              Required rationale for not applying this procedure
              <textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Explain why the procedure does not apply to this charity and period."
              />
            </label>
          )}
          {(concern || applicability === "ESCALATED") && (
            <label className="procedure-rationale escalated">
              Concern and escalation rationale
              <textarea
                value={concernSummary}
                onChange={(e) => setConcernSummary(e.target.value)}
                placeholder="Describe the anomaly, its potential significance and the targeted work required."
              />
            </label>
          )}
          {applicability !== "NOT_APPLICABLE" && (
            <div className="procedure-fields">
              <label>
                Evidence obtained and cross-reference
                <textarea
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  placeholder="Identify documents, schedules, enquiries, analytical outputs and relevant cross-references."
                />
              </label>
              <label>
                Work performed
                <textarea
                  value={work}
                  onChange={(e) => setWork(e.target.value)}
                  placeholder="Record enquiry, analytical review or targeted verification, including exceptions followed up."
                />
              </label>
              <label>
                Procedure conclusion
                <textarea
                  value={conclusion}
                  onChange={(e) => setConclusion(e.target.value)}
                  placeholder="Record the limited-assurance conclusion and any matter requiring escalation."
                />
              </label>
            </div>
          )}
          <div className="procedure-evidence">
            <div className="section-title">
              <h4>Linked evidence</h4>
              <label
                className={`procedure-upload ${locked ? "disabled-link" : ""}`}
              >
                <UploadCloud />
                {busy ? "Uploading…" : "Upload evidence"}
                <input
                  disabled={locked}
                  ref={ref}
                  type="file"
                  accept=".pdf,.docx,.xlsx,.csv,.jpg,.jpeg,.png"
                  onChange={(e) => upload(e.target.files?.[0])}
                />
              </label>
            </div>
            {docs.length ? (
              <div className="evidence-grid">
                {docs.map((d) => (
                  <a href={`/api/files?id=${d.id}`} key={d.id}>
                    <Paperclip />
                    <span>
                      <strong>{d.fileName}</strong>
                      <small>
                        {Math.ceil(d.byteSize / 1024)} KB · SHA-256{" "}
                        {d.sha256.slice(0, 10)}…
                      </small>
                    </span>
                    <Download />
                  </a>
                ))}
              </div>
            ) : (
              <p>
                {applicability === "NOT_APPLICABLE"
                  ? "No evidence is required, but the applicability rationale is mandatory."
                  : "No uploaded evidence is linked. Record a complete cross-reference before sign-off."}
              </p>
            )}
          </div>
          <div className="procedure-signoff">
            <div>
              <strong>Preparer sign-off</strong>
              <span>
                {procedure.preparedBy
                  ? `${procedure.preparedBy} · ${fmtTime(procedure.preparedAt!)}`
                  : "Outstanding"}
              </span>
            </div>
            <div>
              <strong>Reviewer sign-off</strong>
              <span>
                {procedure.reviewedBy
                  ? `${procedure.reviewedBy} · ${fmtTime(procedure.reviewedAt!)}`
                  : "Outstanding"}
              </span>
            </div>
            <div>
              <small>{signoffs.length} immutable sign-off record(s)</small>
              <button
                disabled={locked}
                className="secondary"
                onClick={() => save("IN_PROGRESS")}
              >
                <FileText />
                Save draft
              </button>
              <button
                disabled={locked}
                className="secondary"
                onClick={() => save("PREPARED")}
              >
                <Check />
                Prepare
              </button>
              <button
                disabled={locked}
                className="primary"
                onClick={() => save("REVIEWED")}
              >
                <ShieldCheck />
                Review
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function ActivityPanel({
  state,
  engagement,
  task,
  mutate,
  notify,
}: {
  state: AppState;
  engagement: Engagement;
  task: Task;
  mutate: Mutate;
  notify: Notify;
}) {
  const [tab, setTab] = useState<"comments" | "evidence" | "versions">(
      "comments",
    ),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null),
    comments = state.comments.filter((c) => c.taskId === task.id),
    docs = state.documents.filter((d) => d.taskId === task.id),
    versions = state.versions.filter((v) => v.taskId === task.id);
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const f = new FormData();
      f.set("file", file);
      f.set("engagementId", String(engagement.id));
      f.set("taskId", String(task.id));
      const r = await fetch("/api/files", { method: "POST", body: f }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await mutate("addComment", {
        engagementId: engagement.id,
        taskId: task.id,
        body: `Direction-level evidence uploaded: ${file.name}`,
      });
      notify("Direction evidence uploaded and linked");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <aside className="activity">
      <div className="activity-tabs">
        <button
          className={tab === "comments" ? "active" : ""}
          onClick={() => setTab("comments")}
        >
          Comments <b>{comments.length}</b>
        </button>
        <button
          className={tab === "evidence" ? "active" : ""}
          onClick={() => setTab("evidence")}
        >
          Evidence <b>{docs.length}</b>
        </button>
        <button
          className={tab === "versions" ? "active" : ""}
          onClick={() => setTab("versions")}
        >
          History <b>{versions.length}</b>
        </button>
      </div>
      {tab === "comments" && (
        <>
          <div className="thread">
            {comments.map((c) => (
              <div className="thread-item" key={c.id}>
                <span className="avatar reviewer">
                  {initials(c.authorName)}
                </span>
                <div>
                  <p>
                    <strong>{c.authorName}</strong>
                    <small>{fmtTime(c.createdAt)}</small>
                  </p>
                  <p>{c.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="comment-box">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a controlled comment…"
            />
            <div>
              <span />
              <button
                className="send-comment"
                disabled={!text.trim()}
                onClick={async () => {
                  await mutate("addComment", {
                    engagementId: engagement.id,
                    taskId: task.id,
                    body: text,
                  });
                  setText("");
                  notify("Comment added");
                }}
              >
                <Send />
              </button>
            </div>
          </div>
        </>
      )}
      {tab === "evidence" && (
        <div className="side-list">
          <label className="side-upload">
            <UploadCloud />
            {busy ? "Uploading…" : "Upload direction evidence"}
            <input
              ref={ref}
              type="file"
              accept=".pdf,.docx,.xlsx,.csv,.jpg,.jpeg,.png"
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
          {docs.map((d) => (
            <a href={`/api/files?id=${d.id}`} key={d.id}>
              <Paperclip />
              <span>
                <strong>{d.fileName}</strong>
                <small>
                  {d.procedureId
                    ? `Procedure ${state.procedures.find((p) => p.id === d.procedureId)?.sequence} · `
                    : "Direction level · "}
                  {Math.ceil(d.byteSize / 1024)} KB · {d.sha256.slice(0, 10)}…
                </small>
              </span>
              <Download />
            </a>
          ))}
        </div>
      )}
      {tab === "versions" && (
        <div className="side-list">
          {versions.map((v) => (
            <div key={v.id}>
              <FileText />
              <span>
                <strong>
                  Version {v.version} · {label(v.status)}
                </strong>
                <small>
                  {fmtTime(v.createdAt)} · {v.contentHash.slice(0, 10)}…
                </small>
              </span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function Requests({
  state,
  engagementId,
  select,
  create,
  detail,
}: {
  state: AppState;
  engagementId: PublicId;
  select: (id: PublicId) => void;
  create: () => void;
  detail: (r: EvidenceRequest) => void;
}) {
  const [filter, setFilter] = useState("ALL");
  const rows = state.requests.filter(
    (r) =>
      r.engagementId === engagementId &&
      (filter === "ALL" || r.status === filter),
  );
  return (
    <Page
      eye="CLIENT COLLABORATION"
      title="Evidence requests"
      desc="Request, receive and retain client evidence within the engagement record."
      action={
        <button className="primary" onClick={create}>
          <Plus />
          New request
        </button>
      }
    >
      <EngSelect state={state} value={engagementId} change={select} />
      <div className="panel data-panel">
        <div className="filters">
          {["ALL", "AWAITING_CLIENT", "RECEIVED", "OVERDUE"].map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {label(f)}{" "}
              <b>
                {
                  state.requests.filter(
                    (r) =>
                      r.engagementId === engagementId &&
                      (f === "ALL" || r.status === f),
                  ).length
                }
              </b>
            </button>
          ))}
        </div>
        <div className="request-table">
          <div className="request-head">
            <span>REQUEST</span>
            <span>CONTACT</span>
            <span>DUE DATE</span>
            <span>STATUS</span>
            <span />
          </div>
          {rows.map((r) => (
            <button
              className="request-row request-button"
              key={r.id}
              onClick={() => detail(r)}
            >
              <span>
                <i>
                  <FileText />
                </i>
                <span>
                  <strong>{r.title}</strong>
                  <small>{r.reference}</small>
                </span>
              </span>
              <span>{r.contactName}</span>
              <span>{fmtDate(r.dueDate)}</span>
              <span>
                <b
                  className={`request-status ${r.status.toLowerCase().replace("_", "-")}`}
                >
                  {label(r.status)}
                </b>
              </span>
              <ChevronRight />
            </button>
          ))}
        </div>
      </div>
    </Page>
  );
}
function Findings({
  state,
  engagement,
  select,
  mutate,
  notify,
}: {
  state: AppState;
  engagement: Engagement;
  select: (id: PublicId) => void;
  mutate: Mutate;
  notify: Notify;
}) {
  const rows = state.concerns
    .filter((item) => item.engagementId === engagement.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const [selectedId, setSelectedId] = useState<PublicId | null>(rows[0]?.id ?? null),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("ALL"),
    [severity, setSeverity] = useState("ALL"),
    [category, setCategory] = useState("ALL"),
    [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!rows.some((item) => item.id === selectedId))
      setSelectedId(rows[0]?.id ?? null);
  }, [engagement.id, rows, selectedId]);
  const filtered = rows.filter(
    (item) =>
      (!search ||
        `${item.reference} ${item.title} ${item.description} ${item.owner ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (status === "ALL" || item.status === status) &&
      (severity === "ALL" || item.severity === severity) &&
      (category === "ALL" || item.category === category),
  );
  const selected = rows.find((item) => item.id === selectedId) ?? null;
  return (
    <Page
      eye="CONTROLLED FINDINGS"
      title="Findings & concerns"
      desc="Assess anomalies, add supporting information, complete targeted work and control their effect on the independent examiner's conclusion."
      action={
        <button
          className="primary"
          disabled={Boolean(engagement.lockedAt)}
          onClick={() => setCreating(true)}
        >
          <Plus /> New concern
        </button>
      }
    >
      <EngSelect state={state} value={engagement.id} change={select} />
      <section className="finding-metrics" aria-label="Concern status summary">
        <article><span>Open workload</span><strong>{rows.filter((item) => !isConcernClosed(item.status)).length}</strong><small>Requires assessment or review</small></article>
        <article><span>Ready for review</span><strong>{rows.filter((item) => item.status === "READY_FOR_REVIEW").length}</strong><small>Submitted conclusions</small></article>
        <article><span>Report effect</span><strong>{rows.filter((item) => isConcernClosed(item.status) && !["NO_REPORTING_EFFECT", "UNDETERMINED"].includes(item.reportingAssessment)).length}</strong><small>Closed matters affecting wording</small></article>
        <article><span>Closed</span><strong>{rows.filter((item) => isConcernClosed(item.status)).length}</strong><small>Retained with review history</small></article>
      </section>
      <div className="finding-filters">
        <label><Search /><input aria-label="Search concerns" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, title, owner or description" /></label>
        <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option>{["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CLOSED", "REOPENED", "RESOLVED"].map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label="Filter by severity" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="ALL">All severities</option>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">All categories</option>{["GENERAL", "ACCOUNTING_RECORDS", "ACCOUNTS_COMPLIANCE", "OTHER_MATTER", "MATERIAL_SIGNIFICANCE"].map((item) => <option key={item}>{label(item)}</option>)}</select>
      </div>
      {creating && (
        <form
          className="finding-create"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            void handleUiAction(async () => {
              const next = await mutate("createConcern", {
                ...Object.fromEntries(new FormData(form).entries()),
                engagementId: engagement.id,
              });
              const created = next.concerns
                .filter((item) => item.engagementId === engagement.id)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
              setSelectedId(created?.id ?? null);
              setCreating(false);
              notify("Concern created in the controlled register");
            });
          }}
        >
          <header><div><p className="eyebrow">NEW CONTROLLED FINDING</p><h2>Create concern</h2></div><button type="button" onClick={() => setCreating(false)} aria-label="Close new concern form"><X /></button></header>
          <div><label>Title<input name="title" required maxLength={160} /></label><label>Severity<select name="severity" defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label><label>Category<select name="category" defaultValue="GENERAL"><option value="GENERAL">General</option><option value="ACCOUNTING_RECORDS">Accounting records</option><option value="ACCOUNTS_COMPLIANCE">Accounts compliance</option><option value="OTHER_MATTER">Other matter</option><option value="MATERIAL_SIGNIFICANCE">Material significance</option></select></label><label>Owner<input name="owner" defaultValue={state.actor.name} required /></label></div>
          <label>Description<textarea name="description" required placeholder="Describe the anomaly, why it may be significant and the initial follow-up required." /></label>
          <footer><button type="button" className="secondary" onClick={() => setCreating(false)}>Cancel</button><button className="primary"><Plus /> Create concern</button></footer>
        </form>
      )}
      <div className="finding-layout">
        <aside className="finding-register" aria-label="Concerns register">
          <div className="finding-register-head"><strong>{filtered.length} concern{filtered.length === 1 ? "" : "s"}</strong><span>Selected annual file</span></div>
          {filtered.map((item) => (
            <button key={item.id} className={selectedId === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}>
              <span className={`finding-severity ${item.severity.toLowerCase()}`} />
              <span><small>{item.reference} · {label(item.sourceType)}</small><strong>{item.title}</strong><em>{item.owner || "Unassigned"} · {fmtTime(item.updatedAt)}</em></span>
              <span><b className={`finding-status ${item.status.toLowerCase()}`}>{label(item.status)}</b><small>{label(item.reportingAssessment)}</small></span>
            </button>
          ))}
          {!filtered.length && <div className="finding-empty"><AlertTriangle /><strong>No concerns match these filters</strong><p>Change the filters or create a concern for the selected annual file.</p></div>}
        </aside>
        <main className="finding-detail">
          {selected ? (
            <ConcernDetail key={selected.id} state={state} concern={selected} engagement={engagement} mutate={mutate} notify={notify} />
          ) : (
            <div className="finding-empty large"><AlertTriangle /><strong>No concern selected</strong><p>Select a concern from the register or create the first concern for this annual file.</p></div>
          )}
        </main>
      </div>
    </Page>
  );
}

function ConcernDetail({
  state,
  concern,
  engagement,
  mutate,
  notify,
}: {
  state: AppState;
  concern: AppState["concerns"][number];
  engagement: Engagement;
  mutate: Mutate;
  notify: Notify;
}) {
  const [title, setTitle] = useState(concern.title),
    [description, setDescription] = useState(concern.description),
    [category, setCategory] = useState(concern.category),
    [severity, setSeverity] = useState(concern.severity),
    [owner, setOwner] = useState(concern.owner ?? ""),
    [targetedResponse, setTargetedResponse] = useState(concern.targetedResponse),
    [managementResponse, setManagementResponse] = useState(concern.managementResponse),
    [examinerConclusion, setExaminerConclusion] = useState(concern.examinerConclusion),
    [reportingAssessment, setReportingAssessment] = useState(concern.reportingAssessment),
    [eventType, setEventType] = useState("INFORMATION"),
    [eventBody, setEventBody] = useState(""),
    [reviewConclusion, setReviewConclusion] = useState(""),
    [reopenReason, setReopenReason] = useState(""),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState("");
  const editable = ["OPEN", "IN_PROGRESS", "REOPENED"].includes(concern.status) && !engagement.lockedAt,
    events = state.concernEvents.filter((item) => item.concernId === concern.id),
    docs = state.documents.filter((item) => item.concernId === concern.id);
  const values = { concernId: concern.id, title, description, category, severity, owner, targetedResponse, managementResponse, examinerConclusion, reportingAssessment };
  const save = async () => {
    setBusy(true); setFeedback("");
    try { await mutate("updateConcern", values); setFeedback("Assessment saved to the annual file"); notify("Concern assessment saved"); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to save assessment"); }
    finally { setBusy(false); }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true); setFeedback("");
    try {
      const form = new FormData(); form.set("file", file); form.set("engagementId", String(engagement.id)); form.set("concernId", String(concern.id)); form.set("fileSection", "CONCERN_EVIDENCE");
      const response = await fetch("/api/files", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await mutate("refresh"); setFeedback("Evidence uploaded and linked"); notify("Concern evidence uploaded");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to upload evidence"); }
    finally { setBusy(false); }
  };
  return (
    <article className="concern-workspace">
      <header className="concern-titlebar"><div><span>{concern.reference}</span><h2>{concern.title}</h2><p>{label(concern.sourceType)} · Created by {concern.createdBy} · {fmtTime(concern.createdAt)}</p></div><b className={`finding-status ${concern.status.toLowerCase()}`}>{label(concern.status)}</b></header>
      <section className="concern-section"><div className="concern-section-title"><div><p className="eyebrow">ASSESSMENT</p><h3>Nature and significance</h3></div>{editable && <button className="secondary" disabled={busy} onClick={save}><Save /> Save assessment</button>}</div>
        <div className="concern-form-grid"><label className="wide">Title<input value={title} disabled={!editable} onChange={(event) => setTitle(event.target.value)} /></label><label>Severity<select value={severity} disabled={!editable} onChange={(event) => setSeverity(event.target.value)}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label><label>Category<select value={category} disabled={!editable} onChange={(event) => setCategory(event.target.value)}><option value="GENERAL">General</option><option value="ACCOUNTING_RECORDS">Accounting records</option><option value="ACCOUNTS_COMPLIANCE">Accounts compliance</option><option value="OTHER_MATTER">Other matter</option><option value="MATERIAL_SIGNIFICANCE">Material significance</option></select></label><label>Owner<input value={owner} disabled={!editable} onChange={(event) => setOwner(event.target.value)} /></label></div>
        <label className="concern-field">Description<textarea value={description} disabled={!editable} onChange={(event) => setDescription(event.target.value)} /></label>
      </section>
      <section className="concern-section"><div className="concern-section-title"><div><p className="eyebrow">PROPORTIONATE RESPONSE</p><h3>Work, response and conclusion</h3></div></div><div className="concern-response-grid"><label>Targeted work performed<textarea value={targetedResponse} disabled={!editable} onChange={(event) => setTargetedResponse(event.target.value)} placeholder="Record enquiry, analytical review and targeted verification performed." /></label><label>Management or trustee response<textarea value={managementResponse} disabled={!editable} onChange={(event) => setManagementResponse(event.target.value)} placeholder="Record the explanation and how it was corroborated." /></label><label>Examiner conclusion<textarea value={examinerConclusion} disabled={!editable} onChange={(event) => setExaminerConclusion(event.target.value)} placeholder="Conclude whether the matter is resolved and its effect on limited assurance." /></label></div><label className="concern-field">Reporting assessment<select value={reportingAssessment} disabled={!editable} onChange={(event) => setReportingAssessment(event.target.value)}><option value="UNDETERMINED">Not yet determined</option><option value="NO_REPORTING_EFFECT">No report effect</option><option value="RECORDS_CONCERN">Accounting-records concern</option><option value="ACCOUNTS_CONCERN">Accounts-compliance concern</option><option value="OTHER_MATTER">Other matter for reader attention</option><option value="MATERIAL_SIGNIFICANCE">Matter of material significance</option></select></label></section>
      <section className="concern-section"><div className="concern-section-title"><div><p className="eyebrow">SUPPORTING RECORD</p><h3>Information, evidence and activity</h3></div><label className={`secondary concern-upload ${editable ? "" : "disabled-link"}`}><UploadCloud /> Upload evidence<input type="file" disabled={!editable || busy} accept=".pdf,.docx,.xlsx,.csv,.jpg,.jpeg,.png" onChange={(event) => upload(event.target.files?.[0])} /></label></div>
        <div className="concern-evidence">{docs.map((doc) => <a href={`/api/files?id=${doc.id}`} key={doc.id}><Paperclip /><span><strong>{doc.fileName}</strong><small>{Math.ceil(doc.byteSize / 1024)} KB · SHA-256 {doc.sha256.slice(0, 10)}…</small></span><Download /></a>)}{!docs.length && <p>No evidence has been uploaded directly to this concern.</p>}</div>
        {editable && <form className="concern-update" onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { await mutate("addConcernEvent", { concernId: concern.id, eventType, body: eventBody }); setEventBody(""); setFeedback("Update added to the activity record"); notify("Concern activity updated"); } catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to add update"); } finally { setBusy(false); } }}><select aria-label="Concern update type" value={eventType} onChange={(event) => setEventType(event.target.value)}><option value="INFORMATION">Information</option><option value="MANAGEMENT_RESPONSE">Management response</option><option value="EXAMINER_ASSESSMENT">Examiner assessment</option><option value="REVIEW_NOTE">Review note</option></select><textarea aria-label="Concern update" required value={eventBody} onChange={(event) => setEventBody(event.target.value)} placeholder="Add information without overwriting the assessment history." /><button className="secondary" disabled={busy}><MessageSquare /> Add update</button></form>}
        <ol className="concern-timeline">{events.map((event) => <li key={event.id}><span /><div><p><strong>{label(event.eventType)}</strong><small>{event.actorName} · {fmtTime(event.createdAt)}</small></p><p>{event.body}</p></div></li>)}</ol>
      </section>
      <section className="concern-decision">
        {editable && <div><div><p className="eyebrow">PREPARER DECISION</p><h3>Submit complete assessment for review</h3><p>Current form values will be saved before the concern is submitted and made read-only.</p></div><button className="primary" disabled={busy} onClick={async () => { setBusy(true); try { await mutate("updateConcern", values); await mutate("submitConcernForReview", { concernId: concern.id }); setFeedback("Concern submitted for review"); notify("Concern ready for review"); } catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to submit concern"); } finally { setBusy(false); } }}><ShieldCheck /> Save &amp; submit for review</button></div>}
        {concern.status === "READY_FOR_REVIEW" && <div className="concern-review"><div><p className="eyebrow">REVIEW DECISION</p><h3>Review the evidence and submitted conclusion</h3></div><textarea aria-label="Concern review conclusion" value={reviewConclusion} onChange={(event) => setReviewConclusion(event.target.value)} placeholder="Record why the assessment is accepted or what further work is required." /><span><button className="secondary" disabled={busy || !reviewConclusion.trim()} onClick={() => void handleUiAction(async () => { setBusy(true); try { await mutate("reviewConcern", { concernId: concern.id, decision: "FURTHER_WORK_REQUIRED", reviewConclusion }); notify("Concern returned for further work"); } finally { setBusy(false); } })}>Require further work</button><button className="primary" disabled={busy || !reviewConclusion.trim()} onClick={() => void handleUiAction(async () => { setBusy(true); try { await mutate("reviewConcern", { concernId: concern.id, decision: "CLOSE", reviewConclusion }); notify("Concern reviewed and closed"); } finally { setBusy(false); } })}><Check /> Accept &amp; close</button></span></div>}
        {isConcernClosed(concern.status) && <div className="concern-closed"><div><p className="eyebrow">CLOSED CONTROL RECORD</p><h3>Reviewed by {concern.reviewedBy || concern.resolvedBy}</h3><p>{concern.reviewConclusion || concern.resolution}</p><small>{concern.reviewedAt ? fmtTime(concern.reviewedAt) : concern.resolvedAt ? fmtTime(concern.resolvedAt) : "Legacy closure"}{concern.closureHash ? ` · Snapshot ${concern.closureHash.slice(0, 12)}…` : ""}</small></div>{!engagement.lockedAt && <div><input aria-label="Reason for reopening concern" value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="Reason for reopening" /><button className="secondary" disabled={busy || !reopenReason.trim()} onClick={() => void handleUiAction(async () => { setBusy(true); try { await mutate("reopenConcern", { concernId: concern.id, reason: reopenReason }); notify("Concern reopened with retained history"); } finally { setBusy(false); } })}><RotateCcw /> Reopen</button></div>}</div>}
      </section>
      {feedback && <p className="inline-success"><CheckCircle2 /> {feedback}</p>}
    </article>
  );
}

function Review({
  state,
  engagementId,
  select,
  create,
  clear,
  mutate,
  notify,
}: {
  state: AppState;
  engagementId: PublicId;
  select: (id: PublicId) => void;
  create: () => void;
  clear: (n: ReviewNote) => void;
  mutate: Mutate;
  notify: Notify;
}) {
  const notes = state.notes.filter((n) => n.engagementId === engagementId),
    open = notes.filter((n) => n.status !== "CLEARED");
  return (
    <Page
      eye="QUALITY CONTROL"
      title="Review centre"
      desc="Raise, respond to and clear formal review points."
      action={
        <button className="primary" onClick={create}>
          <Plus />
          Raise review note
        </button>
      }
    >
      <EngSelect state={state} value={engagementId} change={select} />
      <div className="review-layout">
        <div className="panel">
          {notes.map((n) => (
            <div
              className={`review-note ${n.status === "CLEARED" ? "note-cleared" : ""}`}
              key={n.id}
            >
              <span
                className={`priority p${n.severity === "HIGH" ? 0 : n.severity === "MEDIUM" ? 1 : 2}`}
              >
                {label(n.severity)}
              </span>
              <div>
                <p>
                  <small>{n.reference}</small>
                  <strong>{n.title}</strong>
                </p>
                <p>{n.body}</p>
                {n.response && (
                  <p className="review-response">
                    <strong>Response:</strong> {n.response}
                  </p>
                )}
                <div>
                  <span className="avatar reviewer">
                    {initials(n.raisedBy)}
                  </span>
                  <small>
                    {n.raisedBy} · {fmtTime(n.createdAt)}
                  </small>
                </div>
              </div>
              {n.status === "CLEARED" ? (
                <button
                  onClick={async () => {
                    await mutate("reopenNote", { noteId: n.id });
                    notify("Review note reopened");
                  }}
                >
                  Reopen
                </button>
              ) : (
                <button onClick={() => clear(n)}>
                  <Check />
                  Respond &amp; clear
                </button>
              )}
            </div>
          ))}
        </div>
        <aside className="panel review-summary">
          <h2>Review control</h2>
          <div className="donut">
            <span>
              {Math.round(
                ((notes.length - open.length) / Math.max(1, notes.length)) *
                  100,
              )}
              <small>%</small>
            </span>
          </div>
          <p>
            {notes.length - open.length} of {notes.length} notes cleared
          </p>
        </aside>
      </div>
    </Page>
  );
}

function Reporting({
  state,
  engagement,
  mutate,
  notify,
}: {
  state: AppState;
  engagement: Engagement;
  mutate: Mutate;
  notify: Notify;
}) {
  const tasks = state.tasks.filter((t) => t.engagementId === engagement.id),
    taskIds = new Set(tasks.map((t) => t.id)),
    procedures = state.procedures.filter((p) => taskIds.has(p.taskId)),
    notes = state.notes.filter((n) => n.engagementId === engagement.id),
    concerns = state.concerns.filter((c) => c.engagementId === engagement.id),
    tbVersions = state.tbImports
      .filter((x) => x.engagementId === engagement.id)
      .sort((a, b) => b.version - a.version),
    tbReady =
      engagement.accountingBasis !== "Accruals" ||
      tbVersions[0]?.status === "REVIEWED",
    eligibility = configuredEligibility(state, engagement, engagement),
    eligible = eligibility.scrutiny === "INDEPENDENT_EXAMINATION",
    directionsReady = tasks
      .filter((task) => !task.isCustom)
      .every((task) => task.status === "REVIEWED"),
    proceduresReady = procedures.every(
      (p) =>
        p.status === "REVIEWED" &&
        (p.applicability !== "NOT_APPLICABLE" ||
          Boolean(p.applicabilityRationale)),
    ),
    notesReady = notes.every((n) => n.status === "CLEARED"),
    concernsReady = concerns.every((c) => isConcernClosed(c.status)),
    qualityReady =
      engagement.qualityReviewMode === "NONE" ||
      engagement.qualityReviewStatus === "COMPLETED",
    compatibility = conclusionCompatibility(
      engagement.reportConclusion,
      concerns,
    ),
    conclusionReady = compatibility.compatible,
    ready =
      eligible &&
      directionsReady &&
      proceduresReady &&
      tbReady &&
      notesReady &&
      concernsReady &&
      qualityReady &&
      conclusionReady &&
      engagement.trusteeApproved &&
      engagement.materialSignificanceAssessed &&
      !engagement.lockedAt;
  const [qualityConclusion, setQualityConclusion] = useState(
      engagement.qualityReviewConclusion,
    ),
    [reopenReason, setReopenReason] = useState("");
  useEffect(
    () => setQualityConclusion(engagement.qualityReviewConclusion),
    [engagement.qualityReviewConclusion],
  );
  return (
    <Page
      eye="COMPLETION AND REPORTING"
      title="Examiner’s report"
      desc="Conclude a limited-assurance independent examination and preserve the completed annual file."
      action={
        <a
          className={`primary ${ready ? "" : "disabled-link"}`}
          href={ready ? `/api/report?engagementId=${engagement.id}` : undefined}
        >
          <Download />
          Generate examiner&apos;s report
        </a>
      }
    >
      <div className="report-layout">
        <section className="panel report-preview">
          <div className="report-bar">
            <span>
              <FileText />
              Controlled limited-assurance report
            </span>
            <span>
              {engagement.lockedAt
                ? "Annual file locked"
                : ready
                  ? "Ready to generate"
                  : "Completion controls outstanding"}
            </span>
          </div>
          <article>
            <p className="report-kicker">
              INDEPENDENT EXAMINER&apos;S REPORT TO THE TRUSTEES OF
            </p>
            <h2>{engagement.clientName}</h2>
            <p>
              I report on my examination of the accounts for the year ended{" "}
              {fmtDate(engagement.periodEnd)}. The engagement provides limited
              assurance through enquiry, analytical review and targeted
              verification.
            </p>
            <h3>Independent examiner&apos;s statement</h3>
            <p className={conclusionReady ? "" : "placeholder-copy"}>
              {conclusionReady
                ? reportSummary(engagement.reportConclusion!)
                : "Select the statutory report conclusion before generation."}
            </p>
          </article>
          <div className="quality-control">
            <h3>Proportionate quality management</h3>
            <p>
              A separate reviewer is optional unless the engagement risk
              assessment or practice policy requires one.
            </p>
            <label>
              Review response
              <select
                disabled={Boolean(engagement.lockedAt)}
                value={engagement.qualityReviewMode}
                onChange={async (e) => {
                  await mutate("updateQualityReview", {
                    engagementId: engagement.id,
                    mode: e.target.value,
                    status:
                      e.target.value === "NONE" ? "NOT_REQUIRED" : "PLANNED",
                  });
                  notify("Quality review response saved");
                }}
              >
                <option value="NONE">No separate quality review</option>
                <option value="SECOND_REVIEW">Second review</option>
                <option value="HOT_FILE">Hot-file review</option>
                <option value="COLD_FILE">Cold-file review</option>
              </select>
            </label>
            {engagement.qualityReviewMode !== "NONE" && (
              <>
                <label>
                  Review conclusion
                  <textarea
                    value={qualityConclusion}
                    onChange={(e) => setQualityConclusion(e.target.value)}
                    placeholder="Record the reviewer’s conclusion and any action taken."
                  />
                </label>
                <button
                  className="secondary"
                  disabled={Boolean(engagement.lockedAt)}
                  onClick={async () => {
                    await mutate("updateQualityReview", {
                      engagementId: engagement.id,
                      mode: engagement.qualityReviewMode,
                      status: "COMPLETED",
                      conclusion: qualityConclusion,
                    });
                    notify("Quality review completed");
                  }}
                >
                  <ShieldCheck />
                  Complete quality review
                </button>
              </>
            )}
          </div>
          <div className="lock-control">
            {!engagement.lockedAt ? (
              <>
                <p>
                  <LockKeyhole />
                  <span>
                    <strong>Completion lockdown</strong>Lock the annual file
                    after the report has been generated. The snapshot and all
                    later reopening events are retained.
                  </span>
                </p>
                <button
                  className="primary"
                  onClick={async () => {
                    await mutate("lockEngagement", {
                      engagementId: engagement.id,
                      rowVersion: engagement.rowVersion,
                    });
                    notify("Annual file locked");
                  }}
                >
                  <LockKeyhole />
                  Lock annual file
                </button>
              </>
            ) : (
              <>
                <p>
                  <CheckCircle2 />
                  <span>
                    <strong>Locked by {engagement.lockedBy}</strong>
                    {fmtTime(engagement.lockedAt)} · edits and uploads are
                    disabled
                  </span>
                </p>
                <label>
                  Controlled reopening reason
                  <textarea
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="Explain why the completed file must be reopened."
                  />
                </label>
                <button
                  className="secondary"
                  onClick={async () => {
                    await mutate("reopenEngagement", {
                      engagementId: engagement.id,
                      rowVersion: engagement.rowVersion,
                      reason: reopenReason,
                    });
                    setReopenReason("");
                    notify("Annual file reopened with reason retained");
                  }}
                >
                  Reopen file
                </button>
              </>
            )}
          </div>
        </section>
        <aside className="panel gates">
          <h2>Completion gates</h2>
          <Gate
            pass={eligible}
            title="Independent examination route"
            note={eligibility.reason}
          />
          <Gate
            pass={directionsReady && proceduresReady}
            title="Regulatory areas and procedures"
            note={`${procedures.filter((p) => p.status === "REVIEWED").length}/${procedures.length} procedures reviewed`}
          />
          <Gate
            pass={concernsReady}
            title="Targeted concerns"
            note={`${concerns.filter((c) => !isConcernClosed(c.status)).length} unresolved`}
          />
          <Gate
            pass={notesReady}
            title="Review notes"
            note={`${notes.filter((n) => n.status !== "CLEARED").length} unresolved`}
          />
          <Gate
            pass={qualityReady}
            title="Quality response"
            note={label(engagement.qualityReviewStatus)}
          />
          <label className="report-conclusion">
            Report conclusion
            <select
              disabled={Boolean(engagement.lockedAt)}
              value={engagement.reportConclusion ?? ""}
              onChange={async (e) => {
                await mutate("setReportConclusion", {
                  engagementId: engagement.id,
                  conclusion: e.target.value,
                });
                notify("Report conclusion saved");
              }}
            >
              <option value="" disabled>
                Select conclusion
              </option>
              <option value="UNMODIFIED">Nothing has come to attention</option>
              <option value="RECORDS_CONCERN">Accounting records matter</option>
              <option value="ACCOUNTS_CONCERN">
                Accounts compliance matter
              </option>
              <option value="OTHER_MATTER">Other matter to report</option>
            </select>
          </label>
          <p className={`conclusion-compatibility ${compatibility.compatible ? "pass" : "fail"}`}>
            {compatibility.compatible ? <CheckCircle2 /> : <AlertTriangle />}
            {compatibility.reason}
          </p>
          <Gate
            pass={engagement.materialSignificanceAssessed}
            title="Material significance"
            note="Statutory exception assessment"
            action={
              engagement.lockedAt
                ? undefined
                : () =>
                    mutate("updateGate", {
                      engagementId: engagement.id,
                      field: "materialSignificanceAssessed",
                      value: !engagement.materialSignificanceAssessed,
                    }).then(() => notify("Gate updated"))
            }
          />
          <Gate
            pass={engagement.trusteeApproved}
            title="Trustee approval"
            note="Accounts and annual report"
            action={
              engagement.lockedAt
                ? undefined
                : () =>
                    mutate("updateGate", {
                      engagementId: engagement.id,
                      field: "trusteeApproved",
                      value: !engagement.trusteeApproved,
                    }).then(() => notify("Gate updated"))
            }
          />
        </aside>
      </div>
    </Page>
  );
}

function Clients({
  state,
  selectedId,
  section,
  selectClient,
  selectSection,
  create,
  edit,
  addTrustee,
  editTrustee,
  addUser,
  mutate,
  notify,
  openAnnual,
}: {
  state: AppState;
  selectedId: PublicId;
  section: ClientSection;
  selectClient: (id: PublicId) => void;
  selectSection: (section: ClientSection) => void;
  create: () => void;
  edit: (c: Client) => void;
  addTrustee: (c: Client) => void;
  editTrustee: (t: Trustee) => void;
  addUser: (c: Client) => void;
  mutate: Mutate;
  notify: Notify;
  openAnnual: (id: PublicId) => void;
}) {
  const client =
    state.clients.find((c) => c.id === selectedId) ?? state.clients[0];
  const annualFiles = client
    ? state.engagements
        .filter((e) => e.clientId === client.id)
        .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
    : [];
  const permanentCount = client
    ? state.permanentDocuments.filter((d) => d.clientId === client.id).length
    : 0;
  const trustees = client
    ? state.trustees
        .filter((t) => t.clientId === client.id)
        .sort(
          (a, b) =>
            (a.status === "ACTIVE" ? 0 : 1) - (b.status === "ACTIVE" ? 0 : 1) ||
            a.name.localeCompare(b.name),
        )
    : [];
  const currentTrusteeCount = trustees.filter(
      (t) =>
        t.status === "ACTIVE" &&
        (t.personType === "TRUSTEE" || t.personType === "BOTH"),
    ).length,
    currentOfficerCount = trustees.filter(
      (t) =>
        t.status === "ACTIVE" &&
        (t.personType === "OFFICER" || t.personType === "BOTH"),
    ).length,
    historicalGovernanceCount = trustees.filter(
      (t) => t.status !== "ACTIVE",
    ).length;
  const portalUsers = client
    ? state.clientUsers.filter((u) => u.clientId === client.id)
    : [];
  return (
    <Page
      eye="PRACTICE MANAGEMENT"
      title="Clients"
      desc="Permanent client records and distinct annual working-paper files."
      action={
        <button className="primary" onClick={create}>
          <Plus />
          New client
        </button>
      }
    >
      <div className="client-master-detail">
        <div className="client-list panel">
          {state.clients.map((c) => (
            <button
              className={c.id === client?.id ? "active" : ""}
              key={c.id}
              onClick={() => selectClient(c.id)}
            >
              <span className="charity-logo willow">{c.name[0]}</span>
              <span>
                <strong>{c.name}</strong>
                <small>
                  {c.charityNumber} · {c.legalForm}
                </small>
              </span>
              <ChevronRight />
            </button>
          ))}
        </div>
        {client && (
          <section className="client-profile">
            <div className="panel profile-summary">
              <div>
                <span className="charity-logo willow big">
                  {client.name[0]}
                </span>
                <div>
                  <h2>{client.name}</h2>
                  <p>
                    Charity no. {client.charityNumber} · {client.legalForm}
                  </p>
                </div>
              </div>
              <button className="secondary" onClick={() => edit(client)}>
                Edit profile
              </button>
              <dl>
                <div>
                  <dt>Primary contact</dt>
                  <dd>{client.contactName}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{client.contactEmail}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{label(client.status)}</dd>
                </div>
              </dl>
            </div>
            <nav
              className="client-file-tabs"
              aria-label="Client record sections"
            >
              <button
                className={section === "permanent" ? "active" : ""}
                aria-current={section === "permanent" ? "page" : undefined}
                onClick={() => selectSection("permanent")}
              >
                <FolderOpen />
                <span>
                  <strong>Permanent file</strong>
                  <small>{permanentCount} document(s)</small>
                </span>
              </button>
              <button
                className={section === "annual" ? "active" : ""}
                aria-current={section === "annual" ? "page" : undefined}
                onClick={() => selectSection("annual")}
              >
                <FileText />
                <span>
                  <strong>Annual files</strong>
                  <small>{annualFiles.length} reporting period(s)</small>
                </span>
              </button>
              <button
                className={section === "governance" ? "active" : ""}
                aria-current={section === "governance" ? "page" : undefined}
                onClick={() => selectSection("governance")}
              >
                <Users />
                <span>
                  <strong>Governance &amp; access</strong>
                  <small>
                    {currentTrusteeCount} current trustee{currentTrusteeCount === 1 ? "" : "s"} ·{" "}
                    {currentOfficerCount} current officer{currentOfficerCount === 1 ? "" : "s"} ·{" "}
                    {portalUsers.length} user
                    {portalUsers.length === 1 ? "" : "s"}
                  </small>
                </span>
              </button>
            </nav>
            {section === "permanent" && (
              <PermanentFile
                state={state}
                client={client}
                mutate={mutate}
                notify={notify}
              />
            )}{" "}
            {section === "annual" && (
              <div className="panel annual-files-panel">
                <div className="panel-title">
                  <div>
                    <h2>Annual working-paper files</h2>
                    <p>One controlled file for each reporting period</p>
                  </div>
                  <span>{annualFiles.length} year(s)</span>
                </div>
                {annualFiles.map((e) => {
                  const docs = state.documents.filter(
                    (d) => d.engagementId === e.id,
                  );
                  const tb = docs.some(
                      (d) => d.fileSection === "TRIAL_BALANCE",
                    ),
                    draft = docs.some(
                      (d) => d.fileSection === "DRAFT_ACCOUNTS",
                    );
                  return (
                    <button
                      className="annual-file-row"
                      key={e.id}
                      onClick={() => openAnnual(e.id)}
                    >
                      <span className="annual-folder">
                        <FolderOpen />
                      </span>
                      <span>
                        <strong>Year ended {fmtDate(e.periodEnd)}</strong>
                        <small>
                          {label(e.status)} · {e.accountingBasis}
                        </small>
                      </span>
                      <span className={tb ? "file-ready" : "file-missing"}>
                        {tb ? "TB uploaded" : "TB required"}
                      </span>
                      <span className={draft ? "file-ready" : "file-missing"}>
                        {draft
                          ? "Draft accounts uploaded"
                          : "Draft accounts required"}
                      </span>
                      <ChevronRight />
                    </button>
                  );
                })}
                {!annualFiles.length && (
                  <p className="empty-file-note">
                    No annual working-paper file has been created.
                  </p>
                )}
              </div>
            )}
            {section === "governance" && (
              <div className="client-governance-stack">
                <div className="panel governance-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Trustees and officers</h2>
                      <p>
                        {currentTrusteeCount} current trustee{currentTrusteeCount === 1 ? "" : "s"} ·{" "}
                        {currentOfficerCount} current officer{currentOfficerCount === 1 ? "" : "s"} ·{" "}
                        {historicalGovernanceCount} former record{historicalGovernanceCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <button onClick={() => addTrustee(client)}>
                      <Plus />
                      Add person
                    </button>
                  </div>
                  {trustees.map((t) => (
                    <div
                      className={`governance-row ${t.status !== "ACTIVE" ? "inactive" : ""}`}
                      key={t.id}
                    >
                      <span className="avatar">{initials(t.name)}</span>
                      <span>
                        <strong>{t.name}</strong>
                        <small>
                          {label(t.personType)} · {t.role} · appointed{" "}
                          {t.appointmentDate
                            ? fmtDate(t.appointmentDate)
                            : "date not recorded"}
                          {t.resignationDate
                            ? ` · ceased ${fmtDate(t.resignationDate)}`
                            : ""}
                        </small>
                        {t.email && <small>{t.email}</small>}
                      </span>
                      <span className="governance-row-actions">
                        <b>{label(t.status)}</b>
                        <button
                          className="secondary"
                          onClick={() => editTrustee(t)}
                        >
                          Edit
                        </button>
                      </span>
                    </div>
                  ))}
                  {!trustees.length && (
                    <p className="empty-file-note">
                      No trustees or officers have been recorded.
                    </p>
                  )}
                </div>
                <div className="panel governance-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Client portal users</h2>
                      <p>People authorised within the client organisation</p>
                    </div>
                    <button onClick={() => addUser(client)}>
                      <Plus />
                      Add user
                    </button>
                  </div>
                  {portalUsers.map((u) => (
                    <div className="governance-row" key={u.id}>
                      <span className="avatar">{initials(u.name)}</span>
                      <span>
                        <strong>{u.name}</strong>
                        <small>
                          {u.email} · {label(u.role)}
                        </small>
                      </span>
                      <span className="governance-row-actions">
                        <b>{label(u.status)}</b>
                        <button
                          className="secondary"
                          onClick={async () => {
                            await mutate("updateClientUser", {
                              clientUserId: u.id,
                              status:
                                u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                            });
                            notify(
                              `Client access ${u.status === "ACTIVE" ? "deactivated" : "reactivated"}`,
                            );
                          }}
                        >
                          {u.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </Page>
  );
}

function PermanentFile({
  state,
  client,
  mutate,
  notify,
}: {
  state: AppState;
  client: Client;
  mutate: Mutate;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(""),
    [openCategory, setOpenCategory] = useState("CONSTITUTION");
  useEffect(() => setOpenCategory("CONSTITUTION"), [client.id]);
  const categories = [
    {
      id: "CONSTITUTION",
      title: "Constitution and registration",
      copy: "Governing document, Charity Commission record and incorporation documents.",
    },
    {
      id: "GOVERNANCE",
      title: "Governance and trustees",
      copy: "Standing declarations, trustee authorities and governance policies.",
    },
    {
      id: "AGREEMENTS",
      title: "Key agreements and policies",
      copy: "Material contracts, grant frameworks, leases and enduring policies.",
    },
    {
      id: "AML_KYC",
      title: "AML, KYC and acceptance",
      copy: "Identity, due diligence and standing engagement information.",
    },
    {
      id: "PRIOR_REPORTS",
      title: "Prior reports and correspondence",
      copy: "Earlier reports, management letters and matters carried forward.",
    },
  ];
  const upload = async (file: File | undefined, category: string) => {
    if (!file) return;
    setBusy(category);
    try {
      const f = new FormData();
      f.set("file", file);
      f.set("clientId", String(client.id));
      f.set("permanentCategory", category);
      const r = await fetch("/api/files", { method: "POST", body: f }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await mutate("refresh");
      notify("Document added to the permanent file");
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="panel permanent-file">
      <div className="panel-title">
        <div>
          <h2>Permanent file</h2>
          <p>
            Standing information retained across reporting periods. Select a
            folder to view or add documents.
          </p>
        </div>
        <span>
          {
            state.permanentDocuments.filter((d) => d.clientId === client.id)
              .length
          }{" "}
          document(s)
        </span>
      </div>
      <div className="permanent-category-list">
        {categories.map((category) => {
          const docs = state.permanentDocuments.filter(
              (d) => d.clientId === client.id && d.category === category.id,
            ),
            open = openCategory === category.id;
          return (
            <article className={open ? "open" : ""} key={category.id}>
              <div className="permanent-category-head">
                <button
                  className="permanent-category-toggle"
                  aria-expanded={open}
                  onClick={() => setOpenCategory(open ? "" : category.id)}
                >
                  <FolderOpen />
                  <span>
                    <strong>{category.title}</strong>
                    <small>{category.copy}</small>
                  </span>
                  <b>{docs.length}</b>
                  <ChevronDown />
                </button>
                <label>
                  <UploadCloud />
                  {busy === category.id ? "Uploading…" : "Upload document"}
                  <input
                    type="file"
                    accept=".pdf,.docx,.xlsx,.csv,.jpg,.jpeg,.png"
                    onChange={(e) => upload(e.target.files?.[0], category.id)}
                  />
                </label>
              </div>
              {open && (
                <div className="permanent-category-body">
                  {docs.length ? (
                    docs.map((d) => (
                      <a href={`/api/files?permanentId=${d.id}`} key={d.id}>
                        <Paperclip />
                        <span>
                          <strong>{d.fileName}</strong>
                          <small>
                            {fmtTime(d.createdAt)} ·{" "}
                            {Math.ceil(d.byteSize / 1024)} KB ·{" "}
                            {d.sha256.slice(0, 10)}…
                          </small>
                        </span>
                        <span>Open</span>
                        <Download />
                      </a>
                    ))
                  ) : (
                    <p>No documents recorded in this folder.</p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
function Team({
  state,
  create,
  mutate,
  notify,
}: {
  state: AppState;
  create: () => void;
  mutate: Mutate;
  notify: Notify;
}) {
  return (
    <Page
      eye="ACCESS AND RESPONSIBILITY"
      title="Team"
      desc="Named roles supporting preparation, review and examiner sign-off."
      action={
        <button className="primary" onClick={create}>
          <Plus />
          Add team member
        </button>
      }
    >
      <div className="team-management">
        <div className="team-member-list">
          {state.users.map((u) => (
            <article
              className={`panel team-member-card${u.status === "ACTIVE" ? "" : " inactive"}`}
              key={u.id}
            >
              <span className="team-member-avatar" aria-hidden="true">
                {initials(u.name)}
              </span>
              <div className="team-member-profile">
                <div className="team-member-heading">
                  <div>
                    <h2>{u.name}</h2>
                    <p>{label(u.role)}</p>
                  </div>
                  <span
                    className={`team-member-status ${u.status.toLowerCase()}`}
                  >
                    {u.status === "ACTIVE" ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="team-member-contact">
                  <span>Email</span>
                  <a href={`mailto:${u.email}`}>{u.email}</a>
                </div>
              </div>
              <div className="team-member-action">
                <button
                  className="secondary"
                  aria-label={`${u.status === "ACTIVE" ? "Deactivate" : "Reactivate"} access for ${u.name}`}
                  onClick={async () => {
                    await mutate("updateTeamMember", {
                      userId: u.id,
                      status: u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                    });
                    notify(
                      `Team member ${u.status === "ACTIVE" ? "deactivated" : "reactivated"}`,
                    );
                  }}
                >
                  {u.status === "ACTIVE"
                    ? "Deactivate access"
                    : "Reactivate access"}
                </button>
              </div>
            </article>
          ))}
        </div>
        <Note
          icon={<ShieldCheck />}
          title="Access control"
          text="Application roles are recorded here. Hosted access is governed separately by the Site access policy."
        />
      </div>
    </Page>
  );
}
function Templates() {
  return (
    <Page
      eye="CONTROLLED CONTENT"
      title="Templates"
      desc="Read-only, version-controlled regulatory content."
      action={<span className="risk-chip">Controlled</span>}
    >
      <div className="panel">
        <Template
          icon={<BookOpenCheck />}
          title="CC32 independent examination work programme"
          detail="13 Directions · 52 procedures · Version 2026.1"
        />
        <Template
          icon={<FileCheck2 />}
          title="Independent examiner’s report"
          detail="Controlled conclusion variants · Charities Act 2011"
        />
        <Template
          icon={<ShieldCheck />}
          title="Material-significance assessment"
          detail="Mandatory completion control"
        />
      </div>
      <Note
        icon={<LockKeyhole />}
        title="Template governance"
        text="Controlled templates cannot be altered within an engagement. Changes require an approved content release."
      />
    </Page>
  );
}
function Audit({ state }: { state: AppState }) {
  const [f, setF] = useState("");
  const rows = state.audit.filter((a) =>
    (a.action + a.actorEmail + a.entityType + a.entityId)
      .toLowerCase()
      .includes(f.toLowerCase()),
  );
  return (
    <Page
      eye="IMMUTABLE ACTIVITY"
      title="Audit trail"
      desc="Chronological record of material engagement and data events."
      action={<span className="risk-chip">{state.audit.length} events</span>}
    >
      <div className="audit-filter">
        <Search />
        <input
          value={f}
          onChange={(e) => setF(e.target.value)}
          placeholder="Filter audit events"
        />
      </div>
      <div className="panel audit-list">
        {rows.map((a) => (
          <div className="audit-row" key={a.id}>
            <span className="audit-dot" />
            <div>
              <strong>{label(a.action)}</strong>
              <p>
                {a.entityType} · {a.entityId}
              </p>
            </div>
            <span>
              <strong>{a.actorEmail}</strong>
              <small>{fmtTime(a.createdAt)}</small>
            </span>
          </div>
        ))}
      </div>
    </Page>
  );
}
function Admin({ state, mutate, notify }: { state: AppState; mutate: Mutate; notify: Notify }) {
  const [tab, setTab] = useState<"overview" | "jurisdictions" | "classifications" | "access" | "controls">("overview"),
    [jurisdictionId, setJurisdictionId] = useState(state.jurisdictions[0]?.id ?? 0),
    [creatingDraft, setCreatingDraft] = useState(false),
    jurisdiction = state.jurisdictions.find((item) => item.id === jurisdictionId) ?? state.jurisdictions[0],
    rules = state.jurisdictionRuleSets
      .filter((item) => item.jurisdictionId === jurisdiction?.id)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version.localeCompare(a.version)),
    coverageIssues = state.jurisdictions.flatMap((item) =>
      ruleSeriesIssues(
        state.jurisdictionRuleSets.filter((rule) => rule.jurisdictionId === item.id),
      ).map((issue) => `${item.name}: ${issue}`),
    ),
    tabs = [
      ["overview", "Overview", LayoutDashboard],
      ["jurisdictions", "Jurisdictions & rules", Globe2],
      ["classifications", "Organisation types", Building2],
      ["access", "Access & roles", UserCog],
      ["controls", "Quality controls", ShieldCheck],
    ] as const;
  return <Page eye="PRACTICE CONTROL CENTRE" title="Administration" desc="Versioned regulatory configuration, access control and quality governance." action={<span className="admin-role"><ShieldCheck /> Practice administrator</span>}>
    <div className="admin-shell">
      <nav className="admin-tabs" aria-label="Administration sections">{tabs.map(([id, text, Icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon />{text}</button>)}</nav>
      {tab === "overview" && <div className="admin-content">
        <div className="admin-metrics">
          <AdminMetric label="Active jurisdictions" value={String(state.jurisdictions.filter((x) => x.status === "ACTIVE").length)} note="UK charity law regimes" />
          <AdminMetric label="Published rule sets" value={String(state.jurisdictionRuleSets.filter((x) => x.status === "PUBLISHED").length)} note="Effective-dated and immutable" />
          <AdminMetric label="Organisation types" value={String(state.organisationTypes.filter((x) => x.status === "ACTIVE").length)} note="Active client classifications" />
          <AdminMetric label="Authorised users" value={String(state.users.filter((x) => x.status === "ACTIVE").length)} note="Role-based practice access" />
        </div>
        <section className="admin-overview-grid">
          <article className="admin-summary-card"><header><Globe2 /><div><h2>Regulatory coverage</h2><p>Rules are selected by reporting date and pinned to each engagement.</p></div></header>{state.jurisdictions.map((item) => <button key={item.id} onClick={() => { setJurisdictionId(item.id); setTab("jurisdictions"); }}><span><strong>{item.name}</strong><small>{item.regulator}</small></span><b>{state.jurisdictionRuleSets.filter((rule) => rule.jurisdictionId === item.id && rule.status === "PUBLISHED").length} published</b><ChevronRight /></button>)}</article>
          <article className="admin-summary-card"><header><Activity /><div><h2>Configuration activity</h2><p>Recent administrative changes from the audit trail.</p></div></header>{state.audit.filter((event) => /JURISDICTION|ORGANISATION_TYPE|TEAM_MEMBER/.test(event.action)).slice(0, 6).map((event) => <div className="admin-event" key={event.id}><span /><p><strong>{label(event.action)}</strong><small>{event.actorEmail} · {fmtTime(event.createdAt)}</small></p></div>)}</article>
        </section>
        <Note icon={<ShieldCheck />} title="Controlled change principle" text="Published regulatory rules cannot be edited. Administrators create and publish a new effective-dated version, while completed engagements retain the rule set used for acceptance." />
        {coverageIssues.length > 0 && <Note icon={<AlertTriangle />} title="Configuration exceptions" text={coverageIssues.join(" · ")} />}
      </div>}
      {tab === "jurisdictions" && jurisdiction && <div className="admin-content admin-jurisdiction-layout">
        <aside className="jurisdiction-list"><p>REGULATORY REGIMES</p>{state.jurisdictions.map((item) => <button key={item.id} className={item.id === jurisdiction.id ? "active" : ""} onClick={() => setJurisdictionId(item.id)}><span className="flag-code">{item.code === "ENGLAND_WALES" ? "EW" : item.code === "SCOTLAND" ? "SC" : "NI"}</span><span><strong>{item.name}</strong><small>{item.regulator}</small></span><i className={item.status.toLowerCase()}>{item.status}</i></button>)}</aside>
        <div className="jurisdiction-workspace"><JurisdictionEditor jurisdiction={jurisdiction} mutate={mutate} notify={notify} />
          <div className="rule-set-heading"><div><p className="eyebrow">EFFECTIVE-DATED CONTROL</p><h2>Independent examination rule sets</h2><span>Published versions are read-only and pinned to historical files.</span></div><button className="primary" onClick={() => setCreatingDraft(true)}><Plus /> New draft version</button></div>
          {creatingDraft && <form className="rule-draft-create" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; void handleUiAction(async () => { await mutate("createJurisdictionRuleSet", { ...Object.fromEntries(new FormData(form).entries()), jurisdictionId: jurisdiction.id }); form.reset(); setCreatingDraft(false); notify("New rule draft created"); }); }}><header><div><strong>Create controlled draft</strong><small>Select the exact published baseline and the date on which the new version is expected to apply.</small></div><button type="button" onClick={() => setCreatingDraft(false)} aria-label="Close new rule draft form"><X /></button></header><div><label>Version<input name="version" required placeholder={`${jurisdiction.code}-YYYY.N`} /></label><label>Effective from<input name="effectiveFrom" type="date" required /></label><label>Drafting baseline<select name="sourceRuleSetId" required defaultValue=""><option value="" disabled>Select published version</option>{rules.filter((item) => item.status === "PUBLISHED").map((item) => <option value={item.id} key={item.id}>{item.version} · from {item.effectiveFrom}</option>)}</select></label><button className="primary"><Plus /> Create draft</button></div></form>}
          <div className="rule-set-list">{rules.map((rule) => <RuleSetEditor key={rule.id} rule={rule} usage={state.engagements.filter((item) => item.jurisdictionRuleSetId === rule.id).length} mutate={mutate} notify={notify} />)}{!rules.length && <div className="admin-empty"><Globe2 /><strong>No rule sets configured</strong><p>Create and publish a rule set before selecting this jurisdiction on an engagement.</p></div>}</div>
        </div>
      </div>}
      {tab === "classifications" && <div className="admin-content narrow-admin"><AdminSectionHeading eye="CLIENT MASTER DATA" title="Organisation classifications" text="Changes affect new selections only. Existing clients retain their recorded classification." />
        <form className="admin-create-row" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; void handleUiAction(async () => { await mutate("createOrganisationType", Object.fromEntries(new FormData(form).entries())); form.reset(); notify("Organisation type added"); }); }}><input name="name" required placeholder="New organisation type" /><button className="primary"><Plus /> Add type</button></form>
        <div className="admin-data-table"><div className="admin-data-head"><span>Classification</span><span>Code</span><span>Status</span><span>Last updated</span><span /></div>{state.organisationTypes.map((item) => <OrganisationTypeRow key={item.id} item={item} mutate={mutate} notify={notify} />)}</div>
      </div>}
      {tab === "access" && <div className="admin-content narrow-admin"><AdminSectionHeading eye="ROLE-BASED ACCESS" title="Practice users" text="Only administrators can maintain practice access. A user cannot deactivate their own account." />
        <form className="admin-create-user" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; void handleUiAction(async () => { await mutate("addTeamMember", Object.fromEntries(new FormData(form).entries())); form.reset(); notify("Practice user added"); }); }}><input name="name" required placeholder="Full name" /><input name="email" type="email" required placeholder="name@practice.co.uk" /><select name="role" defaultValue="PREPARER"><option value="PREPARER">Preparer</option><option value="REVIEWER">Reviewer</option><option value="INDEPENDENT_EXAMINER">Independent examiner</option><option value="ADMIN">Administrator</option></select><button className="primary"><Plus /> Add user</button></form>
        <div className="access-list">{state.users.map((user) => <AccessRow key={user.id} user={user} mutate={mutate} notify={notify} />)}</div>
      </div>}
      {tab === "controls" && state.practiceSettings && <QualitySettings settings={state.practiceSettings} mutate={mutate} notify={notify} />}
    </div>
  </Page>;
}

function AdminMetric({ label: text, value, note }: { label: string; value: string; note: string }) {
  return <article><span>{text}</span><strong>{value}</strong><small>{note}</small></article>;
}
function AdminSectionHeading({ eye, title, text }: { eye: string; title: string; text: string }) {
  return <section className="admin-section-head"><div><p className="eyebrow">{eye}</p><h2>{title}</h2><span>{text}</span></div></section>;
}
function JurisdictionEditor({ jurisdiction, mutate, notify }: { jurisdiction: Jurisdiction; mutate: Mutate; notify: Notify }) {
  return <form className="jurisdiction-editor" key={jurisdiction.id} onSubmit={(event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries()); void handleUiAction(async () => { await mutate("updateJurisdiction", { ...values, jurisdictionId: jurisdiction.id }); notify("Jurisdiction details saved"); }); }}>
    <header><div><span className="flag-code large">{jurisdiction.code === "ENGLAND_WALES" ? "EW" : jurisdiction.code === "SCOTLAND" ? "SC" : "NI"}</span><div><p className="eyebrow">JURISDICTION PROFILE</p><h2>{jurisdiction.name}</h2><small>Configuration code {jurisdiction.code}</small></div></div><button className="secondary"><Save /> Save profile</button></header>
    <div className="jurisdiction-fields"><label>Display name<input name="name" defaultValue={jurisdiction.name} required /></label><label>Regulator<input name="regulator" defaultValue={jurisdiction.regulator} required /></label><label>Official regulator URL<input name="regulatorUrl" type="url" defaultValue={jurisdiction.regulatorUrl} required /></label><label>Status<select name="status" defaultValue={jurisdiction.status}><option>ACTIVE</option><option>INACTIVE</option></select></label></div>
  </form>;
}
function RuleSetEditor({ rule, usage, mutate, notify }: { rule: JurisdictionRuleSet; usage: number; mutate: Mutate; notify: Notify }) {
  const [open, setOpen] = useState(rule.status === "DRAFT"), editable = rule.status === "DRAFT";
  const today = new Date().toISOString().slice(0, 10), periodState = rule.status === "DRAFT" ? "Draft" : rule.effectiveFrom > today ? "Future" : rule.effectiveTo && rule.effectiveTo < today ? "Historical" : "Current";
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget, values: Record<string, unknown> = Object.fromEntries(new FormData(form).entries());
    for (const name of ["qualificationFloorInclusive", "auditIncomeInclusive", "allCharitiesScrutinised"])
      values[name] = (form.elements.namedItem(name) as HTMLInputElement).checked;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const publishing = submitter?.value === "publish";
    await handleUiAction(async () => {
      await mutate(publishing ? "saveAndPublishJurisdictionRuleSet" : "updateJurisdictionRuleSet", { ...values, ruleSetId: rule.id });
      notify(publishing ? "Rule version published and locked" : "Rule draft saved");
    });
  };
  return <article className={`rule-set ${open ? "open" : ""}`}>
    <button className="rule-set-summary" onClick={() => setOpen(!open)}><span className={`rule-status ${rule.status.toLowerCase()}`}>{rule.status}</span><span><strong>{rule.version}</strong><small>{rule.effectiveFrom} to {rule.effectiveTo ?? "open ended"} · {periodState}</small></span><span><b>{money(rule.examinationFloor)}</b><small>IE floor</small></span><span><b>{money(rule.auditIncome)}</b><small>Audit threshold</small></span><span><small>{usage} pinned engagement{usage === 1 ? "" : "s"}</small><b>{rule.updatedBy}</b></span><ChevronDown /></button>
    {open && <form className="rule-set-form" onSubmit={submit}>
      <div className="rule-provenance"><ShieldCheck /><p><strong>{editable ? "Draft configuration" : "Published control record"}</strong>{editable ? "Validate the effective period and official source before publishing." : `Published ${rule.publishedAt ? fmtTime(rule.publishedAt) : "as a controlled version"}. Create a new draft to change these rules.`}</p></div>
      <div className="rule-form-grid"><label>Version<input name="version" defaultValue={rule.version} disabled={!editable} required /></label><label>Effective from<input name="effectiveFrom" type="date" defaultValue={rule.effectiveFrom} disabled={!editable} required /></label><label>Effective to<input name="effectiveTo" type="date" defaultValue={rule.effectiveTo ?? ""} disabled={!editable} /></label><label>Effective date applies to<select name="effectiveDateBasis" defaultValue={rule.effectiveDateBasis} disabled={!editable}><option value="PERIOD_END">Reporting period end</option><option value="PERIOD_START">Reporting period start</option></select></label><label>Asset test basis<select name="assetTestBasis" defaultValue={rule.assetTestBasis} disabled={!editable}><option value="INCOME_AND_ASSETS">Income and assets</option><option value="ACCRUALS_ASSETS">Accruals accounts assets</option><option value="NONE">No asset test</option></select></label>
        <label>Examination floor (£)<input name="examinationFloor" type="number" min="0" defaultValue={rule.examinationFloor} disabled={!editable} /></label><label>Qualified examiner floor (£)<input name="qualificationFloor" type="number" min="0" defaultValue={rule.qualificationFloor} disabled={!editable} /></label><label>Audit income threshold (£)<input name="auditIncome" type="number" min="0" defaultValue={rule.auditIncome} disabled={!editable} /></label><label>Asset-test income floor (£)<input name="assetIncomeFloor" type="number" min="0" defaultValue={rule.assetIncomeFloor} disabled={!editable} /></label><label>Audit asset threshold (£)<input name="auditAssets" type="number" min="0" defaultValue={rule.auditAssets} disabled={!editable} /></label>
      </div>
      <div className="rule-checks"><label><input name="allCharitiesScrutinised" type="checkbox" defaultChecked={rule.allCharitiesScrutinised} disabled={!editable} /> All charities require external scrutiny</label><label><input name="qualificationFloorInclusive" type="checkbox" defaultChecked={rule.qualificationFloorInclusive} disabled={!editable} /> Qualification threshold is inclusive</label><label><input name="auditIncomeInclusive" type="checkbox" defaultChecked={rule.auditIncomeInclusive} disabled={!editable} /> Audit income threshold is inclusive</label></div>
      <label className="wide-field">Official source title<input name="sourceTitle" defaultValue={rule.sourceTitle} disabled={!editable} required /></label><label className="wide-field">Official source URL<input name="sourceUrl" type="url" defaultValue={rule.sourceUrl} disabled={!editable} required /></label><label className="wide-field">Application notes<textarea name="notes" defaultValue={rule.notes} disabled={!editable} /></label>
      <footer>{editable ? <><button className="secondary" name="intent" value="save"><Save /> Save draft</button><button className="primary" name="intent" value="publish"><ShieldCheck /> Save &amp; publish version</button></> : <a className="secondary" href={rule.sourceUrl} target="_blank" rel="noreferrer">View official source</a>}</footer>
    </form>}
  </article>;
}
function OrganisationTypeRow({ item, mutate, notify }: { item: OrganisationType; mutate: Mutate; notify: Notify }) {
  const [name, setName] = useState(item.name), [status, setStatus] = useState(item.status);
  return <form className="admin-data-row" onSubmit={(event) => { event.preventDefault(); void handleUiAction(async () => { await mutate("updateOrganisationType", { organisationTypeId: item.id, name, status }); notify("Organisation type saved"); }); }}><input aria-label={`Name for ${item.code}`} value={name} onChange={(event) => setName(event.target.value)} /><code>{item.code}</code><select aria-label={`Status for ${item.code}`} value={status} onChange={(event) => setStatus(event.target.value)}><option>ACTIVE</option><option>INACTIVE</option></select><span>{fmtTime(item.updatedAt)}</span><button className="secondary"><Save /> Save</button></form>;
}
function AccessRow({ user, mutate, notify }: { user: TeamMember; mutate: Mutate; notify: Notify }) {
  const [role, setRole] = useState(user.role), [status, setStatus] = useState(user.status);
  return <article><span className="avatar">{initials(user.name)}</span><span><strong>{user.name}</strong><small>{user.email}</small></span><label>Practice role<select value={role} onChange={(event) => setRole(event.target.value)}><option value="PREPARER">Preparer</option><option value="REVIEWER">Reviewer</option><option value="INDEPENDENT_EXAMINER">Independent examiner</option><option value="ADMIN">Administrator</option></select></label><label>Access status<select value={status} onChange={(event) => setStatus(event.target.value)}><option>ACTIVE</option><option>INACTIVE</option></select></label><button className="secondary" onClick={() => void handleUiAction(async () => { await mutate("updateTeamMember", { userId: user.id, role, status }); notify("Practice access saved"); })}><Save /> Save</button></article>;
}
function QualitySettings({ settings, mutate, notify }: { settings: NonNullable<AppState["practiceSettings"]>; mutate: Mutate; notify: Notify }) {
  return <div className="admin-content quality-settings"><AdminSectionHeading eye="PRACTICE POLICY" title="Quality and file controls" text={`Last updated by ${settings.updatedBy} · ${fmtTime(settings.updatedAt)}`} />
    <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget, values: Record<string, unknown> = Object.fromEntries(new FormData(form).entries()); for (const name of ["requireIndependentConcernClosure", "allowProcedureSelfReview"]) values[name] = (form.elements.namedItem(name) as HTMLInputElement).checked; void handleUiAction(async () => { await mutate("updatePracticeSettings", values); notify("Practice quality policy saved"); }); }}>
      <section><header><ClipboardCheck /><div><h3>Review policy</h3><p>Configure proportional review expectations without converting independent examination into an audit workflow.</p></div></header><div className="quality-form-grid"><label>Concern review mode<select name="concernReviewMode" defaultValue={settings.concernReviewMode}><option value="ALL">Review every concern</option><option value="HIGH_RISK_ONLY">High and critical concerns</option><option value="EXAMINER_JUDGEMENT">Examiner judgement</option></select></label><label>Default engagement quality review<select name="defaultQualityReviewMode" defaultValue={settings.defaultQualityReviewMode}><option value="NONE">None required</option><option value="SECOND_REVIEW">Second review</option><option value="HOT_FILE">Hot-file review</option><option value="COLD_FILE">Cold-file review</option></select></label><label className="quality-check"><input name="requireIndependentConcernClosure" type="checkbox" defaultChecked={settings.requireIndependentConcernClosure} /><span><strong>Independent concern closure</strong><small>Prevent the concern creator from accepting and closing their own assessment.</small></span></label><label className="quality-check"><input name="allowProcedureSelfReview" type="checkbox" defaultChecked={settings.allowProcedureSelfReview} /><span><strong>Permit sole-practitioner self-review</strong><small>Allow the same authenticated examiner to prepare and review work where practice policy permits.</small></span></label></div></section>
      <section><header><LockKeyhole /><div><h3>Completion and retention</h3><p>Define the practice defaults applied to active files and documented operating procedures.</p></div></header><div className="quality-form-grid"><label>File lock deadline after report date, days<input name="fileLockDeadlineDays" type="number" min="1" max="365" defaultValue={settings.fileLockDeadlineDays} /></label><label>Retention period, years<input name="retentionYears" type="number" min="1" max="25" defaultValue={settings.retentionYears} /></label></div></section>
      <Note icon={<ShieldCheck />} title="Methodology boundary" text="These controls govern review, completion and retention. They do not introduce ISA audit assertions, mandatory sampling, control-reliance testing or a true-and-fair audit opinion." />
      <footer><button className="primary"><Save /> Save quality policy</button></footer>
    </form>
  </div>;
}

function DialogView({
  dialog,
  close,
  state,
  active,
  mutate,
  notify,
}: {
  dialog: NonNullable<Dialog>;
  close: () => void;
  state: AppState;
  active?: Engagement;
  mutate: Mutate;
  notify: Notify;
}) {
  if (dialog.kind === "help")
    return (
      <Modal title="Help and workflow controls" close={close}>
        <div className="help-content">
          <h3>Recommended workflow</h3>
          <ol>
            <li>Create the client, trustees and portal users.</li>
            <li>
              Complete each workpaper accordion, attach evidence and record a
              conclusion.
            </li>
            <li>Send linked evidence requests and retain the reply thread.</li>
            <li>Prepare, review and clear formal review points.</li>
            <li>
              Complete reporting gates and generate the controlled report.
            </li>
          </ol>
        </div>
      </Modal>
    );
  if (dialog.kind === "trustee" || dialog.kind === "editTrustee")
    return (
      <GovernancePersonDialog
        dialog={dialog}
        close={close}
        mutate={mutate}
        notify={notify}
      />
    );
  const client = dialog.data as Client | undefined,
    eng = dialog.data as Engagement | undefined,
    req = dialog.data as EvidenceRequest | undefined;
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget).entries());
    let action = "",
      payload: Record<string, unknown> = d;
    if (dialog.kind === "client") action = "createClient";
    if (dialog.kind === "editClient") {
      action = "updateClient";
      payload = { ...d, clientId: client!.id };
    }
    if (dialog.kind === "engagement") action = "createEngagement";
    if (dialog.kind === "editEngagement") {
      action = "updateEngagement";
      payload = { ...d, engagementId: eng!.id };
    }
    if (dialog.kind === "request") {
      action = "createRequest";
      payload = { ...d, engagementId: active!.id };
    }
    if (dialog.kind === "requestDetail") {
      const { reply, ...requestData } = d;
      await mutate("updateRequest", { ...requestData, requestId: req!.id });
      if (String(reply || "").trim())
        await mutate("addComment", {
          engagementId: req!.engagementId,
          requestId: req!.id,
          visibility: "CLIENT",
          body: String(reply),
        });
      close();
      notify("Request and reply saved");
      return;
    }
    if (dialog.kind === "review") {
      action = "createReviewNote";
      payload = { ...d, engagementId: active!.id };
    }
    if (dialog.kind === "clear") {
      action = "resolveNote";
      payload = { ...d, noteId: (dialog.data as ReviewNote).id };
    }
    if (dialog.kind === "team") action = "addTeamMember";
    if (dialog.kind === "clientUser") {
      action = "addClientUser";
      payload = { ...d, clientId: client!.id };
    }
    if (dialog.kind === "task") {
      action = "createTask";
      payload = { ...d, engagementId: active!.id };
    }
    await mutate(action, payload);
    close();
    notify("Record saved successfully");
  };
  const organisationTypes = state.organisationTypes
    .filter((item) => item.status === "ACTIVE")
    .map((item) => item.name);
  const thread = state.comments.filter((c) => c.requestId === req?.id);
  return (
    <Modal title={dialogTitle(dialog.kind)} close={close}>
      <form className="modal-form" onSubmit={submit}>
        {(dialog.kind === "client" || dialog.kind === "editClient") && (
          <>
            <Field n="name" l="Charity name" v={client?.name} required />
            <Field
              n="charityNumber"
              l="Charity number"
              v={client?.charityNumber}
              required
            />
            <Select
              n="legalForm"
              l="Organisation type"
              v={client?.legalForm ?? organisationTypes[0]}
              o={organisationTypes}
            />
            <Field
              n="contactName"
              l="Primary contact"
              v={client?.contactName}
              required
            />
            <Field
              n="contactEmail"
              l="Contact email"
              type="email"
              v={client?.contactEmail}
              required
            />
            {dialog.kind === "editClient" && (
              <Select
                n="status"
                l="Status"
                v={client?.status}
                o={["ACTIVE", "INACTIVE"]}
              />
            )}
          </>
        )}
        {(dialog.kind === "engagement" || dialog.kind === "editEngagement") && (
          <>
            <label>
              Client
              <select
                name="clientId"
                defaultValue={eng?.clientId}
                disabled={dialog.kind === "editEngagement"}
              >
                {state.clients.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <Field
              n="periodStart"
              l="Period start"
              type="date"
              v={eng?.periodStart ?? undefined}
              required
            />
            <Field
              n="periodEnd"
              l="Period end"
              type="date"
              v={eng?.periodEnd}
              required
            />
            <label>
              Charity law jurisdiction
              <select name="jurisdiction" defaultValue={eng?.jurisdiction ?? "ENGLAND_WALES"} disabled={dialog.kind === "editEngagement"}>
                {state.jurisdictions
                  .filter((item) => item.status === "ACTIVE")
                  .map((item) => (
                    <option value={item.code} key={item.id}>
                      {item.name} · {item.regulator}
                    </option>
                  ))}
              </select>
            </label>
            <Select
              n="accountingBasis"
              l="Accounting basis"
              v={eng?.accountingBasis}
              o={["Accruals", "Receipts and payments"]}
            />
            <Field
              n="grossIncome"
              l="Gross income (£)"
              type="number"
              v={String(eng?.grossIncome ?? "")}
            />
            <Field
              n="grossAssets"
              l="Gross assets (£)"
              type="number"
              v={String(eng?.grossAssets ?? "")}
            />
            <Field
              n="materiality"
              l="Materiality (£)"
              type="number"
              v={String(eng?.materiality ?? "")}
            />
            <Select
              n="risk"
              l="Risk"
              v={eng?.risk}
              o={["LOW", "STANDARD", "HIGH"]}
            />
            {dialog.kind === "editEngagement" && (
              <Select
                n="status"
                l="Stage"
                v={eng?.status}
                o={[
                  "PLANNING",
                  "CLIENT_INPUT",
                  "FIELDWORK",
                  "REVIEW",
                  "COMPLETION",
                  "SIGNED",
                ]}
              />
            )}
          </>
        )}
        {dialog.kind === "request" && (
          <>
            <label>
              Linked procedure
              <select name="procedureId">
                <option value="">Engagement level</option>
                {state.tasks
                  .filter((t) => t.engagementId === active!.id)
                  .flatMap((t) =>
                    state.procedures
                      .filter((p) => p.taskId === t.id)
                      .map((p) => (
                        <option value={p.id} key={p.id}>
                          {regulatoryUnit(active!.jurisdiction)} {t.direction}, procedure {t.direction}.
                          {p.sequence}: {p.text}
                        </option>
                      )),
                  )}
              </select>
            </label>
            <Field n="title" l="Request title" required />
            <label>
              Description
              <textarea name="description" required />
            </label>
            <Field
              n="contactName"
              l="Client contact"
              v={
                state.clients.find((c) => c.id === active!.clientId)?.contactName
              }
            />
            <Field
              n="contactEmail"
              l="Contact email"
              type="email"
              v={
                state.clients.find((c) => c.id === active!.clientId)
                  ?.contactEmail
              }
            />
            <Field n="dueDate" l="Due date" type="date" required />
          </>
        )}
        {dialog.kind === "requestDetail" && (
          <>
            <div className="request-linkage">
              <strong>Linked workpaper</strong>
              <span>{requestLinkage(state, req)}</span>
            </div>
            <Field n="title" l="Request title" v={req?.title} required />
            <label>
              Description
              <textarea
                name="description"
                defaultValue={req?.description}
                required
              />
            </label>
            <Field
              n="dueDate"
              l="Due date"
              type="date"
              v={req?.dueDate}
              required
            />
            <Select
              n="status"
              l="Status"
              v={req?.status}
              o={["AWAITING_CLIENT", "OVERDUE", "RECEIVED"]}
            />
            <div className="request-thread">
              <h3>Secure conversation</h3>
              {thread.map((c) => (
                <div key={c.id}>
                  <strong>{c.authorName}</strong>
                  <p>{c.body}</p>
                  <small>{fmtTime(c.createdAt)}</small>
                </div>
              ))}
              {!thread.length && <p>No replies have been recorded.</p>}
            </div>
            <label>
              Reply to client
              <textarea
                name="reply"
                placeholder="Write a secure reply to this request."
              />
            </label>
            <div className="dialog-documents">
              <h3>Client attachments</h3>
              {state.documents
                .filter((d) => d.requestId === req?.id)
                .map((d) => (
                  <a key={d.id} href={`/api/files?id=${d.id}`}>
                    <Download />
                    {d.fileName}
                    <small>{Math.ceil(d.byteSize / 1024)} KB</small>
                  </a>
                ))}
              {!state.documents.some((d) => d.requestId === req?.id) && (
                <p>No attachments received.</p>
              )}
            </div>
          </>
        )}
        {dialog.kind === "review" && (
          <>
            <label>
              Workpaper
              <select name="taskId">
                <option value="">Engagement level</option>
                {state.tasks
                  .filter((t) => t.engagementId === active!.id)
                  .map((t) => (
                    <option value={t.id} key={t.id}>
                      Task {t.direction}: {t.title}
                    </option>
                  ))}
              </select>
            </label>
            <Field n="title" l="Review point title" required />
            <label>
              Review point
              <textarea name="body" required />
            </label>
            <Select
              n="severity"
              l="Severity"
              o={["LOW", "MEDIUM", "HIGH"]}
              v="MEDIUM"
            />
          </>
        )}
        {dialog.kind === "clear" && (
          <label>
            Clearance response
            <textarea
              name="response"
              required
              placeholder="Record how the point was resolved and the evidence reviewed."
            />
          </label>
        )}
        {dialog.kind === "team" && (
          <>
            <Field n="name" l="Name" required />
            <Field n="email" l="Email" type="email" required />
            <Select
              n="role"
              l="Role"
              o={["PREPARER", "REVIEWER", "INDEPENDENT_EXAMINER"]}
            />
          </>
        )}
        {dialog.kind === "clientUser" && (
          <>
            <Field n="name" l="User name" required />
            <Field n="email" l="Email" type="email" required />
            <Select
              n="role"
              l="Portal role"
              o={["PORTAL_ADMIN", "CONTRIBUTOR", "READ_ONLY"]}
            />
          </>
        )}
        {dialog.kind === "task" && (
          <>
            <Field n="title" l="Task title" required />
            <Select
              n="phase"
              l="Work programme phase"
              o={["Acceptance", "Planning", "Fieldwork", "Completion"]}
            />
            <label>
              Objective
              <textarea name="objective" required />
            </label>
            <label>
              Relevant guidance
              <textarea
                name="guidance"
                required
                placeholder="State the regulatory or practice guidance that applies."
              />
            </label>
            <label>
              Procedures, one per line
              <textarea
                name="procedures"
                required
                placeholder={
                  "Obtain supporting evidence\nPerform the required check\nDocument the conclusion"
                }
              />
            </label>
          </>
        )}
        <button className="primary">
          <Check />
          Save record
        </button>
      </form>
    </Modal>
  );
}

function GovernancePersonDialog({
  dialog,
  close,
  mutate,
  notify,
}: {
  dialog: NonNullable<Dialog>;
  close: () => void;
  mutate: Mutate;
  notify: Notify;
}) {
  const editing = dialog.kind === "editTrustee",
    person = editing ? (dialog.data as Trustee) : undefined,
    client = editing ? undefined : (dialog.data as Client);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget).entries());
    await handleUiAction(async () => {
      await mutate(
        editing ? "updateTrustee" : "addTrustee",
        editing
          ? { ...values, trusteeId: person!.id }
          : { ...values, clientId: client!.id },
      );
      close();
      notify("Governance register updated");
    });
  };
  return (
    <Modal
      title={editing ? "Edit trustee or officer" : "Add trustee or officer"}
      close={close}
    >
      <form className="modal-form" onSubmit={submit}>
        <Select
          n="personType"
          l="Capacity"
          o={["TRUSTEE", "OFFICER", "BOTH"]}
          v={person?.personType ?? "TRUSTEE"}
        />
        <Field n="name" l="Full name" v={person?.name} required />
        <Field
          n="email"
          l="Email"
          type="email"
          v={person?.email ?? undefined}
        />
        <Field
          n="role"
          l="Role or office title"
          v={person?.role ?? ""}
          required
        />
        <Field
          n="appointmentDate"
          l="Appointment or start date"
          type="date"
          v={person?.appointmentDate ?? undefined}
        />
        <Field
          n="resignationDate"
          l="Termination or cessation date"
          type="date"
          v={person?.resignationDate ?? undefined}
        />
        <Select
          n="status"
          l="Status"
          o={["ACTIVE", "CEASED"]}
          v={person?.status ?? "ACTIVE"}
        />
        <p className="form-guidance">
          A cessation date is mandatory where the person is no longer active.
          Historical records remain in the permanent governance register.
        </p>
        <button className="primary">
          <Check />
          Save governance record
        </button>
      </form>
    </Modal>
  );
}

function Breadcrumbs({
  view,
  client,
  engagement,
  task,
  clientSection,
  goPortfolio,
  goClients,
  goClient,
  goEngagement,
}: {
  view: View;
  client: Client;
  engagement: Engagement;
  task?: Task;
  clientSection: ClientSection;
  goPortfolio: () => void;
  goClients: () => void;
  goClient: () => void;
  goEngagement: () => void;
}) {
  const sectionLabels: Record<ClientSection, string> = {
    permanent: "Permanent file",
    annual: "Annual files",
    governance: "Governance & access",
  };
  const viewLabels: Partial<Record<View, string>> = {
    requests: "Client requests",
    review: "Review centre",
    concerns: "Findings & concerns",
    reporting: "Reporting",
    team: "Team",
    templates: "Templates",
    audit: "Audit trail",
    admin: "Administration",
  };
  const crumbs: { label: string; action?: () => void }[] = [
    {
      label: "Portfolio",
      action: view === "portfolio" ? undefined : goPortfolio,
    },
  ];
  if (view === "clients")
    crumbs.push(
      { label: "Clients", action: goClients },
      { label: client.name, action: goClient },
      { label: sectionLabels[clientSection] },
    );
  else if (view === "engagement")
    crumbs.push(
      { label: "Clients", action: goClients },
      { label: client.name, action: goClient },
      {
        label: `Year ended ${fmtDate(engagement.periodEnd)}`,
        action: goEngagement,
      },
      ...(task
        ? [{ label: `${regulatoryUnit(engagement.jurisdiction)} ${task.direction}: ${task.title}` }]
        : []),
    );
  else if (
    view === "requests" ||
    view === "review" ||
    view === "concerns" ||
    view === "reporting"
  )
    crumbs.push(
      { label: "Clients", action: goClients },
      { label: client.name, action: goClient },
      {
        label: `Year ended ${fmtDate(engagement.periodEnd)}`,
        action: goEngagement,
      },
      { label: viewLabels[view] ?? label(view) },
    );
  else if (view !== "portfolio")
    crumbs.push({ label: viewLabels[view] ?? label(view) });
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {crumbs.map((crumb, index) => (
        <span key={`${crumb.label}-${index}`}>
          {index > 0 && <ChevronRight />}
          {crumb.action ? (
            <button onClick={crumb.action}>{crumb.label}</button>
          ) : (
            <strong aria-current="page">{crumb.label}</strong>
          )}
        </span>
      ))}
    </nav>
  );
}
function Side({
  active,
  icon,
  text,
  click,
}: {
  active: boolean;
  icon: React.ReactNode;
  text: string;
  click: () => void;
}) {
  return (
    <button className={active ? "active" : ""} onClick={click}>
      {icon}
      <span>{text}</span>
    </button>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.currentTarget === e.target && close()}
    >
      <section className="modal-card" role="dialog" aria-modal="true">
        <header>
          <h2>{title}</h2>
          <button aria-label="Close" onClick={close}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Float({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <aside className="floating-panel" onClick={(e) => e.stopPropagation()}>
      <header>
        <strong>{title}</strong>
        <button onClick={close}>
          <X />
        </button>
      </header>
      {children}
    </aside>
  );
}
function Field({
  n,
  l,
  type = "text",
  required = false,
  v,
}: {
  n: string;
  l: string;
  type?: string;
  required?: boolean;
  v?: string;
}) {
  return (
    <label>
      {l}
      <input name={n} type={type} required={required} defaultValue={v} />
    </label>
  );
}
function Select({
  n,
  l,
  o,
  v,
}: {
  n: string;
  l: string;
  o: string[];
  v?: string;
}) {
  return (
    <label>
      {l}
      <select name={n} defaultValue={v}>
        {o.map((x) => (
          <option value={x} key={x}>
            {x.includes(" ") || x.includes("(") ? x : label(x)}
          </option>
        ))}
      </select>
    </label>
  );
}
function EngSelect({
  state,
  value,
  change,
}: {
  state: AppState;
  value: PublicId;
  change: (id: PublicId) => void;
}) {
  return (
    <label className="engagement-select">
      Engagement
      <select value={value} onChange={(e) => change(e.target.value)}>
        {state.engagements.map((e) => (
          <option value={e.id} key={e.id}>
            {e.clientName} · {fmtDate(e.periodEnd)}
          </option>
        ))}
      </select>
    </label>
  );
}
function Page({
  eye,
  title,
  desc,
  action,
  children,
}: {
  eye: string;
  title: string;
  desc: string;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{eye}</p>
          <h1>{title}</h1>
          <p>{desc}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
function Stat({
  c,
  icon,
  l,
  v,
  n,
}: {
  c: string;
  icon: React.ReactNode;
  l: string;
  v: string;
  n: string;
}) {
  return (
    <article>
      <span className={`stat-icon ${c}`}>{icon}</span>
      <span className="stat-copy">
        <small>{l}</small>
        <strong>{v}</strong>
        <em>{n}</em>
      </span>
    </article>
  );
}
function Gate({
  pass,
  title,
  note,
  action,
}: {
  pass: boolean;
  title: string;
  note: string;
  action?: () => void;
}) {
  return (
    <button
      className={pass ? "gate passed" : "gate"}
      onClick={action}
      disabled={!action}
    >
      {pass ? <CheckCircle2 /> : <LockKeyhole />}
      <span>
        <strong>{title}</strong>
        <small>{note}</small>
      </span>
      {action && <span className="gate-action">Change</span>}
    </button>
  );
}
function Status({ s }: { s: string }) {
  return s === "REVIEWED" ? (
    <CheckCircle2 className="status reviewed" />
  ) : s === "PREPARED" ? (
    <CheckCircle2 className="status prepared" />
  ) : s === "IN_PROGRESS" ? (
    <span className="status-progress" />
  ) : (
    <Circle className="status" />
  );
}
function Template({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="template-row">
      {icon}
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span>ACTIVE</span>
    </div>
  );
}
function Note({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="control-note">
      {icon}
      <p>
        <strong>{title}</strong>
        {text}
      </p>
    </div>
  );
}
function configuredEligibility(
  state: AppState,
  engagement: Engagement,
  overrides: {
    governingDocumentAudit?: boolean;
    funderAudit?: boolean;
    commissionAudit?: boolean;
    groupAccountsRequired?: boolean;
  },
) {
  const jurisdiction = state.jurisdictions.find(
      (item) => item.code === engagement.jurisdiction,
    ),
    pinned = state.jurisdictionRuleSets.find(
      (item) => item.id === engagement.jurisdictionRuleSetId,
    ),
    applicable = state.jurisdictionRuleSets
      .filter((item) => {
        const applicableDate =
          item.effectiveDateBasis === "PERIOD_START"
            ? (engagement.periodStart ?? engagement.periodEnd)
            : engagement.periodEnd;
        return (
          item.jurisdictionId === jurisdiction?.id &&
          item.status === "PUBLISHED" &&
          item.effectiveFrom <= applicableDate &&
          (!item.effectiveTo || item.effectiveTo >= applicableDate)
        );
      })
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0],
    rule = pinned ?? applicable;
  if (!jurisdiction || !rule)
    return assessEligibility(
      engagement.periodEnd,
      engagement.grossIncome,
      engagement.grossAssets,
      overrides,
    );
  return assessConfiguredEligibility(
    engagement.periodEnd,
    engagement.grossIncome,
    engagement.grossAssets,
    {
      ...rule,
      jurisdictionName: jurisdiction.name,
      accountingBasis: engagement.accountingBasis,
      periodStart: engagement.periodStart,
    },
    overrides,
  );
}
function money(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}
function requestLinkage(state: AppState, request?: EvidenceRequest) {
  if (!request) return "Engagement level";
  const task = state.tasks.find((t) => t.id === request.taskId);
  const procedure = state.procedures.find((p) => p.id === request.procedureId);
  if (task && procedure)
    return `Procedure ${task.direction}.${procedure.sequence}: ${procedure.text}`;
  if (task) {
    const engagement = state.engagements.find(
      (item) => item.id === task.engagementId,
    );
    return `${regulatoryUnit(engagement?.jurisdiction)} ${task.direction}: ${task.title}`;
  }
  return "Engagement level";
}
function dialogTitle(k: NonNullable<Dialog>["kind"]) {
  return (
    {
      client: "New client",
      editClient: "Edit client",
      engagement: "New engagement",
      editEngagement: "Edit engagement",
      request: "New evidence request",
      requestDetail: "Evidence request and replies",
      review: "Raise review note",
      clear: "Respond and clear review note",
      team: "Add team member",
      trustee: "Add trustee or officer",
      editTrustee: "Edit trustee or officer",
      clientUser: "Add client portal user",
      task: "Create workpaper task",
      help: "Help",
    }[k] ?? "Record"
  );
}
function reportSummary(v: string) {
  return (
    (
      {
        UNMODIFIED:
          "No material matters have been identified for inclusion in the examiner’s statement.",
        RECORDS_CONCERN:
          "A material accounting-records concern will be included in the examiner’s statement.",
        ACCOUNTS_CONCERN:
          "A material accounts-compliance concern will be included in the examiner’s statement.",
        OTHER_MATTER: "Another matter will be drawn to readers’ attention.",
      } as Record<string, string>
    )[v] ?? ""
  );
}
function label(v: string) {
  return v
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function regulatoryUnit(jurisdiction?: string) {
  return jurisdiction === "ENGLAND_WALES" ? "Direction" : "Regulatory area";
}
function fmtDate(v: string) {
  return new Date(v + (/T/.test(v) ? "" : "T12:00:00Z")).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short", year: "numeric" },
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
  return v
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
function conversationUnread(state: AppState, threadId: PublicId) {
  const participant = state.conversationParticipants.find(
    (item) =>
      item.threadId === threadId &&
      item.email.toLowerCase() === state.actor.email.toLowerCase(),
  );
  const incoming = state.conversationMessages
    .filter(
      (item) =>
        item.threadId === threadId &&
        item.authorEmail.toLowerCase() !== state.actor.email.toLowerCase(),
    )
    .at(-1);
  return Boolean(
    incoming &&
      (!participant?.lastReadAt || incoming.createdAt > participant.lastReadAt),
  );
}
function progress(s: AppState, id: PublicId) {
  const t = s.tasks.filter((x) => x.engagementId === id);
  if (!t.length) return 0;
  return Math.round(
    (t.reduce(
      (n, x) =>
        n +
        (x.status === "REVIEWED"
          ? 1
          : x.status === "PREPARED"
            ? 0.75
            : x.status === "IN_PROGRESS"
              ? 0.35
              : 0),
      0,
    ) /
      t.length) *
      100,
  );
}
function stageClass(v: string) {
  return v === "FIELDWORK"
    ? "fieldwork"
    : v === "REVIEW"
      ? "review"
      : v === "PLANNING"
        ? "planning"
        : "waiting";
}
