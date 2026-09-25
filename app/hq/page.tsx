"use client";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import HqBilling from "@/components/HqBilling";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const INDUSTRIES: [string, string][] = [["edtech", "Education / coaching"], ["realestate", "Real estate"], ["hospitality", "Clinics, hotels & services"], ["saas", "Software / SaaS"], ["other", "Other"]];

function welcomeText(name: string, email: string, password: string) {
  return `Welcome to RANA AI, ${name}!\n\nSign in: https://rana-ai-roan.vercel.app/login\nEmail: ${email}\nOne-time password: ${password}\n\nYou'll set your own password when you first sign in. Your free trial includes 100 connected minutes for 14 days.`;
}

function Status({ c }: { c: any }) {
  const u = c.usage;
  if (c.status === "suspended") return <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-miss-tint text-miss">Paused</span>;
  if (c.plan === "trial") {
    const over = u?.trialDaysLeft === 0 || (u && u.minutesUsed >= u.minutesIncluded);
    return <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${over ? "bg-miss-tint text-miss" : "bg-hot-tint text-hot"}`}>{over ? "Trial over" : `Trial · ${u?.trialDaysLeft ?? "?"}d left`}</span>;
  }
  return <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-signal-tint text-signal">Paid</span>;
}

export default function HqPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", industry: "edtech", ownerEmail: "", ownerName: "", contactPhone: "", plan: "trial", notes: "" });
  const [busy, setBusy] = useState("");
  const [creds, setCreds] = useState<{ name: string; email: string; password: string } | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch("/api/hq/clients");
    const j = await r.json();
    if (!r.ok) { setErr(j.error || "Couldn't load clients"); return; }
    setData(j);
  }
  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const cs = data?.clients || [];
    const paid = cs.filter((c: any) => c.plan !== "trial" && c.status === "active");
    return {
      clients: cs.length,
      trials: cs.filter((c: any) => c.plan === "trial" && c.status === "active").length,
      paid: paid.length,
      mrr: paid.reduce((s: number, c: any) => s + (data?.plans?.[c.plan]?.pricePerMonth || 0), 0),
      minutes: cs.reduce((s: number, c: any) => s + (c.usage?.minutesUsed || 0), 0),
    };
  }, [data]);

  async function create() {
    setBusy("create"); setMsg("");
    try {
      const r = await fetch("/api/hq/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't create the workspace");
      setCreds({ name: form.name, email: j.owner.email, password: j.owner.password });
      setShowNew(false);
      setForm({ name: "", industry: "edtech", ownerEmail: "", ownerName: "", contactPhone: "", plan: "trial", notes: "" });
      load();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(""); }
  }

  async function patch(id: string, body: any) {
    setBusy(id); setMsg("");
    try {
      const r = await fetch(`/api/hq/clients/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't save");
      setMsg("Saved."); await load();
      setEditing((e: any) => e && e.id === id ? { ...e, ...j.client, usage: j.usage } : e);
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(""); }
  }

  async function act(c: any, action: "reset_owner" | "open") {
    setBusy(c.id + action); setMsg("");
    try {
      const r = await fetch(`/api/hq/clients/${c.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't do that");
      if (action === "open") { window.location.href = j.redirect || "/"; return; }
      setCreds({ name: c.name, email: j.owner.email, password: j.owner.password });
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(""); }
  }

  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); setMsg("Copied."); } catch { setMsg("Select the text and copy it."); } };

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="hq" />
      <div className="flex-1 p-10">
        <div className="max-w-[1120px] flex flex-col gap-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-signal">RANA HQ</div>
              <div className="text-[22px] font-display font-semibold">Client workspaces</div>
              <div className="text-[13px] text-ink-soft mt-0.5">Create a workspace for each company, give the owner a login, run their trial, and set their plan. Only RANA staff see this page.</div>
            </div>
            <div className="flex gap-2">
              <a href="/hq/money" className="border border-line bg-white rounded-lg px-4 py-2 text-[13px] font-semibold" data-testid="hq-money-link">₹ Money</a>
              <button onClick={() => setShowNew(true)} className="bg-signal text-white rounded-lg px-4 py-2 text-[13px] font-semibold" data-testid="hq-new">+ New client</button>
            </div>
          </div>
          {err && <div className="text-[13px] text-miss">{err}</div>}
          {msg && <div className="text-[12.5px] text-ink-soft" data-testid="hq-msg">{msg}</div>}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="hq-totals">
            {[["Clients", totals.clients], ["On trial", totals.trials], ["Paying", totals.paid], ["Plan revenue / month", inr(totals.mrr)], ["Minutes this period", Math.round(totals.minutes).toLocaleString("en-IN")]].map(([k, v]) => (
              <div key={k as string} className="border border-line rounded-xl bg-white px-4 py-3">
                <div className="text-[11.5px] text-ink-soft">{k}</div>
                <div className="text-[20px] font-display font-semibold tabular-nums">{v}</div>
              </div>
            ))}
          </div>

          <div className="border border-line rounded-xl bg-white overflow-x-auto">
            <table className="w-full text-[13px] min-w-[900px]" data-testid="hq-table">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-soft border-b border-line">
                  <th className="px-4 py-3">Company</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Minutes</th><th className="px-4 py-3">Employees</th><th className="px-4 py-3">Team</th><th className="px-4 py-3">Last sign-in</th><th className="px-4 py-3">Number</th><th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {!data && <tr><td className="px-4 py-4 text-ink-soft" colSpan={9}>Loading…</td></tr>}
                {data && !data.clients.length && <tr><td className="px-4 py-4 text-ink-soft" colSpan={9}>No clients yet. Press “New client” to create the first workspace.</td></tr>}
                {(data?.clients || []).map((c: any) => (
                  <tr key={c.id} className="border-b border-line last:border-0 align-top">
                    <td className="px-4 py-3"><div className="font-semibold">{c.name}</div><div className="text-[11.5px] text-ink-soft">{c.owner?.email}</div></td>
                    <td className="px-4 py-3">{data.plans[c.plan]?.name || c.plan}</td>
                    <td className="px-4 py-3"><Status c={c} /></td>
                    <td className="px-4 py-3 tabular-nums">{Math.round(c.usage?.minutesUsed || 0)} / {(c.usage?.minutesIncluded || 0).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3">{c.published}/{c.employees} live</td>
                    <td className="px-4 py-3">{c.teamSize}</td>
                    <td className="px-4 py-3 text-ink-soft">{ago(c.lastLogin)}</td>
                    <td className="px-4 py-3 text-ink-soft">{c.number || "Shared"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button onClick={() => setEditing(c)} className="border border-line rounded-lg px-3 py-1.5 text-[12px] font-semibold mr-2" data-testid="hq-manage">Manage</button>
                      <button onClick={() => act(c, "open")} disabled={!!busy} className="bg-ink text-white rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40" data-testid="hq-open">Open workspace</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setShowNew(false)}>
          <div className="w-full max-w-[560px] bg-white rounded-2xl border border-line p-6 flex flex-col gap-3" onClick={(e) => e.stopPropagation()} data-testid="hq-new-form">
            <div className="text-[18px] font-display font-semibold">New client workspace</div>
            <div className="text-[12.5px] text-ink-soft">RANA creates the workspace and a one-time password for the owner. Send it on WhatsApp or email.</div>
            <label className="text-[12px] font-semibold">Company name<input id="hq-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal" placeholder="Sri Chaitanya Hyderabad" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12px] font-semibold">Industry<select id="hq-industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal">{INDUSTRIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="text-[12px] font-semibold">Plan<select id="hq-plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal">{data && Object.values(data.plans).map((p: any) => <option key={p.key} value={p.key}>{p.name}{p.key === "trial" ? " (14 days, 100 min)" : p.pricePerMonth ? ` (${inr(p.pricePerMonth)}/mo)` : ""}</option>)}</select></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12px] font-semibold">Owner's email<input id="hq-email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal" placeholder="owner@company.com" /></label>
              <label className="text-[12px] font-semibold">Owner's name<input id="hq-owner" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal" placeholder="Ravi Kumar" /></label>
            </div>
            <label className="text-[12px] font-semibold">Contact phone (for you)<input id="hq-phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal" placeholder="98765 43210" /></label>
            <label className="text-[12px] font-semibold">Notes<textarea id="hq-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal" rows={2} placeholder="Met at Hyderabad expo; wants Telugu admissions calls" /></label>
            {msg && <div className="text-[12.5px] text-miss">{msg}</div>}
            <div className="flex justify-end gap-2 mt-1">
              <button onClick={() => setShowNew(false)} className="border border-line rounded-lg px-4 py-2 text-[13px] font-semibold">Cancel</button>
              <button onClick={create} disabled={busy === "create"} className="bg-signal text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50" data-testid="hq-create">{busy === "create" ? "Creating…" : "Create workspace"}</button>
            </div>
          </div>
        </div>
      )}

      {creds && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-[520px] bg-white rounded-2xl border border-line p-6 flex flex-col gap-3" data-testid="hq-creds">
            <div className="text-[18px] font-display font-semibold">Login for {creds.name}</div>
            <div className="text-[12.5px] text-ink-soft">This password is shown only once. The owner sets their own password when they first sign in.</div>
            <pre className="bg-paper border border-line rounded-lg p-3 text-[12.5px] whitespace-pre-wrap select-all">{welcomeText(creds.name, creds.email, creds.password)}</pre>
            <div className="flex justify-end gap-2">
              <button onClick={() => copy(welcomeText(creds.name, creds.email, creds.password))} className="border border-line rounded-lg px-4 py-2 text-[13px] font-semibold">Copy message</button>
              <button onClick={() => setCreds(null)} className="bg-signal text-white rounded-lg px-4 py-2 text-[13px] font-semibold">Done</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/30 flex justify-end z-50" onClick={() => setEditing(null)}>
          <div className="w-full max-w-[460px] bg-white h-full overflow-y-auto p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()} data-testid="hq-drawer">
            <div className="flex items-start justify-between">
              <div><div className="text-[18px] font-display font-semibold">{editing.name}</div><div className="text-[12px] text-ink-soft">{editing.owner?.email} · created {new Date(editing.createdAt).toLocaleDateString("en-IN")}</div></div>
              <button onClick={() => setEditing(null)} className="text-ink-soft text-lg">×</button>
            </div>
            <div className="text-[12.5px] text-ink-soft">{Math.round(editing.usage?.minutesUsed || 0)} of {editing.usage?.minutesIncluded} minutes used this period{editing.usage?.trialEndsAt ? ` · trial ends ${new Date(editing.usage.trialEndsAt).toLocaleDateString("en-IN")}` : ""}.</div>

            <label className="text-[12px] font-semibold">Plan
              <select id="hq-edit-plan" defaultValue={editing.plan} onChange={(e) => patch(editing.id, { plan: e.target.value })} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal">
                {Object.values(data.plans).map((p: any) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            </label>
            {editing.plan === "trial" && (
              <div className="flex gap-2">
                <button onClick={() => patch(editing.id, { extendTrialDays: 7 })} className="border border-line rounded-lg px-3 py-1.5 text-[12px] font-semibold">Extend trial 7 days</button>
                <button onClick={() => patch(editing.id, { minutes: (editing.usage?.minutesIncluded || 100) + 100 })} className="border border-line rounded-lg px-3 py-1.5 text-[12px] font-semibold">+100 trial minutes</button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {[["minutes", "Minutes per period", editing.overrides?.minutes], ["employees", "Employees", editing.overrides?.employees], ["concurrency", "Calls at once", editing.overrides?.concurrency], ["campaignSize", "Numbers per campaign", editing.overrides?.campaignSize]].map(([k, l, v]) => (
                <label key={k as string} className="text-[12px] font-semibold">{l}
                  <input id={`hq-edit-${k}`} defaultValue={v ?? ""} placeholder="Plan default" onBlur={(e) => { if (e.target.value !== String(v ?? "")) patch(editing.id, { [k as string]: e.target.value }); }} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal" />
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[13px]"><input id="hq-edit-overage" type="checkbox" defaultChecked={!!editing.overrides?.allowOverage} onChange={(e) => patch(editing.id, { allowOverage: e.target.checked })} /> Keep calling past the limit (bill overage)</label>
            <label className="text-[12px] font-semibold">Their own calling number (Sarvam)
              <input id="hq-edit-number" defaultValue={editing.number || ""} placeholder="+914012345678 — empty = shared RANA number" onBlur={(e) => { if (e.target.value !== (editing.number || "")) patch(editing.id, { number: e.target.value }); }} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal" />
              <span className="block text-[11px] font-normal text-ink-soft mt-1">Add the number to the Vobiz connection in Sarvam first, then enter it here.</span>
            </label>
            <label className="text-[12px] font-semibold">Notes
              <textarea id="hq-edit-notes" defaultValue={editing.notes || ""} onBlur={(e) => { if (e.target.value !== (editing.notes || "")) patch(editing.id, { notes: e.target.value }); }} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal" rows={3} />
            </label>
            <HqBilling clientId={editing.id} onChanged={load} />
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <button onClick={() => act(editing, "open")} className="bg-ink text-white rounded-lg px-3 py-2 text-[12.5px] font-semibold">Open workspace</button>
              <button onClick={() => act(editing, "reset_owner")} className="border border-line rounded-lg px-3 py-2 text-[12.5px] font-semibold">New owner password</button>
              {editing.status === "suspended"
                ? <button onClick={() => patch(editing.id, { status: "active" })} className="border border-signal/40 text-signal rounded-lg px-3 py-2 text-[12.5px] font-semibold">Turn calling back on</button>
                : <button onClick={() => patch(editing.id, { status: "suspended" })} className="border border-miss/40 text-miss rounded-lg px-3 py-2 text-[12.5px] font-semibold" data-testid="hq-pause">Pause calling</button>}
            </div>
            {msg && <div className="text-[12.5px] text-ink-soft">{msg}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
