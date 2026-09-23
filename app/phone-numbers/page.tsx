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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [label, setLabel] = useState("");
  const [assignToAgent, setAssignToAgent] = useState(true);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState("");

  const [deletingId, setDeletingId] = useState("");

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

  async function handleDelete(id: string) {
    if (!confirm("Release this number? This can't be undone.")) return;
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
            <div className="text-[13px] text-ink-soft mt-0.5">Numbers your Cartesia agents can answer or call from.</div>
          </div>

          <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-[12.5px] text-amber-900 leading-relaxed">
            <span className="font-semibold">For DBMCI's Indian leads:</span> Cartesia's own numbers below are US-only — both
            the number itself and any calls placed from it are limited to US destinations. To call or receive calls on an
            Indian number, you'd need to connect a Twilio account and import that number into Cartesia — that's a separate
            piece I haven't built yet (it also needs your own Twilio account + India's DLT registration). Ask me to build it
            once you're ready for that step.
          </div>

          <div className="border border-line rounded-xl bg-white p-5 flex flex-col gap-3">
            <div className="text-[14px] font-semibold">Buy a Cartesia number (US only)</div>
            <div className="flex gap-2">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`Label, e.g. "DBMCI US test line"`}
                className="flex-1 border border-line rounded-lg px-3 py-2 text-[13px] bg-paper outline-none focus:border-signal" />
              <button onClick={handleBuy} disabled={buying || !label.trim()}
                className="bg-signal text-white rounded-lg px-4 py-2 text-[12.5px] font-semibold disabled:opacity-40 whitespace-nowrap">
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

          <div className="border border-line rounded-xl bg-white overflow-hidden">
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
              <div className="p-6 text-center text-[12.5px] text-ink-soft">No numbers yet — buy one above, or connect Twilio once that's built.</div>
            )}
            {numbers.map((n) => (
              <div key={n.id} className="px-4 py-3 border-b border-line last:border-b-0 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold">{n.number}</div>
                  <div className="text-[12px] text-ink-soft mt-0.5">
                    {n.label || "Unlabelled"} · {n.provider === "twilio" ? "Twilio" : "Cartesia"}
                    {n.agentName ? ` · routes to ${n.agentName}` : " · not routed to an agent"}
                  </div>
                </div>
                <button onClick={() => handleDelete(n.id)} disabled={deletingId === n.id}
                  className="text-[12px] font-semibold text-miss border border-miss/20 rounded-lg px-3 py-1.5 hover:bg-miss-tint disabled:opacity-40">
                  {deletingId === n.id ? "Releasing…" : "Release"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
