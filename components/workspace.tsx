"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bell, BookOpenCheck, Building2, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, ClipboardCheck, Clock3, FileCheck2, FileText, FolderOpen, HelpCircle, LayoutDashboard, LockKeyhole, MessageSquare, MoreHorizontal, Plus, Search, Send, ShieldCheck, Users, X } from "lucide-react";
import { Logo } from "./logo";
import { directions, initialStatuses, type Direction, type Status } from "@/lib/work-programme";

type View = "portfolio" | "engagement" | "requests" | "review" | "reporting";
type RequestRow = { id: string; title: string; owner: string; due: string; status: "Received" | "Awaiting client" | "Overdue" };

const nav = [
  { id: "portfolio" as View, label: "Portfolio", icon: LayoutDashboard },
  { id: "engagement" as View, label: "Engagements", icon: BookOpenCheck },
  { id: "requests" as View, label: "Client requests", icon: Send, count: 5 },
  { id: "review" as View, label: "Review", icon: ClipboardCheck, count: 3 },
  { id: "reporting" as View, label: "Reporting", icon: FileCheck2 }
];

const startingRequests: RequestRow[] = [
  { id: "REQ-018", title: "Restricted funds reconciliation", owner: "Sarah Whitfield", due: "18 Aug 2026", status: "Awaiting client" },
  { id: "REQ-017", title: "Trustee declarations and interests", owner: "James Okoro", due: "15 Aug 2026", status: "Overdue" },
  { id: "REQ-016", title: "July bank statement and reconciliation", owner: "Sarah Whitfield", due: "20 Aug 2026", status: "Received" },
  { id: "REQ-015", title: "Grant agreement: Community Futures", owner: "Sarah Whitfield", due: "12 Aug 2026", status: "Received" }
];

export function Workspace() {
  const [view, setView] = useState<View>("portfolio");
  const [selected, setSelected] = useState<Direction>(directions[5]);
  const [statuses, setStatuses] = useState<Record<number, Status>>(initialStatuses);
  const [requests, setRequests] = useState(startingRequests);
  const [toast, setToast] = useState("");
  const [comment, setComment] = useState("");

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function addRequest() {
    setRequests(current => [{ id: `REQ-${String(current.length + 19).padStart(3, "0")}`, title: "New evidence request", owner: "Sarah Whitfield", due: "22 Aug 2026", status: "Awaiting client" }, ...current]);
    notify("Request created and shared with the client portal");
  }

  const completion = useMemo(() => Math.round(Object.values(statuses).reduce((sum, status) => sum + (status === "Reviewed" ? 1 : status === "Prepared" ? .75 : status === "In progress" ? .35 : 0), 0) / 13 * 100), [statuses]);

  return <div className="app-shell">
    <aside className="sidebar">
      <Logo inverse />
      <button className="organisation-switch"><span className="org-avatar">DO</span><span><small>Organisation</small>D O&apos;Higgins & Co</span><ChevronDown size={16} /></button>
      <nav aria-label="Main navigation">
        <p className="nav-label">WORKSPACE</p>
        {nav.map(item => <button key={item.id} onClick={() => setView(item.id)} className={view === item.id ? "active" : ""}><item.icon size={19} /><span>{item.label}</span>{item.count && <b>{item.count}</b>}</button>)}
        <p className="nav-label lower">MANAGE</p>
        <button><Building2 size={19} /><span>Clients</span></button>
        <button><Users size={19} /><span>Team</span></button>
        <button><FolderOpen size={19} /><span>Templates</span></button>
      </nav>
      <div className="sidebar-foot"><ShieldCheck size={18} /><span><strong>Control framework</strong><small>CC32 · England & Wales</small></span></div>
      <div className="user-card"><span className="avatar">DO</span><span><strong>Dennis O&apos;Higgins</strong><small>Independent Examiner</small></span><MoreHorizontal size={18} /></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="search"><Search size={18} /><input aria-label="Search" placeholder="Search engagements, clients or workpapers" /><kbd>⌘ K</kbd></div><div className="top-actions"><button aria-label="Help"><HelpCircle size={20} /></button><button aria-label="Notifications" className="notification"><Bell size={20} /><i /></button><Link href="/client" className="portal-link"><LockKeyhole size={16} /> Client portal</Link></div></header>
      {view === "portfolio" && <Portfolio onOpen={() => setView("engagement")} completion={completion} />}
      {view === "engagement" && <Engagement selected={selected} setSelected={setSelected} statuses={statuses} setStatuses={setStatuses} notify={notify} comment={comment} setComment={setComment} />}
      {view === "requests" && <Requests rows={requests} onAdd={addRequest} />}
      {view === "review" && <Review notify={notify} />}
      {view === "reporting" && <Reporting completion={completion} notify={notify} />}
    </main>
    {toast && <div className="toast"><CheckCircle2 size={19} />{toast}</div>}
  </div>;
}

