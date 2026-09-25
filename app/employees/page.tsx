// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { LANGUAGES } from "@/lib/storage";

type Script = { id: string; name: string; engine?: string | null; playbook?: any; starting_language: string; voice_name: string | null; cartesia_agent_id: string | null; tested_at: string | null; published_at: string | null; steps: any[]; status: string };
type PhoneNumber = { id: string; number: string; label: string | null; agentId: string | null; agentName: string | null; provider: string };
type Campaign = { id: string; name: string; script_id: string | null; status: string; total_contacts: number; created_at: string; kpis: { dialled: number; connected: number; hot: number } };

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

/** Built → Tested → Deployed. Each step says what's done and what to do next. */
function Stages({ s, inbound, outbound }: { s: Script; inbound: PhoneNumber[]; outbound: Campaign[] }) {
  const built = !!s.cartesia_agent_id;
  const tested = built && !!s.tested_at;
  const deployed = tested && (inbound.length > 0 || outbound.some((c) => ["running", "scheduled", "completed", "paused"].includes(c.status)));
  const steps = [
    { label: "Built", done: built, note: built ? `Published ${fmtDate(s.published_at)}` : "Press Publish" },
    { label: "Tested", done: tested, note: tested ? `Signed off ${fmtDate(s.tested_at)}` : built ? "Talk & sign off" : "—" },
    { label: "Deployed", done: deployed, note: deployed ? [inbound.length ? `${inbound.length} inbound line${inbound.length > 1 ? "s" : ""}` : "", outbound.length ? `${outbound.length} campaign${outbound.length > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ") : tested ? "Choose inbound or outbound" : "—" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {steps.map((st, i) => (
        <div key={st.label} className={`rounded-lg border px-3 py-2 ${st.done ? "border-signal/30 bg-signal-tint" : "border-line bg-paper"}`}>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold">
            <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center ${st.done ? "bg-signal text-on-accent" : "bg-raised border border-line text-ink-soft"}`}>{st.done ? "✓" : i + 1}</span>
            {st.label}
          </div>
          <div className="text-[11.5px] text-ink-soft mt-0.5 truncate">{st.note}</div>
        </div>
      ))}
    </div>
  );
}

