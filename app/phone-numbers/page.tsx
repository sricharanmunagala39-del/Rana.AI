// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";

type PhoneNumber = {
  id: string;
  number: string;
  label: string | null;
  agentId: string | null;
  agentName: string | null;
  provider: string;
};

export default function PhoneNumbersPage() {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [sarvam, setSarvam] = useState<any>(null);
  useEffect(() => { fetch("/api/sarvam/status").then((r) => r.json()).then((d) => setSarvam(d?.sarvam || null)).catch(() => {}); }, []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [label, setLabel] = useState("");
  const [assignToAgent, setAssignToAgent] = useState(true);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState("");

  const [deletingId, setDeletingId] = useState("");

  // Twilio import (the India route)
  const [tw, setTw] = useState({ accountSid: "", apiKeySid: "", apiKeySecret: "", region: "us1", number: "", label: "" });
  const [twAssign, setTwAssign] = useState(true);
  const [twAlreadyConnected, setTwAlreadyConnected] = useState(false);
  const [importing, setImporting] = useState(false);
  const [twError, setTwError] = useState("");
  const [twOk, setTwOk] = useState("");

  // Test call per number
  const [testFor, setTestFor] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    setLoading(true); setLoadError("");
    try {
      const res = await fetch("/api/admin/cartesia-phone-numbers");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load numbers.");
      setNumbers(data.numbers || []);
    } catch (err: any) {
      setLoadError(err?.message || "Something went wrong.");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleBuy() {
    if (!label.trim() || buying) return;
    setBuying(true); setBuyError("");
    try {
      const res = await fetch("/api/admin/cartesia-phone-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), assignToAgent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to provision this number.");
      setLabel("");
      await load();
    } catch (err: any) {
      setBuyError(err?.message || "Something went wrong.");
    } finally { setBuying(false); }
  }

  async function handleImport() {
    if (importing) return;
    setImporting(true); setTwError(""); setTwOk("");
    try {
      const res = await fetch("/api/admin/cartesia-phone-numbers/import-twilio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountSid: tw.accountSid, region: tw.region, number: tw.number, label: tw.label, assignToAgent: twAssign,
          ...(twAlreadyConnected ? {} : { apiKeySid: tw.apiKeySid, apiKeySecret: tw.apiKeySecret }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed.");
      setTwOk(`${data.providerNote ? data.providerNote + " " : ""}Imported ${data.number?.number}.`);
      setTw((t) => ({ ...t, apiKeySecret: "", number: "", label: "" }));
      setTwAlreadyConnected(true);
      await load();
    } catch (err: any) {
      setTwError(err?.message || "Something went wrong.");
    } finally { setImporting(false); }
  }

  async function handleTestCall(id: string) {
    if (!testTo.trim() || testing) return;
    setTesting(true); setTestMsg(null);
    try {
      const res = await fetch(`/api/admin/cartesia-phone-numbers/${id}/test-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Call failed.");
      setTestMsg({ ok: true, text: `Ringing ${data.to} now.` });
    } catch (err: any) {
      setTestMsg({ ok: false, text: err?.message || "Something went wrong." });
    } finally { setTesting(false); }
  }

  async function handleDelete(id: string, provider?: string) {
    const msg = provider === "twilio"
      ? "Remove this number from Cartesia? It stays in your Twilio account and can be imported again."
      : "Release this number? This can't be undone.";
    if (!confirm(msg)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/cartesia-phone-numbers/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to release this number.");
      await load();
    } catch (err: any) {
      alert(err?.message || "Something went wrong.");
    } finally { setDeletingId(""); }
  }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="phone-numbers" />
      <div className="flex-1 p-10">
        <div className="max-w-[760px] flex flex-col gap-6">
          <div>
            <div className="text-[20px] font-display font-semibold">Phone Numbers</div>
            <div className="text-[13px] text-ink-soft mt-0.5">The numbers your employees call from and answer.</div>
          </div>

          <div className="border border-signal/30 rounded-xl bg-raised p-5 flex items-center gap-4" data-testid="sarvam-number">
            <div className="w-10 h-10 rounded-full bg-signal-tint text-signal flex items-center justify-center font-bold">₹</div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold">{sarvam?.number || "Sarvam Indian number"} <span className="text-[11px] font-semibold text-signal bg-signal-tint rounded-full px-2 py-0.5 ml-1">Sarvam · India</span></div>
              <div className="text-[12px] text-ink-soft mt-0.5 leading-relaxed">
                {sarvam?.ready && sarvam?.calling
                  ? "Every employee on the Sarvam engine calls from this number — campaigns and \"Call me\" test calls. Nothing to set up."
                  : sarvam ? "Sarvam calling isn't fully connected yet." : "Checking…"}
              </div>
            </div>
            <span className={`text-[11.5px] font-semibold rounded-full px-2.5 py-1 ${sarvam?.ready && sarvam?.calling ? "bg-signal-tint text-signal" : "bg-paper text-ink-soft"}`}>{sarvam?.ready && sarvam?.calling ? "Ready" : "—"}</span>
          </div>

          <div className="text-[12px] font-semibold text-ink-soft uppercase tracking-wide mt-2">Cartesia numbers (for employees on the Cartesia engine)</div>

          <div className="border border-line rounded-xl bg-raised p-5 flex flex-col gap-3">
            <div>
              <div className="text-[14px] font-semibold">Import an Indian number from Twilio</div>
              <div className="text-[12px] text-ink-soft mt-1 leading-relaxed">
                Cartesia's own numbers are US-only, so DBMCI's Indian line has to come from Twilio. Buy the number in Twilio
                first (India needs the regulatory bundle approved), then create a <span className="font-semibold">Standard API key</span> in
                Twilio → Account → API keys. The secret goes straight to Cartesia; this dashboard doesn't store it.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={tw.accountSid} onChange={(e) => setTw({ ...tw, accountSid: e.target.value })} placeholder="Account SID (AC…)"
                className="border border-line rounded-lg px-3 py-2 text-[13px] bg-paper outline-none focus:border-signal font-mono" />
              <select value={tw.region} onChange={(e) => setTw({ ...tw, region: e.target.value })}
                className="border border-line rounded-lg px-3 py-2 text-[13px] bg-paper outline-none focus:border-signal">
                <option value="us1">Region: us1 (default)</option>
                <option value="ie1">Region: ie1 (Ireland)</option>
                <option value="au1">Region: au1 (Australia)</option>
              </select>
              {!twAlreadyConnected && (<>
                <input value={tw.apiKeySid} onChange={(e) => setTw({ ...tw, apiKeySid: e.target.value })} placeholder="API Key SID (SK…)"
                  className="border border-line rounded-lg px-3 py-2 text-[13px] bg-paper outline-none focus:border-signal font-mono" />
                <input type="password" value={tw.apiKeySecret} onChange={(e) => setTw({ ...tw, apiKeySecret: e.target.value })} placeholder="API Key Secret"
                  className="border border-line rounded-lg px-3 py-2 text-[13px] bg-paper outline-none focus:border-signal font-mono" />
              </>)}
              <input value={tw.number} onChange={(e) => setTw({ ...tw, number: e.target.value })} placeholder="Twilio number, e.g. +91 40 1234 5678"
                className="border border-line rounded-lg px-3 py-2 text-[13px] bg-paper outline-none focus:border-signal" />
              <input value={tw.label} onChange={(e) => setTw({ ...tw, label: e.target.value })} placeholder={`Label, e.g. "DBMCI Hyderabad"`}
                className="border border-line rounded-lg px-3 py-2 text-[13px] bg-paper outline-none focus:border-signal" />
            </div>
            <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
              <input type="checkbox" checked={twAlreadyConnected} onChange={(e) => setTwAlreadyConnected(e.target.checked)} className="accent-signal" />
              This Twilio account is already connected (skip the API key)
            </label>
            <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
              <input type="checkbox" checked={twAssign} onChange={(e) => setTwAssign(e.target.checked)} className="accent-signal" />
              Route inbound calls on this number to your published DBMCI agent
            </label>
            <div>
              <button onClick={handleImport}
                disabled={importing || !tw.accountSid.trim() || !tw.number.trim() || !tw.label.trim() || (!twAlreadyConnected && (!tw.apiKeySid.trim() || !tw.apiKeySecret.trim()))}
                className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[12.5px] font-semibold disabled:opacity-40">
                {importing ? "Importing…" : "Import number"}
              </button>
            </div>
            {twError && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5">{twError}</div>}
            {twOk && <div className="text-[12.5px] text-signal bg-signal-tint border border-signal/20 rounded-lg px-3 py-2.5">{twOk}</div>}
          </div>

          <div className="border border-line rounded-xl bg-raised p-5 flex flex-col gap-3">
            <div className="text-[14px] font-semibold">Buy a Cartesia number (US only — for testing)</div>
            <div className="flex gap-2">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`Label, e.g. "DBMCI US test line"`}
                className="flex-1 border border-line rounded-lg px-3 py-2 text-[13px] bg-paper outline-none focus:border-signal" />
              <button onClick={handleBuy} disabled={buying || !label.trim()}
                className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[12.5px] font-semibold disabled:opacity-40 whitespace-nowrap">
                {buying ? "Buying…" : "Buy number"}
              </button>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
              <input type="checkbox" checked={assignToAgent} onChange={(e) => setAssignToAgent(e.target.checked)} className="accent-signal" />
              Route inbound calls on this number to your published DBMCI agent
            </label>
            {buyError && (
              <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5">{buyError}</div>
            )}
          </div>

          <div className="border border-line rounded-xl bg-raised overflow-hidden">
            <div className="px-4 py-3 border-b border-line text-[13px] font-semibold flex items-center justify-between">
              <span>Your numbers</span>
              <button onClick={load} disabled={loading} className="text-[11.5px] font-semibold text-signal disabled:opacity-40">
                {loading ? "Loading…" : "↻ Refresh"}
              </button>
            </div>
            {loadError && (
              <div className="p-4 text-[12.5px] text-miss">{loadError}</div>
            )}
            {!loading && !loadError && numbers.length === 0 && (
              <div className="p-6 text-center text-[12.5px] text-ink-soft">No numbers yet — import your Twilio number above.</div>
            )}
            {numbers.map((n) => (
              <div key={n.id} className="px-4 py-3 border-b border-line last:border-b-0">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold">{n.number}</div>
                    <div className="text-[12px] text-ink-soft mt-0.5">
                      {n.label || "Unlabelled"} · {n.provider === "twilio" ? "Twilio" : "Cartesia"}
                      {n.agentName ? ` · routes to ${n.agentName}` : " · not routed to an agent"}
                    </div>
                  </div>
                  <button onClick={() => { setTestFor(testFor === n.id ? "" : n.id); setTestMsg(null); }}
                    className="text-[12px] font-semibold text-signal border border-signal/20 rounded-lg px-3 py-1.5 hover:bg-signal-tint">
                    Test call
                  </button>
                  <button onClick={() => handleDelete(n.id, n.provider)} disabled={deletingId === n.id}
                    className="text-[12px] font-semibold text-miss border border-miss/20 rounded-lg px-3 py-1.5 hover:bg-miss-tint disabled:opacity-40">
                    {deletingId === n.id ? "Removing…" : n.provider === "twilio" ? "Remove" : "Release"}
                  </button>
                </div>
                {testFor === n.id && (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Your mobile, e.g. 98765 43210"
                        className="flex-1 border border-line rounded-lg px-3 py-2 text-[13px] bg-paper outline-none focus:border-signal" />
                      <button onClick={() => handleTestCall(n.id)} disabled={testing || !testTo.trim()}
                        className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[12.5px] font-semibold disabled:opacity-40 whitespace-nowrap">
                        {testing ? "Calling…" : "Call me"}
                      </button>
                    </div>
                    <div className="text-[11.5px] text-ink-soft">Uses your published DBMCI Cartesia agent. 10-digit numbers are treated as +91.</div>
                    {testMsg && <div className={`text-[12.5px] ${testMsg.ok ? "text-signal" : "text-miss"}`}>{testMsg.text}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