function Portfolio({ onOpen, completion }: { onOpen: () => void; completion: number }) {
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">SATURDAY, 15 AUGUST 2026</p><h1>Good afternoon, Dennis</h1><p>Here is the current position across your examination portfolio.</p></div><button className="primary"><Plus size={18} /> New engagement</button></div>
    <section className="stat-grid">
      <article><span className="stat-icon blue"><BookOpenCheck /></span><div><small>Active engagements</small><strong>8</strong><em>3 reporting this month</em></div></article>
      <article><span className="stat-icon amber"><Clock3 /></span><div><small>Awaiting client</small><strong>5</strong><em>2 requests overdue</em></div></article>
      <article><span className="stat-icon purple"><ClipboardCheck /></span><div><small>Ready for review</small><strong>3</strong><em>12 workpapers prepared</em></div></article>
      <article><span className="stat-icon green"><CheckCircle2 /></span><div><small>Completed this year</small><strong>14</strong><em>All reports filed</em></div></article>
    </section>
    <div className="content-grid"><section className="panel engagements"><div className="panel-title"><div><h2>Active engagements</h2><p>Examinations requiring attention</p></div><button>View all <ChevronRight size={16} /></button></div>
      <div className="table-head"><span>CHARITY</span><span>YEAR END</span><span>STAGE</span><span>PROGRESS</span><span>OWNER</span><span /></div>
      <button className="engagement-row" onClick={onOpen}><span className="charity-cell"><i className="charity-logo willow">W</i><span><strong>Willow Community Foundation</strong><small>Charity no. 1187421</small></span></span><span>31 Mar 2026</span><span><b className="stage fieldwork">Fieldwork</b></span><span className="progress-cell"><i><b style={{ width: `${completion}%` }} /></i><small>{completion}%</small></span><span className="owner-stack"><i>DO</i><i>JM</i></span><ChevronRight size={17} /></button>
      <button className="engagement-row"><span className="charity-cell"><i className="charity-logo harbour">H</i><span><strong>Harbour Youth Trust</strong><small>Charity no. 1162089</small></span></span><span>30 Apr 2026</span><span><b className="stage review">Review</b></span><span className="progress-cell"><i><b style={{ width: "86%" }} /></i><small>86%</small></span><span className="owner-stack"><i>DO</i></span><ChevronRight size={17} /></button>
      <button className="engagement-row"><span className="charity-cell"><i className="charity-logo oak">O</i><span><strong>Oakfield Arts Collective</strong><small>Charity no. 1200194</small></span></span><span>31 May 2026</span><span><b className="stage planning">Planning</b></span><span className="progress-cell"><i><b style={{ width: "24%" }} /></i><small>24%</small></span><span className="owner-stack"><i>DO</i><i>SK</i></span><ChevronRight size={17} /></button>
      <button className="engagement-row"><span className="charity-cell"><i className="charity-logo beacon">B</i><span><strong>Beacon Wellbeing CIO</strong><small>Charity no. 1193450</small></span></span><span>30 Jun 2026</span><span><b className="stage waiting">Client input</b></span><span className="progress-cell"><i><b style={{ width: "41%" }} /></i><small>41%</small></span><span className="owner-stack"><i>JM</i></span><ChevronRight size={17} /></button>
    </section>
    <aside className="panel attention"><div className="panel-title"><div><h2>Requires attention</h2><p>Prioritised control items</p></div></div>
      <div className="attention-item"><span className="alert red">!</span><div><strong>Overdue client response</strong><p>Trustee declarations · Willow Community Foundation</p><small>Due yesterday</small></div></div>
      <div className="attention-item"><span className="alert amber"><MessageSquare /></span><div><strong>Review note assigned</strong><p>WP 6.2 · Bank reconciliation difference</p><small>Due 17 Aug</small></div></div>
      <div className="attention-item"><span className="alert blue"><FileText /></span><div><strong>Report ready to finalise</strong><p>Harbour Youth Trust · 30 April 2026</p><small>Trustee approval received</small></div></div>
    </aside></div>
  </div>;
}