function DeployModal({ s, numbers, campaigns, onClose, onChanged }: { s: Script; numbers: PhoneNumber[]; campaigns: Campaign[]; onClose: () => void; onChanged: () => void }) {
  const [mode, setMode] = useState<"inbound" | "outbound" | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const mine = numbers.filter((n) => n.agentId && n.agentId === s.cartesia_agent_id);

  async function assign(numberId: string, scriptId: string | null) {
    setBusy(numberId); setMsg(null);
    try {
      const res = await fetch(`/api/admin/cartesia-phone-numbers/${numberId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scriptId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't change the number");
      setMsg({ ok: true, text: scriptId ? `${s.name} now answers every call to this number.` : "Number released — nobody answers it until you assign someone." });
      onChanged();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(""); }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-[640px] max-h-[90vh] overflow-y-auto bg-raised rounded-2xl border border-line shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-line flex items-start justify-between">
          <div>
            <div className="text-[18px] font-display font-semibold">Deploy {s.name}</div>
            <div className="text-[12.5px] text-ink-soft mt-0.5">Choose how {s.name} works for you. You can do both.</div>
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-lg leading-none">×</button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { key: "inbound", title: "Answer inbound calls", body: `Put ${s.name} on a phone number. Every call to that number is answered by ${s.name}.`, icon: "M17 7L7 17 M16 17H7V8" },
              { key: "outbound", title: "Make outbound calls", body: `Upload a list of numbers. ${s.name} calls each one and reports who's interested.`, icon: "M7 17L17 7 M8 7h9v9" },
            ].map((o) => (
              <button key={o.key} onClick={() => setMode(o.key as any)}
                className={`text-left rounded-xl border p-4 transition-colors ${mode === o.key ? "border-signal bg-signal-tint" : "border-line hover:border-ink-soft"}`}>
                <div className="w-8 h-8 rounded-full bg-raised border border-line flex items-center justify-center mb-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={o.icon} /></svg>
                </div>
                <div className="text-[14px] font-semibold">{o.title}</div>
                <div className="text-[12px] text-ink-soft mt-1 leading-relaxed">{o.body}</div>
              </button>
            ))}
          </div>

          {mode === "inbound" && s.engine !== "cartesia" && (
            <div className="flex flex-col gap-2 text-[12.5px] leading-relaxed" data-testid="sarvam-inbound">
              <div className="text-[13px] font-semibold">Inbound on your Sarvam number</div>
              <div className="text-ink-soft">{s.name} runs on Sarvam. Incoming calls to your Sarvam number (+91 80642 60065) are answered by the agent linked to that number in Sarvam, which RANA can't switch through Sarvam's API yet. To have {s.name} answer inbound calls, the RANA team links the number to {s.name}'s script in Sarvam — send us a message and it's done the same day.</div>
              <div className="text-ink-soft">Outbound works fully from here: pick <b>Make outbound calls</b> above.</div>
            </div>
          )}
          {mode === "inbound" && s.engine === "cartesia" && (
            <div className="flex flex-col gap-3">
              <div className="text-[13px] font-semibold">Pick the number {s.name} should answer</div>
              {numbers.length === 0 && (
                <div className="text-[12.5px] text-ink-soft border border-dashed border-line rounded-lg p-4">
                  No phone numbers yet. Add one on the <Link href="/phone-numbers" className="text-signal font-semibold">Phone Numbers</Link> page, then come back.
                </div>
              )}
              {numbers.map((n) => {
                const isMine = n.agentId && n.agentId === s.cartesia_agent_id;
                return (
                  <div key={n.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2.5 ${isMine ? "border-signal/40 bg-signal-tint" : "border-line"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-semibold">{n.number}</div>
                      <div className="text-[11.5px] text-ink-soft">{n.label || "Unlabelled"} · {isMine ? `answered by ${s.name}` : n.agentName ? `answered by ${n.agentName}` : "nobody answers yet"}</div>
                    </div>
                    {isMine ? (
                      <button onClick={() => assign(n.id, null)} disabled={!!busy} className="text-[12px] font-semibold text-miss border border-miss/20 rounded-lg px-3 py-1.5 disabled:opacity-40">{busy === n.id ? "…" : "Stop"}</button>
                    ) : (
                      <button onClick={() => assign(n.id, s.id)} disabled={!!busy} className="text-[12px] font-semibold text-on-accent bg-signal rounded-lg px-3 py-1.5 disabled:opacity-40">{busy === n.id ? "…" : n.agentId ? "Replace" : "Assign"}</button>
                    )}
                  </div>
                );
              })}
              <div className="text-[12px] text-ink-soft leading-relaxed bg-paper rounded-lg p-3">
                <span className="font-semibold text-ink">Keep your existing business number.</span> Forward it to the number above and callers won't notice a change —
                on Jio/Airtel/Vi, dial <span className="font-mono">**21*&lt;number&gt;#</span> to forward all calls, or <span className="font-mono">**61*&lt;number&gt;#</span> to forward only unanswered ones.
              </div>
              {mine.length > 0 && <div className="text-[12px] text-signal">{s.name} is live on {mine.map((n) => n.number).join(", ")}.</div>}
            </div>
          )}

          {mode === "outbound" && (
            <div className="flex flex-col gap-3">
              <Link href={`/outbound/new?employee=${s.id}`} className="bg-signal text-on-accent rounded-lg px-4 py-2.5 text-[13px] font-semibold text-center">
                Create a calling campaign with {s.name} →
              </Link>
              {campaigns.length > 0 && (
                <div className="border border-line rounded-lg divide-y divide-line">
                  {campaigns.slice(0, 6).map((c) => (
                    <Link key={c.id} href={`/outbound/${c.id}`} className="flex items-center justify-between px-3 py-2.5 text-[12.5px] hover:bg-paper">
                      <span className="font-semibold truncate">{c.name}</span>
                      <span className="text-ink-soft shrink-0 ml-3">{c.status} · {c.kpis.dialled}/{c.total_contacts} dialled · {c.kpis.hot} hot</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {msg && <div className={`text-[12.5px] ${msg.ok ? "text-signal" : "text-miss"}`}>{msg.text}</div>}
        </div>
      </div>
    </div>
  );
}

export default function EmployeesPage() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState("");
  const [deployId, setDeployId] = useState<string | null>(null);

  async function load() {
    try {
      const [s, n, c] = await Promise.all([
        fetch("/api/scripts").then((r) => r.json()),
        fetch("/api/admin/cartesia-phone-numbers").then((r) => r.json()).catch(() => ({ numbers: [] })),
        fetch("/api/campaigns").then((r) => r.json()).catch(() => ({ campaigns: [] })),
      ]);
      if (s.error) throw new Error(s.error);
      setScripts(s.scripts || []); setNumbers(n.numbers || []); setCampaigns(c.campaigns || []);
      setError("");
    } catch (e: any) { setError(e.message || "Failed to load your team."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    load();
    const d = new URLSearchParams(window.location.search).get("deploy");
    if (d) setDeployId(d);
  }, []);

  async function publish(id: string) {
    setPublishing(id);
    try {
      const res = await fetch(`/api/scripts/${id}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed");
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setPublishing(""); }
  }

  const deploying = useMemo(() => scripts.find((s) => s.id === deployId) || null, [scripts, deployId]);
  const inboundOf = (s: Script) => numbers.filter((n) => n.agentId && n.agentId === s.cartesia_agent_id);
  const outboundOf = (s: Script) => campaigns.filter((c) => c.script_id === s.id);

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="employees" />
      <div className="flex-1 min-w-0 px-6 py-8 lg:px-10">
        <div className="max-w-[900px]">
          <div className="flex items-center justify-between mb-2 gap-4">
            <div>
              <div className="text-[22px] font-display font-semibold">My Employees</div>
              <div className="text-[13px] text-ink-soft mt-0.5">Build an employee, talk to it until it answers right, then deploy it on inbound calls, outbound campaigns, or both.</div>
            </div>
            <Link href="/agents/new" className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[12.5px] font-semibold shrink-0">+ New employee</Link>
          </div>

          {error && <div className="text-[12.5px] text-miss bg-miss-tint rounded-lg px-3 py-2.5 mt-4">{error}</div>}
          {loading && <div className="text-[12.5px] text-ink-soft mt-6">Loading your team…</div>}

          <div className="flex flex-col gap-3 mt-5">
            {scripts.map((s) => {
              const built = !!s.cartesia_agent_id, tested = built && !!s.tested_at;
              const inbound = inboundOf(s), outbound = outboundOf(s);
              const running = outbound.filter((c) => c.status === "running").length;
              const langLabel = LANGUAGES.find((l) => l.code === s.starting_language)?.label ?? s.starting_language;
              return (
                <div key={s.id} className="border border-line rounded-2xl bg-raised p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-signal-tint flex items-center justify-center text-signal font-display font-bold text-xl shrink-0">{(s.name || "?").charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-[16px] font-semibold">{s.name}</div>
                        {inbound.length > 0 && <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-signal-tint text-signal">Answering {inbound.map((n) => n.number).join(", ")}</span>}
                        {running > 0 && <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-hot-tint text-hot">Calling · {running} campaign{running > 1 ? "s" : ""} running</span>}
                      </div>
                      <div className="text-[12.5px] text-ink-soft mt-0.5">{langLabel} · {s.engine === "cartesia" ? `Cartesia${s.voice_name ? ` · voice ${s.voice_name}` : ""}` : "Sarvam · voice Priya"}{s.playbook ? " · Studio script" : (s.steps || []).length ? ` · ${(s.steps || []).length} script steps` : " · no script yet"}</div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {!built ? (
                        <button onClick={() => publish(s.id)} disabled={!!publishing} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50">{publishing === s.id ? "Publishing…" : "Publish"}</button>
                      ) : !tested ? (
                        <Link href={`/talk?scriptId=${s.id}`} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[12.5px] font-semibold">Talk & test</Link>
                      ) : (
                        <button onClick={() => setDeployId(s.id)} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[12.5px] font-semibold">Deploy</button>
                      )}
                      {tested && <Link href={`/talk?scriptId=${s.id}`} className="border border-line rounded-lg px-3 py-2 text-[12.5px] font-semibold hover:bg-paper">Talk</Link>}
                      <Link href={`/agents/new?id=${s.id}`} className="border border-line rounded-lg px-3 py-2 text-[12.5px] font-semibold hover:bg-paper">Edit</Link>
                    </div>
                  </div>
                  <Stages s={s} inbound={inbound} outbound={outbound} />
                </div>
              );
            })}

            {!loading && !error && scripts.length === 0 && (
              <div className="border border-dashed border-line rounded-2xl p-8 text-center text-[13.5px] text-ink-soft">
                No employees yet. Click <span className="font-semibold">+ New employee</span> to create one — pick its language, voice and script.
              </div>
            )}
          </div>
        </div>
      </div>
      {deploying && <DeployModal s={deploying} numbers={numbers} campaigns={outboundOf(deploying)} onClose={() => setDeployId(null)} onChanged={load} />}
    </div>
  );
}
