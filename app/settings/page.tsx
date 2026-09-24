"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import StatusPill, { type PillTone } from "@/components/StatusPill";

type Role = "owner" | "admin" | "manager" | "agent" | "viewer";
type RoleInfo = { key: Role; label: string; can: string };
type User = { id: string; email: string; name: string | null; role: Role; is_active: boolean; must_change_password: boolean; last_login_at: string | null; created_at: string };
type Me = { id: string | null; role: Role; personal: boolean };
type Rules = { timezone: string; windowStart: number; windowEnd: number; days: number[]; enforce: boolean };
type Calling = { rules: Rules; summary: string; openNow: boolean; nextOpen: string | null; dncCount: number };
type Dnc = { id: string; phone: string; reason: string | null; source: string; added_by: string | null; created_at: string };
type Event = { id: number; action: string; label: string; user_email: string | null; target_type: string | null; target_id: string | null; detail: any; ip: string | null; created_at: string };

const TABS = [
  { k: "team", l: "Team" },
  { k: "calling", l: "Calling rules" },
  { k: "activity", l: "Activity" },
  { k: "account", l: "My account" },
] as const;
type Tab = (typeof TABS)[number]["k"];

const RANK: Record<Role, number> = { owner: 5, admin: 4, manager: 3, agent: 2, viewer: 1 };
const ROLE_TONE: Record<Role, PillTone> = { owner: "signal", admin: "signal", manager: "warm", agent: "neutral", viewer: "neutral" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIMEZONES = [
  "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Riyadh", "Asia/Karachi", "Asia/Dhaka", "Asia/Jakarta", "Asia/Tokyo",
  "Europe/London", "Europe/Berlin", "Europe/Paris", "Africa/Lagos", "Africa/Nairobi", "Africa/Johannesburg",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Sao_Paulo", "Australia/Sydney",
];

const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromHHMM = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
function ago(iso: string | null) {
  if (!iso) return "Never";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return "Just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const card = "bg-raised border border-line rounded-[12px]";
const btn = "rounded-lg px-3.5 py-2 text-[13px] font-semibold disabled:opacity-50";
const input = "border border-line rounded-lg px-3 py-2 text-[13.5px] bg-raised outline-none focus:border-ink-soft";

function Banner({ tone, children, onClose }: { tone: "ok" | "err"; children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className={`text-[12.5px] rounded-lg px-3 py-2.5 flex items-start gap-3 ${tone === "ok" ? "bg-signal-tint text-signal" : "bg-miss-tint text-miss"}`}>
      <div className="flex-1">{children}</div>
      {onClose && <button onClick={onClose} className="font-semibold opacity-70" aria-label="Dismiss">×</button>}
    </div>
  );
}

/* ── Team ── */
function TeamTab({ me }: { me: Me }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [err, setErr] = useState("");
  const [secret, setSecret] = useState<{ email: string; password: string; kind: "invite" | "reset" } | null>(null);
  const [form, setForm] = useState({ email: "", name: "", role: "manager" as Role });
  const [busy, setBusy] = useState<string | null>(null);
  const canManage = RANK[me.role] >= RANK.admin;

  async function load() {
    try { const d = await api("/api/team"); setUsers(d.users); setRoles(d.roles); setErr(""); } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault(); setBusy("invite"); setErr("");
    try {
      const d = await api("/api/team", { method: "POST", body: JSON.stringify(form) });
      setSecret({ email: d.user.email, password: d.tempPassword, kind: "invite" });
      setForm({ email: "", name: "", role: form.role }); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  async function change(u: User, body: any) {
    setBusy(u.id); setErr("");
    try {
      const d = await api(`/api/team/${u.id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (d.tempPassword) setSecret({ email: u.email, password: d.tempPassword, kind: "reset" });
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  const assignable = roles.filter((r) => RANK[r.key] <= RANK[me.role]);

  return (
    <div className="flex flex-col gap-4">
      {!me.personal && (
        <Banner tone="err">You're signed in with your company's shared login. Sign out and back in once — it becomes your personal Owner account, and then you can invite your team.</Banner>
      )}
      {err && <Banner tone="err" onClose={() => setErr("")}>{err}</Banner>}
      {secret && (
        <div className={`${card} p-4 border-signal`}>
          <div className="text-[13.5px] font-semibold">{secret.kind === "invite" ? "Invite created" : "Password reset"} — share this once</div>
          <div className="text-[12.5px] text-ink-soft mt-1">Send these to {secret.email} privately. They'll be asked to choose their own password when they sign in. We won't show it again.</div>
          <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[13px]">
            <span className="bg-paper rounded-md px-2.5 py-1.5">{secret.email}</span>
            <span className="bg-paper rounded-md px-2.5 py-1.5 tracking-wide">{secret.password}</span>
            <button className={`${btn} border border-line`} onClick={() => navigator.clipboard?.writeText(`Sign in to RANA AI at ${window.location.origin}/login\nEmail: ${secret.email}\nOne-time password: ${secret.password}`)}>Copy invite</button>
            <button className={`${btn} text-ink-soft`} onClick={() => setSecret(null)}>Done</button>
          </div>
        </div>
      )}

      {canManage && me.personal && (
        <form onSubmit={invite} className={`${card} p-4 flex flex-col gap-3`}>
          <div className="text-[14px] font-semibold">Invite a teammate</div>
          <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1fr_auto] gap-2">
            <input className={input} type="email" required placeholder="name@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className={input} placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {assignable.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <button className={`${btn} bg-signal text-white`} disabled={busy === "invite"}>{busy === "invite" ? "Inviting…" : "Invite"}</button>
          </div>
          <div className="text-[12px] text-ink-soft">{roles.find((r) => r.key === form.role)?.can}</div>
        </form>
      )}

      <div className={`${card} overflow-hidden`}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-ink-soft border-b border-line">
              <th className="px-4 py-2.5 font-semibold">Person</th>
              <th className="px-4 py-2.5 font-semibold">Role</th>
              <th className="px-4 py-2.5 font-semibold hidden md:table-cell">Last sign-in</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {users === null && <tr><td colSpan={4} className="px-4 py-6 text-ink-soft">Loading…</td></tr>}
            {users?.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-ink-soft">No personal logins yet.</td></tr>}
            {users?.map((u) => {
              const self = u.id === me.id;
              const editable = canManage && me.personal && !self && RANK[me.role] >= RANK[u.role];
              return (
                <tr key={u.id} className={`border-b border-line last:border-0 ${u.is_active ? "" : "opacity-55"}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{u.name || u.email.split("@")[0]}{self && <span className="text-ink-soft font-normal"> (you)</span>}</div>
                    <div className="text-[12px] text-ink-soft">{u.email}{u.must_change_password && u.is_active ? " · hasn't set a password yet" : ""}{!u.is_active ? " · access removed" : ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    {editable ? (
                      <select className={`${input} py-1.5`} value={u.role} disabled={busy === u.id} onChange={(e) => change(u, { role: e.target.value })}>
                        {assignable.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                    ) : <StatusPill label={roles.find((r) => r.key === u.role)?.label || u.role} tone={ROLE_TONE[u.role]} />}
                  </td>
                  <td className="px-4 py-3 text-ink-soft hidden md:table-cell">{ago(u.last_login_at)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {editable && (
                      <>
                        {u.is_active && <button className={`${btn} text-ink-soft`} disabled={busy === u.id} onClick={() => change(u, { resetPassword: true })}>Reset password</button>}
                        <button className={`${btn} ${u.is_active ? "text-miss" : "text-signal"}`} disabled={busy === u.id}
                          onClick={() => { if (!u.is_active || confirm(`Remove ${u.email}'s access? They'll be signed out right away.`)) change(u, { active: !u.is_active }); }}>
                          {u.is_active ? "Remove access" : "Restore"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={`${card} p-4`}>
        <div className="text-[13px] font-semibold mb-2">What each role can do</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
          {roles.map((r) => <div key={r.key} className="text-[12.5px]"><span className="font-semibold">{r.label}</span> <span className="text-ink-soft">— {r.can}</span></div>)}
        </div>
      </div>
    </div>
  );
}

/* ── Calling rules + do-not-call ── */
function CallingTab({ me }: { me: Me }) {
  const [data, setData] = useState<Calling | null>(null);
  const [draft, setDraft] = useState<Rules | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dnc, setDnc] = useState<Dnc[] | null>(null);
  const [dncTotal, setDncTotal] = useState(0);
  const [q, setQ] = useState("");
  const [paste, setPaste] = useState("");
  const [reason, setReason] = useState("");
  const canEdit = RANK[me.role] >= RANK.admin;
  const canAddDnc = RANK[me.role] >= RANK.agent;
  const canRemoveDnc = RANK[me.role] >= RANK.manager;

  async function load() {
    try { const d = await api<Calling>("/api/settings/calling"); setData(d); setDraft(d.rules); } catch (e: any) { setMsg({ tone: "err", text: e.message }); }
  }
  async function loadDnc(search = q) {
    try { const d = await api(`/api/dnc${search ? `?q=${encodeURIComponent(search)}` : ""}`); setDnc(d.numbers); setDncTotal(d.total); } catch (e: any) { setMsg({ tone: "err", text: e.message }); }
  }
  useEffect(() => { load(); loadDnc(""); }, []);
  useEffect(() => { const t = setTimeout(() => loadDnc(q), 300); return () => clearTimeout(t); }, [q]);

  const dirty = useMemo(() => !!(data && draft && JSON.stringify(data.rules) !== JSON.stringify(draft)), [data, draft]);

  async function save() {
    if (!draft) return;
    setSaving(true); setMsg(null);
    try {
      const d = await api<Calling>("/api/settings/calling", { method: "PATCH", body: JSON.stringify(draft) });
      setData({ ...d, dncCount: data?.dncCount ?? 0 }); setDraft(d.rules); setMsg({ tone: "ok", text: `Saved. Campaigns now only call ${d.summary}.` });
    } catch (e: any) { setMsg({ tone: "err", text: e.message }); } finally { setSaving(false); }
  }
  async function addNumbers(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try {
      const d = await api("/api/dnc", { method: "POST", body: JSON.stringify({ phones: paste, reason }) });
      setPaste(""); setReason("");
      setMsg({ tone: "ok", text: `Added ${d.added} number${d.added === 1 ? "" : "s"}.${d.invalid.length ? ` Skipped ${d.invalid.length} that didn't look like phone numbers.` : ""}` });
      loadDnc();
    } catch (e: any) { setMsg({ tone: "err", text: e.message }); }
  }
  async function remove(phone: string) {
    if (!confirm(`Allow campaigns to call ${phone} again?`)) return;
    try { await api(`/api/dnc?phone=${encodeURIComponent(phone)}`, { method: "DELETE" }); loadDnc(); } catch (e: any) { setMsg({ tone: "err", text: e.message }); }
  }

  if (!data || !draft) return <div className="text-[13px] text-ink-soft">Loading…</div>;
  return (
    <div className="flex flex-col gap-4">
      {msg && <Banner tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Banner>}

      <div className={`${card} p-5 flex flex-col gap-4`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[15px] font-semibold">Calling hours</div>
            <div className="text-[12.5px] text-ink-soft mt-0.5">Campaigns can't start outside these hours. In India, TRAI allows promotional calls 9am–9pm; in the US, 8am–9pm in the person's local time.</div>
          </div>
          <StatusPill label={data.rules.enforce ? (data.openNow ? "Open now" : `Closed · opens ${when(data.nextOpen)}`) : "Not enforced"} tone={data.rules.enforce ? (data.openNow ? "signal" : "warm") : "miss"} />
        </div>

        <fieldset disabled={!canEdit} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-ink-soft">From
            <input type="time" className={input} value={toHHMM(draft.windowStart)} onChange={(e) => setDraft({ ...draft, windowStart: fromHHMM(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-soft">Until
            <input type="time" className={input} value={toHHMM(draft.windowEnd)} onChange={(e) => setDraft({ ...draft, windowEnd: fromHHMM(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-soft">Timezone
            <select className={input} value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}>
              {(TIMEZONES.includes(draft.timezone) ? TIMEZONES : [draft.timezone, ...TIMEZONES]).map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
          </label>
        </fieldset>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => {
            const on = draft.days.includes(i);
            return (
              <button key={d} type="button" disabled={!canEdit} aria-pressed={on}
                onClick={() => setDraft({ ...draft, days: on ? draft.days.filter((x) => x !== i) : [...draft.days, i].sort() })}
                className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-md border ${on ? "bg-ink text-white border-ink" : "border-line text-ink-soft"}`}>{d}</button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" disabled={!canEdit} checked={draft.enforce} onChange={(e) => setDraft({ ...draft, enforce: e.target.checked })} />
          Block campaigns outside these hours
        </label>
        {canEdit ? (
          <div className="flex gap-2">
            <button className={`${btn} bg-signal text-white`} disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save calling hours"}</button>
            {dirty && <button className={`${btn} text-ink-soft`} onClick={() => setDraft(data.rules)}>Undo</button>}
          </div>
        ) : <div className="text-[12px] text-ink-soft">Only admins and owners can change calling hours.</div>}
      </div>

      <div className={`${card} p-5 flex flex-col gap-4`}>
        <div>
          <div className="text-[15px] font-semibold">Do-not-call list <span className="text-ink-soft font-normal">· {dncTotal.toLocaleString("en-IN")}</span></div>
          <div className="text-[12.5px] text-ink-soft mt-0.5">Numbers here are removed from every campaign before dialling. When a caller says &ldquo;don&apos;t call me again&rdquo;, RANA adds them automatically.</div>
        </div>
        {canAddDnc && (
          <form onSubmit={addNumbers} className="flex flex-col gap-2">
            <textarea className={`${input} min-h-[76px] font-mono text-[12.5px]`} placeholder={"Paste numbers — one per line or comma-separated\n+91 98765 43210"} value={paste} onChange={(e) => setPaste(e.target.value)} />
            <div className="flex gap-2 flex-wrap">
              <input className={`${input} flex-1 min-w-[200px]`} placeholder="Reason (optional), e.g. Asked on WhatsApp" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className={`${btn} bg-ink text-white`} disabled={!paste.trim()}>Add to do-not-call</button>
            </div>
          </form>
        )}
        <input className={input} placeholder="Search a number" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="border border-line rounded-lg overflow-hidden">
          {dnc === null && <div className="px-3 py-4 text-[13px] text-ink-soft">Loading…</div>}
          {dnc?.length === 0 && <div className="px-3 py-4 text-[13px] text-ink-soft">{q ? "No match." : "Nobody on the list yet."}</div>}
          {dnc?.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-line last:border-0 text-[13px]">
              <span className="font-mono tabular-nums w-[150px] shrink-0">{d.phone}</span>
              <span className="flex-1 min-w-0 text-ink-soft truncate">{d.reason || (d.source === "caller_request" ? "Asked on a call" : "Added by your team")}</span>
              <StatusPill label={d.source === "caller_request" ? "Caller asked" : d.source === "import" ? "Imported" : "Manual"} tone={d.source === "caller_request" ? "warm" : "neutral"} />
              <span className="text-[12px] text-ink-soft w-[130px] whitespace-nowrap text-right hidden md:block">{when(d.created_at)}</span>
              {canRemoveDnc && <button className="text-[12px] font-semibold text-ink-soft hover:text-miss" onClick={() => remove(d.phone)}>Remove</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Activity ── */
const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", manager: "Manager", agent: "Sales rep", viewer: "Viewer" };
function describe(e: Event): string {
  const d = e.detail || {};
  switch (e.action) {
    case "user_invited": return `${d.email} as ${ROLE_LABEL[d.role] || d.role}`;
    case "user_role_changed": return `${d.email}: ${ROLE_LABEL[d.from] || d.from} → ${ROLE_LABEL[d.to] || d.to}`;
    case "user_deactivated": case "user_reactivated": case "user_password_reset": return d.email || "";
    case "number_provisioned": case "number_imported": return d.number || d.label || "";
    case "number_assigned": return d.scriptId ? "Employee assigned" : "Stopped answering";
    case "number_test_call": return d.to || "";
    case "employee_published": case "employee_deleted": return d.name || "";
    case "campaign_launched": return `${d.name} · ${d.contacts} numbers${d.skippedDnc ? ` · ${d.skippedDnc} skipped (do-not-call)` : ""}${d.scheduledAt ? ` · starts ${when(d.scheduledAt)}` : ""}`;
    case "campaign_cancelled": case "campaign_retried": return d.name || "";
    case "campaign_exported": return `${d.name} · ${d.rows} rows`;
    case "lead_updated": return [d.lead_status && `lead → ${String(d.lead_status).replace(/_/g, " ")}`, d.follow_up !== undefined && `follow-up ${d.follow_up ? "on" : "off"}`, d.notes && "notes edited"].filter(Boolean).join(", ");
    case "dnc_added": return `${d.count} number${d.count === 1 ? "" : "s"}`;
    case "dnc_removed": return e.target_id || "";
    case "calling_rules_changed": return `${d.to}`;
    default: return "";
  }
}

function ActivityTab({ me }: { me: Me }) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  async function load(before?: number) {
    try {
      const d = await api(`/api/audit${before ? `?before=${before}` : ""}`);
      setEvents((prev) => (before && prev ? [...prev, ...d.events] : d.events)); setNext(d.nextBefore);
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { if (RANK[me.role] >= RANK.admin) load(); }, [me.role]);
  if (RANK[me.role] < RANK.admin) return <Banner tone="err">Only admins and owners can see the activity log.</Banner>;
  const groups: Record<string, string[]> = {
    all: [], access: ["login", "login_failed", "password_changed", "user_invited", "user_role_changed", "user_deactivated", "user_reactivated", "user_password_reset"],
    calling: ["campaign_launched", "campaign_cancelled", "campaign_retried", "number_test_call", "calling_rules_changed", "dnc_added", "dnc_removed"],
    setup: ["number_provisioned", "number_imported", "number_released", "number_assigned", "employee_published", "employee_deleted"],
    data: ["campaign_exported", "lead_updated"],
  };
  const shown = (events || []).filter((e) => filter === "all" || groups[filter].includes(e.action));
  return (
    <div className="flex flex-col gap-3">
      {err && <Banner tone="err">{err}</Banner>}
      <div className="flex gap-1 bg-raised border border-line rounded-[9px] p-1 w-fit">
        {[["all", "Everything"], ["access", "Sign-ins & team"], ["calling", "Calling"], ["setup", "Setup"], ["data", "Leads & exports"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-md ${filter === k ? "bg-ink text-white" : "text-ink-soft"}`}>{l}</button>
        ))}
      </div>
      <div className={`${card} overflow-hidden`}>
        {events === null && <div className="px-4 py-6 text-[13px] text-ink-soft">Loading…</div>}
        {events && shown.length === 0 && <div className="px-4 py-6 text-[13px] text-ink-soft">Nothing here yet.</div>}
        {shown.map((e) => (
          <div key={e.id} className="flex items-start gap-3 px-4 py-3 border-b border-line last:border-0 text-[13px]">
            <span className="text-[12px] text-ink-soft w-[112px] shrink-0 tabular-nums pt-px">{when(e.created_at)}</span>
            <div className="flex-1 min-w-0">
              <div><span className={`font-semibold ${e.action === "login_failed" ? "text-miss" : ""}`}>{e.label}</span>{describe(e) && <span className="text-ink-soft"> — {describe(e)}</span>}</div>
              <div className="text-[12px] text-ink-soft truncate">{e.user_email || "System"}{e.ip ? ` · ${e.ip}` : ""}</div>
            </div>
          </div>
        ))}
      </div>
      {next && <button className={`${btn} border border-line w-fit`} onClick={() => load(next)}>Load older</button>}
    </div>
  );
}

/* ── My account ── */
function AccountTab({ me, first }: { me: Me; first: boolean }) {
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(first ? { tone: "err", text: "Welcome to RANA AI. Choose your own password to finish setting up your login." } : null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.next !== f.confirm) { setMsg({ tone: "err", text: "The new passwords don't match." }); return; }
    setBusy(true); setMsg(null);
    try {
      await api("/api/account/password", { method: "POST", body: JSON.stringify({ current: f.current, next: f.next }) });
      setF({ current: "", next: "", confirm: "" });
      setMsg({ tone: "ok", text: "Password changed." });
      if (first) setTimeout(() => { window.location.href = "/"; }, 900);
    } catch (e: any) { setMsg({ tone: "err", text: e.message }); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-4 max-w-[460px]">
      {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
      {!me.personal ? (
        <Banner tone="err">You're on the shared company login. Sign out and sign back in once to switch to your personal account.</Banner>
      ) : (
        <form onSubmit={submit} className={`${card} p-5 flex flex-col gap-3`}>
          <div className="text-[15px] font-semibold">Change password</div>
          <input className={input} type="password" autoComplete="current-password" placeholder={first ? "One-time password you were sent" : "Current password"} value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required />
          <input className={input} type="password" autoComplete="new-password" placeholder="New password (10+ characters, letters and numbers)" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required />
          <input className={input} type="password" autoComplete="new-password" placeholder="Type it again" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required />
          <button className={`${btn} bg-signal text-white w-fit`} disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
        </form>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("team");
  const [first, setFirst] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [who, setWho] = useState<{ name: string | null; email: string; roleLabel: string; company: string } | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab");
    if (t && TABS.some((x) => x.k === t)) setTab(t as Tab);
    setFirst(p.get("first") === "1");
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      setMe({ id: d.user?.id ?? null, role: d.user?.role ?? "owner", personal: !!d.user?.personal });
      setWho({ name: d.user?.name ?? null, email: d.user?.email ?? "", roleLabel: d.user?.roleLabel ?? "Owner", company: d.name });
    });
  }, []);
  function go(t: Tab) { setTab(t); const u = new URL(window.location.href); u.searchParams.set("tab", t); u.searchParams.delete("first"); window.history.replaceState(null, "", u); }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="settings" />
      <main className="flex-1 min-w-0 px-6 py-8 lg:px-10 flex flex-col gap-5 max-w-[1040px]">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-[26px] font-semibold m-0">Settings</h1>
            <div className="text-[13px] text-ink-soft mt-1">Who can use RANA for {who?.company || "your company"}, when your employees may call, and a record of every important change.</div>
          </div>
          {who && <div className="text-right text-[12.5px]"><div className="font-semibold">{who.name || who.email}</div><div className="text-ink-soft">{who.roleLabel}</div></div>}
        </div>
        <div className="flex gap-1 bg-raised border border-line rounded-[9px] p-1 w-fit" role="tablist">
          {TABS.map((t) => (
            <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => go(t.k)} className={`text-[13px] font-semibold px-3.5 py-1.5 rounded-md ${tab === t.k ? "bg-ink text-white" : "text-ink-soft"}`}>{t.l}</button>
          ))}
        </div>
        {!me ? <div className="text-[13px] text-ink-soft">Loading…</div> : (
          <>
            {tab === "team" && <TeamTab me={me} />}
            {tab === "calling" && <CallingTab me={me} />}
            {tab === "activity" && <ActivityTab me={me} />}
            {tab === "account" && <AccountTab me={me} first={first} />}
          </>
        )}
      </main>
    </div>
  );
}