function Engagement({ selected, setSelected, statuses, setStatuses, notify, comment, setComment }: { selected: Direction; setSelected: (d: Direction) => void; statuses: Record<number, Status>; setStatuses: React.Dispatch<React.SetStateAction<Record<number, Status>>>; notify: (m: string) => void; comment: string; setComment: (v: string) => void }) {
  const groups = ["Acceptance", "Planning", "Fieldwork", "Completion"] as const;
  return <div className="engagement-page"><div className="engagement-banner"><div><button className="back">Portfolio</button><span>/</span><strong>Willow Community Foundation</strong></div><div className="banner-actions"><span className="autosave"><Check size={14} /> All changes saved</span><button className="secondary"><MessageSquare size={16} /> 3 review notes</button><button className="primary" onClick={() => notify("Engagement moved to review queue")}>Send for review</button></div></div>
    <div className="engagement-title"><span className="charity-logo willow big">W</span><div><h1>Willow Community Foundation</h1><p>Year ended 31 March 2026 · Charity no. 1187421 · Accruals accounts</p></div><span className="risk-chip">Standard risk</span></div>
    <div className="workspace-grid"><aside className="programme"><div className="programme-head"><span>CC32 WORK PROGRAMME</span><b>13 directions</b></div>{groups.map(group => <div className="phase" key={group}><h3>{group}<span>{directions.filter(d => d.phase === group && statuses[d.id] === "Reviewed").length}/{directions.filter(d => d.phase === group).length}</span></h3>{directions.filter(d => d.phase === group).map(d => <button key={d.id} onClick={() => setSelected(d)} className={selected.id === d.id ? "selected" : ""}><StatusIcon status={statuses[d.id]} /><span><small>DIRECTION {d.id}</small>{d.title}</span>{d.id === 6 && <b className="note-count">1</b>}</button>)}</div>)}</aside>
      <section className="workpaper"><div className="workpaper-head"><div><p>DIRECTION {selected.id} <span>MANDATORY</span></p><h2>{selected.title}</h2><small>Applies to: {selected.applies}</small></div><button className="icon-button"><MoreHorizontal /></button></div>
        <div className="objective"><strong>Objective</strong><p>{selected.objective}</p></div>
        <div className="section-title"><h3>Procedures</h3><span>{selected.procedures.length} procedures</span></div>
        <div className="procedure-list">{selected.procedures.map((p, i) => <label key={p}><input type="checkbox" defaultChecked={i < 2} /><span className="checkbox"><Check /></span><span><strong>{selected.id}.{i + 1}</strong>{p}<small>{i < 2 ? "Completed by Dennis O'Higgins · 14 Aug" : "Procedure not yet completed"}</small></span>{i === 1 && <button aria-label="Evidence"><FileText size={17} /> 2</button>}</label>)}</div>
        <div className="conclusion"><div className="section-title"><h3>Conclusion</h3><span className="required">REQUIRED</span></div><textarea defaultValue={selected.id === 6 ? "The draft accounts agree to the underlying accounting records, subject to clearance of the £1,240 timing difference identified on the March bank reconciliation." : "Record the conclusion reached, significant professional judgements and any exceptions identified."} /><div className="conclusion-meta"><span><ShieldCheck size={15} /> Professional judgement recorded</span><span>436 / 2,000</span></div></div>
        <div className="workpaper-signoff"><div><span className="avatar small">DO</span><p><strong>Prepared by Dennis O&apos;Higgins</strong><small>14 Aug 2026 at 16:42</small></p></div>{statuses[selected.id] === "Reviewed" ? <span className="signed"><CheckCircle2 /> Reviewed</span> : <button className="primary" onClick={() => { setStatuses(s => ({ ...s, [selected.id]: "Prepared" })); notify(`Direction ${selected.id} marked as prepared`); }}><Check size={16} /> Mark prepared</button>}</div>
      </section>
      <aside className="activity"><div className="activity-tabs"><button className="active">Comments <b>2</b></button><button>Evidence <b>3</b></button></div><div className="thread"><div className="thread-item"><span className="avatar reviewer">JM</span><div><p><strong>Joanne Mercer</strong><small>Today, 09:18</small></p><p>Please reconcile the £1,240 variance to the post year-end bank statement and cross-reference the evidence.</p><button>Reply</button></div></div><div className="thread-item"><span className="avatar small">DO</span><div><p><strong>Dennis O&apos;Higgins</strong><small>Today, 10:06</small></p><p>Request raised with Sarah. The statement is due on 20 August.</p></div></div></div><div className="comment-box"><textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment or @mention…" /><div><button><span>+</span></button><button className="send-comment" onClick={() => { if (comment.trim()) { notify("Comment added to the immutable activity record"); setComment(""); } }}><Send size={16} /></button></div></div></aside>
    </div>
  </div>;
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "Reviewed") return <CheckCircle2 className="status reviewed" />;
  if (status === "Prepared") return <CheckCircle2 className="status prepared" />;
  if (status === "In progress") return <span className="status-progress" />;
  return <Circle className="status empty" />;
}

