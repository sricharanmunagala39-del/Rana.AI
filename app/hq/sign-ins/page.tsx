"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";

const when = (d: string | null) => {
  if (!d) return "never";
  const s = (Date.now() - Date.parse(d)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};
const time = (d: string) => new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
const LABEL: Record<string, string> = {
  login: "Signed in", login_failed: "Wrong password", password_changed: "Changed password",
  password_reset_requested: "Asked for reset link", password_reset_done: "Reset password by email",
  user_password_reset: "Teammate password reset", hq_owner_password_reset: "HQ reset owner password",
};
const TONE: Record<string, string> = { login: "text-signal", login_failed: "text-miss", password_reset_done: "text-hot", password_reset_requested: "text-ink-soft" };

/** RANA HQ → Sign-ins: who uses RANA, how often, failed attempts and password resets, across every client. */
export default function HqSignInsPage() {
  const [days, setDays] = useState(7);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [co, setCo] = useState("all");
  const [sent, setSent] = useState<Record<string, string>>({});

  const load = (n = days) => { setErr(""); fetch(`/api/hq/logins?days=${n}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(e.message)); };
  useEffect(() => { load(days); const t = setInterval(() => load(days), 60000); return () => clearInterval(t); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const companies = useMemo(() => Array.from(new Set((d?.people || []).map((p: any) => p.company))).sort() as string[], [d]);
  const people = useMemo(() => (d?.people || []).filter((p: any) =>
    (co === "all" || p.company === co) && (!q || `${p.name} ${p.email} ${p.company}`.toLowerCase().includes(q.toLowerCase()))), [d, q, co]);
  const maxDay = Math.max(1, ...((d?.perDay || []).map((x: any) => x.signIns + x.failed)));

  async function sendLink(email: string) {
    setSent((s) => ({ ...s, [email]: "Sending…" }));
    const r = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    setSent((s) => ({ ...s, [email]: r?.ok ? "Link sent ✓" : "Couldn't send" }));
  }

  const T = d?.totals || {};
  const tiles = [
    ["Active now", T.activeNow, "used RANA in the last 15 min", "text-signal"],
    ["Sign-ins", T.signIns, `${T.people ?? 0} different people`, ""],
    ["Wrong passwords", T.failed, T.failed ? "see the watch list below" : "none", T.failed ? "text-miss" : ""],
    ["Password resets", T.resets, `${T.resetLinks ?? 0} reset links sent`, ""],
    ["Accounts", T.accounts, `${T.neverSignedIn ?? 0} never signed in`, ""],
    ["2-step login on", `${T.twoStep ?? 0}/${T.accounts ?? 0}`, "accounts with an authenticator", ""],
  ];

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="hq" />
      <div className="flex-1 p-6 md:p-10 min-w-0">
        <div className="max-w-[1100px] flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-signal"><Link href="/hq">RANA HQ</Link> · Sign-ins</div>
              <div className="text-[22px] font-display font-semibold">Who is signing in to RANA</div>
              <div className="text-[13px] text-ink-soft mt-0.5">Every sign-in, wrong password and password reset, across all clients. Refreshes every minute.</div>
            </div>
            <div className="inline-flex border border-line rounded-lg overflow-hidden bg-raised" role="group" aria-label="Range">
              {[[1, "Today"], [7, "7 days"], [30, "30 days"], [90, "90 days"]].map(([n, l]) => (
                <button key={n} onClick={() => setDays(n as number)} aria-pressed={days === n} className={`px-3 py-1.5 text-[12.5px] ${days === n ? "bg-ink text-paper font-semibold" : "text-ink-soft hover:text-ink"}`}>{l}</button>
              ))}
            </div>
          </div>
          {err && <div className="text-[13px] text-miss">{err}</div>}
          {!d && !err && <div className="text-[13px] text-ink-soft">Loading…</div>}

          {d && (<>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="signin-tiles">
              {tiles.map(([l, v, sub, tone]) => (
                <div key={l as string} className="border border-line rounded-xl bg-raised p-3.5">
                  <div className="text-[11px] uppercase tracking-wide text-ink-soft">{l}</div>
                  <div className={`text-[26px] font-display font-semibold leading-tight ${tone}`}>{v ?? 0}</div>
                  <div className="text-[11.5px] text-ink-soft">{sub}</div>
                </div>
              ))}
            </div>

            {d.perDay.length > 1 && (
              <div className="border border-line rounded-xl bg-raised p-5">
                <div className="text-[14px] font-semibold mb-3">Sign-ins per day <span className="text-[12px] font-normal text-ink-soft">· <span className="text-signal">■</span> signed in · <span className="text-miss">■</span> wrong password</span></div>
                <div className="flex items-end gap-1 h-[120px]">
                  {d.perDay.map((x: any) => (
                    <div key={x.day} className="flex-1 min-w-[6px] flex flex-col justify-end h-full" title={`${x.day}: ${x.signIns} sign-ins by ${x.people} people, ${x.failed} wrong passwords`}>
                      {x.failed > 0 && <div className="bg-miss/70 rounded-t-sm" style={{ height: `${(x.failed / maxDay) * 100}%` }} />}
                      <div className={`bg-signal ${x.failed ? "" : "rounded-t-sm"}`} style={{ height: `${(x.signIns / maxDay) * 100}%` }} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-ink-soft mt-1.5"><span>{d.perDay[0].day.slice(5)}</span><span>{d.perDay[d.perDay.length - 1].day.slice(5)}</span></div>
              </div>
            )}

            {d.watch.length > 0 && (
              <div className="border border-miss/30 bg-miss-tint rounded-xl p-4" data-testid="signin-watch">
                <div className="text-[14px] font-semibold mb-1">Watch list: many wrong passwords</div>
                <div className="text-[12.5px] text-ink-soft mb-2">Either someone is guessing, or the person forgot their password. Sending them a reset link is safe — only the inbox owner can use it.</div>
                {d.watch.map((w: any) => (
                  <div key={w.email} className="flex flex-wrap items-center gap-3 text-[13px] py-1">
                    <b>{w.email}</b><span className="text-ink-soft">{w.company}</span><span className="text-miss font-semibold">{w.failed} wrong</span>
                    {w.company !== "No such account" && <button onClick={() => sendLink(w.email)} className="text-signal font-semibold text-[12.5px]">{sent[w.email] || "Send reset link"}</button>}
                  </div>
                ))}
              </div>
            )}

            <div className="border border-line rounded-xl bg-raised p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="text-[14px] font-semibold">People <span className="text-[12px] font-normal text-ink-soft">· {people.length} shown</span></div>
                <div className="flex gap-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="border border-line rounded-lg px-3 py-1.5 text-[13px] bg-sunken" />
                  <select value={co} onChange={(e) => setCo(e.target.value)} className="border border-line rounded-lg px-2 py-1.5 text-[13px] bg-sunken">
                    <option value="all">All companies</option>
                    {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" data-testid="signin-people">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wide text-ink-soft border-b border-line">
                    <th className="py-2 pr-3">Person</th><th className="pr-3">Company</th><th className="pr-3">Last active</th><th className="pr-3">Last sign-in</th>
                    <th className="pr-3 text-right">Sign-ins</th><th className="pr-3 text-right">Wrong</th><th className="pr-3">2-step</th><th></th>
                  </tr></thead>
                  <tbody>
                    {people.map((p: any) => (
                      <tr key={p.id} className={`border-b border-line/60 ${p.active ? "" : "opacity-50"}`}>
                        <td className="py-2 pr-3"><div className="font-semibold flex items-center gap-1.5">{p.activeNow && <span className="w-2 h-2 rounded-full bg-signal live-dot" title="Active now" />}{p.name || "—"}</div><div className="text-[12px] text-ink-soft">{p.email} · {p.role}{p.active ? "" : " · removed"}</div></td>
                        <td className="pr-3">{p.company}{p.isHq && <span className="ml-1 text-[10.5px] text-signal font-semibold">HQ</span>}</td>
                        <td className="pr-3 whitespace-nowrap">{p.activeNow ? <span className="text-signal font-semibold">now</span> : when(p.lastSeen)}</td>
                        <td className="pr-3 whitespace-nowrap">{when(p.lastLogin)}{p.lastIp && <div className="text-[11px] text-ink-soft font-mono">{p.lastIp}{p.ips > 1 ? ` +${p.ips - 1}` : ""}</div>}</td>
                        <td className="pr-3 text-right font-mono">{p.signIns}</td>
                        <td className={`pr-3 text-right font-mono ${p.failed ? "text-miss font-semibold" : ""}`}>{p.failed}</td>
                        <td className="pr-3">{p.twoStep ? <span className="text-signal">On</span> : <span className="text-ink-soft">Off</span>}</td>
                        <td className="text-right whitespace-nowrap">{p.active && <button onClick={() => sendLink(p.email)} className="text-[12px] text-signal font-semibold">{sent[p.email] || "Send reset link"}</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border border-line rounded-xl bg-raised p-5">
              <div className="text-[14px] font-semibold mb-2">Latest activity</div>
              {d.recent.length === 0 ? <div className="text-[13px] text-ink-soft">No sign-ins in this range.</div> : (
                <div className="flex flex-col" data-testid="signin-recent">
                  {d.recent.map((e: any, i: number) => (
                    <div key={i} className="grid grid-cols-[150px_190px_1fr] gap-3 py-1.5 border-b border-line/60 text-[13px] items-baseline">
                      <span className="text-[12px] text-ink-soft font-mono whitespace-nowrap">{time(e.at)}</span>
                      <span className={`font-semibold ${TONE[e.action] || ""}`}>{LABEL[e.action] || e.action}{e.twoStep ? " · 2-step" : ""}</span>
                      <span className="min-w-0 truncate">{e.name ? `${e.name} · ` : ""}{e.email}<span className="text-ink-soft"> · {e.company}{e.ip ? ` · ${e.ip}` : ""}</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}
