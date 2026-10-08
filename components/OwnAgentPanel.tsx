"use client";
import { useEffect, useState } from "react";

/** HQ only: run this employee on a ready-made R1 agent (its own script, greeting and voice). */
export default function OwnAgentPanel({ scriptId }: { scriptId: string | null }) {
  const [allowed, setAllowed] = useState(false);
  const [saved, setSaved] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!scriptId) return;
    fetch(`/api/scripts/${scriptId}/agent`).then((r) => r.json()).then((d) => { setAllowed(!!d.allowed); setSaved(d.agent || ""); setValue(d.agent || ""); }).catch(() => {});
  }, [scriptId]);
  if (!allowed || !scriptId) return null;
  async function save(agent: string) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/scripts/${scriptId}/agent`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't save.");
      setSaved(d.agent || ""); setValue(d.agent || "");
      setMsg({ ok: true, text: d.agent ? "Connected. Tests and calls for this employee now use that agent." : "Removed. This employee uses RANA's script again." });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  async function latest() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/scripts/${scriptId}/agent`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "latest" }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't check.");
      setSaved(d.agent || ""); setValue(d.agent || "");
      setMsg({ ok: true, text: d.changed ? `Updated to ${d.agent}. Tests and calls now use it.` : `Already on the newest version (${d.agent}).` });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  return (
    <div className="mt-4 border border-line rounded-xl px-3.5 py-3 bg-paper" data-testid="own-agent">
      <div className="text-[13.5px] font-semibold">Ready-made agent <span className="text-[10.5px] font-mono text-ink-soft border border-line rounded-full px-1.5 py-0.5 ml-1">HQ</span></div>
      <div className="text-[11.5px] text-ink-soft mt-0.5">Paste an R1 agent ID with its committed version. This employee then uses that agent&apos;s own script, greeting and voice — the script built here isn&apos;t sent.</div>
      <div className="flex gap-2 mt-2">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="RV-Kabir-fe3a0273-0904@3" className="flex-1 rounded-lg border border-line bg-raised px-3 py-1.5 text-[13px] font-mono outline-none focus:border-signal" data-testid="own-agent-input" />
        <button type="button" disabled={busy || !value.trim() || value.trim() === saved} onClick={() => save(value)} className="rounded-lg bg-ink text-paper px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40" data-testid="own-agent-save">{busy ? "Saving…" : "Connect"}</button>
        {saved && <button type="button" disabled={busy} onClick={latest} className="rounded-lg border border-signal/60 text-signal px-3 py-1.5 text-[12.5px] font-semibold" data-testid="own-agent-latest">↻ Latest version</button>}
        {saved && <button type="button" disabled={busy} onClick={() => save("")} className="rounded-lg border border-line px-3 py-1.5 text-[12.5px]" data-testid="own-agent-remove">Remove</button>}
      </div>
      {saved && <div className="text-[11.5px] text-signal mt-1.5">✓ Using {saved} · tests and calls move to the newest committed version automatically</div>}
      {msg && <div className={`text-[11.5px] mt-1 ${msg.ok ? "text-signal" : "text-miss"}`}>{msg.text}</div>}
    </div>
  );
}