function Requests({ rows, onAdd }: { rows: RequestRow[]; onAdd: () => void }) {
  return <StandardPage eyebrow="CLIENT COLLABORATION" title="Evidence requests" description="Request, receive and retain client evidence within the engagement record." action={<button className="primary" onClick={onAdd}><Plus size={18} /> New request</button>}><div className="panel data-panel"><div className="filters"><button className="active">All <b>{rows.length}</b></button><button>Awaiting client</button><button>Received</button><button>Overdue</button></div><div className="request-table"><div className="request-head"><span>REQUEST</span><span>CONTACT</span><span>DUE DATE</span><span>STATUS</span><span /></div>{rows.map(row => <div className="request-row" key={row.id}><span><i><FileText /></i><span><strong>{row.title}</strong><small>{row.id} · Willow Community Foundation</small></span></span><span>{row.owner}</span><span>{row.due}</span><span><b className={`request-status ${row.status.toLowerCase().replace(" ", "-")}`}>{row.status}</b></span><button><MoreHorizontal /></button></div>)}</div></div></StandardPage>;
}

function Review({ notify }: { notify: (m: string) => void }) {
  return <StandardPage eyebrow="QUALITY CONTROL" title="Review centre" description="Resolve review points and evidence the independent quality review." action={<button className="secondary"><ChevronDown size={16} /> Willow Community Foundation</button>}><div className="review-layout"><div className="panel"><div className="panel-title"><div><h2>Open review notes</h2><p>3 points require resolution before completion</p></div></div>{[
    ["High", "WP 2.1", "Independence declaration", "Please document whether bookkeeping support provided last year creates a self-review threat."],
    ["Medium", "WP 6.2", "Bank reconciliation difference", "Obtain and cross-reference the post year-end statement supporting the timing difference."],
    ["Low", "WP 11.3", "Payroll variance", "Expand the analytical expectation to reflect the April pay award."]
  ].map((n, i) => <div className="review-note" key={n[1]}><span className={`priority p${i}`}>{n[0]}</span><div><p><small>{n[1]}</small><strong>{n[2]}</strong></p><p>{n[3]}</p><div><span className="avatar reviewer">JM</span><small>Joanne Mercer · {i + 1} day ago</small></div></div><button onClick={() => notify(`${n[1]} marked resolved and retained in the audit trail`)}><Check size={16} /> Resolve</button></div>)}</div><aside className="panel review-summary"><h2>Completion controls</h2><div className="donut"><span>77<small>%</small></span></div><p>10 of 13 Directions prepared</p><ul><li><CheckCircle2 /> Eligibility confirmed</li><li><CheckCircle2 /> Independence approved</li><li><Clock3 /> 3 review notes open</li><li><Circle /> Material-significance assessment</li><li><Circle /> Final examiner sign-off</li></ul></aside></div></StandardPage>;
}

function Reporting({ completion, notify }: { completion: number; notify: (m: string) => void }) {
  return <StandardPage eyebrow="COMPLETION AND REPORTING" title="Examiner’s report" description="Conclude the examination and generate controlled report wording." action={<button className="primary" disabled={completion < 100} onClick={() => notify("Final report generated")}>Generate final report</button>}><div className="report-layout"><section className="panel report-preview"><div className="report-bar"><span><FileText /> Draft examiner&apos;s report</span><div><button>Preview</button><button>Export DOCX</button></div></div><article><p className="report-kicker">INDEPENDENT EXAMINER&apos;S REPORT TO THE TRUSTEES OF</p><h2>Willow Community Foundation</h2><p>I report to the charity trustees on my examination of the accounts of the charity for the year ended 31 March 2026.</p><h3>Responsibilities and basis of report</h3><p>As the charity trustees you are responsible for the preparation of the accounts in accordance with the requirements of the Charities Act 2011.</p><p>I report in respect of my examination of the charity&apos;s accounts carried out under section 145 of the Act and in carrying out my examination I have followed all the applicable Directions given by the Charity Commission under section 145(5)(b) of the Act.</p><h3>Independent examiner&apos;s statement</h3><p className="placeholder-copy">Report wording remains controlled until all completion gates have been satisfied.</p></article></section><aside className="panel gates"><h2>Sign-off gates</h2><p>All gates must pass before the report can be signed.</p>{[
    [true, "Directions 1–4", "Acceptance and planning"], [false, "Directions 5–12", "Fieldwork and completion"], [false, "Review notes", "3 unresolved points"], [false, "Material significance", "Assessment required"], [false, "Trustee approval", "Accounts not yet approved"]
  ].map(g => <div className={g[0] ? "gate passed" : "gate"} key={String(g[1])}>{g[0] ? <CheckCircle2 /> : <LockKeyhole />}<span><strong>{g[1]}</strong><small>{g[2]}</small></span></div>)}<div className="warning-box"><ShieldCheck /><p><strong>Signature control</strong>The report date cannot precede trustee approval of the accounts and annual report.</p></div></aside></div></StandardPage>;
}

function StandardPage({ eyebrow, title, description, action, children }: { eyebrow: string; title: string; description: string; action: React.ReactNode; children: React.ReactNode }) {
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>{children}</div>;
}
