"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { qrSvg } from "@/lib/qr";

const field = "mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal";
const ago = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "never");

/** RANA HQ → Team & security: who can see HQ (roles), and your own two-step login. */
export default function HqTeamPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<any>(null);
  const [created, setCreated] = useState<any>(null);
  const [tf, setTf] = useState<any>(null); // two-step status / setup
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/hq/team").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(e.message));
  const loadTf = () => fetch("/api/account/2fa").then((r) => r.json()).then((j) => setTf((x: any) => ({ ...(x || {}), enabled: j.enabled, secret: j.enabled ? null : x?.secret, url: j.enabled ? null : x?.url }))).catch(() => {});
  useEffect(() => { load(); loadTf(); }, []);

  async function add() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/hq/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json(); if (!r.ok) { setErr(j.error); return; }
      setForm(null); setCreated(j); load();
    } finally { setBusy(false); }
  }
  async function patch(userId: string, body: any) {
    const r = await fetch("/api/hq/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, ...body }) });
    const j = await r.json(); if (!r.ok) setErr(j.error); else load();
  }
  async function twoStep(action: string) {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/account/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, code }) });
      const j = await r.json(); if (!r.ok) { setErr(j.error); return; }
      if (action === "start") setTf({ enabled: false, secret: j.secret, url: j.url });
      else { setCode(""); setTf({ enabled: j.enabled }); load(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="hq" />
      <div className="flex-1 p-10">
        <div className="max-w-[980px] flex flex-col gap-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-signal"><Link href="/hq">RANA HQ</Link> · Team &amp; security</div>
            <div className="text-[22px] font-display font-semibold">Who can use RANA HQ</div>
            <div className="text-[13px] text-ink-soft mt-0.5">Give each person only the access their job needs. Every action they take is logged.</div>
          </div>
          {err && <div className="text-[13px] text-miss" data-testid="team-error">{err}</div>}

          <div className="border border-line rounded-xl bg-raised p-5 flex flex-col gap-3" data-testid="twostep">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[15px] font-semibold">Your two-step login {tf?.enabled ? <span className="ml-2 text-[11px] text-signal">ON</span> : <span className="ml-2 text-[11px] text-miss">OFF</span>}</div>
                <div className="text-[12.5px] text-ink-soft">After your password, RANA asks for a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy). Strongly recommended for HQ — it can see every client.</div>
              </div>
              {tf && !tf.enabled && !tf.secret && <button onClick={() => twoStep("start")} disabled={busy} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold shrink-0" data-testid="twostep-start">Turn on</button>}
            </div>
            {tf?.secret && (
              <div className="bg-paper rounded-lg p-4 flex flex-col gap-2 text-[13px]" data-testid="twostep-setup">
                <div>1. In Google Authenticator tap <b>+ → Scan a QR code</b> and scan this:</div>
                {tf.url && <div className="bg-white rounded-lg p-2 w-fit" data-testid="twostep-qr" dangerouslySetInnerHTML={{ __html: qrSvg(tf.url, 184) }} />}
                <div className="text-[12px] text-ink-soft">Can't scan? Choose <b>Enter a setup key</b> instead. Account: <b>RANA AI</b>. Key:</div>
                <div className="font-mono text-[15px] font-semibold select-all bg-raised border border-line rounded-lg px-3 py-2 w-fit" data-testid="twostep-secret">{tf.secret}</div>
                <div className="text-[12px] text-ink-soft">On your phone? <a href={tf.url} className="text-signal font-semibold">Tap here to add it to your app</a>.</div>
                <div>2. Type the 6-digit code the app shows:</div>
                <div className="flex gap-2 items-center">
                  <input id="twostep-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" className="border border-line rounded-lg px-3 py-2 text-[16px] tracking-[0.25em] w-[140px] text-center" placeholder="123456" />
                  <button onClick={() => twoStep("enable")} disabled={busy || code.length !== 6} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50" data-testid="twostep-enable">Turn on</button>
                </div>
              </div>
            )}
            {tf?.enabled && (
              <div className="flex gap-2 items-center text-[12.5px]">
                <span className="text-ink-soft">To turn it off, enter a current code:</span>
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" className="border border-line rounded-lg px-2 py-1 w-[100px] text-center" />
                <button onClick={() => twoStep("disable")} disabled={busy || code.length !== 6} className="border border-line rounded-lg px-3 py-1 font-semibold disabled:opacity-50">Turn off</button>
              </div>
            )}
          </div>

          {d && (
            <div className="border border-line rounded-xl bg-raised overflow-x-auto" data-testid="hq-staff">
              <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                <div className="text-[15px] font-semibold">HQ staff</div>
                <button onClick={() => setForm({ email: "", name: "", role: "ops" })} className="bg-ink text-paper rounded-lg px-3 py-1.5 text-[12.5px] font-semibold" data-testid="staff-add">+ Add person</button>
              </div>
              <table className="w-full text-[13px] min-w-[720px]">
                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-ink-soft border-b border-line"><th className="px-5 py-2">Person</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Two-step</th><th className="px-3 py-2">Last sign-in</th><th className="px-5 py-2"></th></tr></thead>
                <tbody>
                  {d.staff.map((u: any) => (
                    <tr key={u.id} className={`border-b border-line last:border-0 ${u.is_active ? "" : "opacity-50"}`}>
                      <td className="px-5 py-2.5"><div className="font-semibold">{u.name || u.email}{u.me ? " (you)" : ""}</div><div className="text-[11.5px] text-ink-soft">{u.email}</div></td>
                      <td className="px-3 py-2.5">
                        {u.founderByEnv || !u.is_active ? <span className="font-semibold">{d.roles[u.hq_role || "support"]?.label}</span> : (
                          <select value={u.hq_role || "support"} onChange={(e) => patch(u.id, { role: e.target.value })} className="border border-line rounded-lg px-2 py-1 text-[12.5px]">
                            {Object.entries(d.roles).filter(([k]) => k !== "founder").map(([k, r]: any) => <option key={k} value={k}>{r.label}</option>)}
                          </select>
                        )}
                        <div className="text-[11px] text-ink-soft">{d.roles[u.hq_role || "support"]?.can}</div>
                      </td>
                      <td className="px-3 py-2.5">{u.totp_enabled ? <span className="text-signal font-semibold">On</span> : <span className="text-miss font-semibold">Off</span>}</td>
                      <td className="px-3 py-2.5">{ago(u.last_login_at)}</td>
                      <td className="px-5 py-2.5 text-right">{!u.founderByEnv && !u.me && (u.is_active ? <button onClick={() => patch(u.id, { active: false })} className="text-miss text-[12px] font-semibold">Remove access</button> : <button onClick={() => patch(u.id, { active: true })} className="text-signal text-[12px] font-semibold">Restore</button>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-3 text-[11.5px] text-ink-soft border-t border-line">Founders come from <code>RANA_HQ_EMAILS</code> in Vercel, so nobody can lock you out from inside the app.</div>
            </div>
          )}
        </div>
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setForm(null)}>
          <div className="w-full max-w-[440px] bg-raised rounded-2xl border border-line p-6 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-[18px] font-display font-semibold">Add someone to RANA HQ</div>
            <label className="text-[12px] font-semibold">Email<input id="staff-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={field} /></label>
            <label className="text-[12px] font-semibold">Name<input id="staff-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} /></label>
            <label className="text-[12px] font-semibold">Role<select id="staff-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={field}>
              {d && Object.entries(d.roles).filter(([k]) => k !== "founder").map(([k, r]: any) => <option key={k} value={k}>{r.label} — {r.can}</option>)}
            </select></label>
            <div className="flex justify-end gap-2 mt-1">
              <button onClick={() => setForm(null)} className="border border-line rounded-lg px-4 py-2 text-[13px] font-semibold">Cancel</button>
              <button onClick={add} disabled={busy} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50" data-testid="staff-save">Add</button>
            </div>
          </div>
        </div>
      )}
      {created && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-[440px] bg-raised rounded-2xl border border-line p-6 flex flex-col gap-3" data-testid="staff-created">
            <div className="text-[18px] font-display font-semibold">Login for {created.user.email}</div>
            <div className="text-[13px]">One-time password: <b className="font-mono select-all">{created.password}</b></div>
            <div className="text-[12px] text-ink-soft">{created.emailed ? "We've emailed it to them too." : "Send it to them yourself — email isn't set up yet."} They'll set their own password on first sign-in.</div>
            <div className="flex justify-end"><button onClick={() => setCreated(null)} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold">Done</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
