// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { DEFAULT_AGENT_SETTINGS, getAgentSettings, LANGUAGES } from "@/lib/storage";

export default function EmployeesPage() {
  const [legacySettings, setLegacySettings] = useState(DEFAULT_AGENT_SETTINGS);
  const [legacyPublishInfo, setLegacyPublishInfo] = useState<{ agentId?: string } | null>(null);
  const [legacyLoading, setLegacyLoading] = useState(true);

  const [scripts, setScripts] = useState<any[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(true);
  const [scriptsError, setScriptsError] = useState("");

  useEffect(() => {
    setLegacySettings(getAgentSettings());
    (async () => {
      try {
        const res = await fetch("/api/admin/cartesia-agent");
        const data = await res.json();
        if (res.ok && data.agentId) setLegacyPublishInfo({ agentId: data.agentId });
      } catch { /* stays "Not hired" */ }
      finally { setLegacyLoading(false); }
    })();
    (async () => {
      try {
        const res = await fetch("/api/scripts");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load agents.");
        setScripts(data.scripts || []);
      } catch (err: any) {
        setScriptsError(err?.message || "Something went wrong.");
      } finally { setScriptsLoading(false); }
    })();
  }, []);

  const legacyPublished = !!legacyPublishInfo?.agentId;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="employees" />
      <div className="flex-1 p-10">
        <div className="max-w-[820px]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-[20px] font-display font-semibold">My Employees</div>
              <div className="text-[13px] text-ink-soft mt-0.5">Every AI employee working for DBMCI right now.</div>
            </div>
            <a href="/agents/new" className="bg-signal text-white rounded-lg px-4 py-2 text-[12.5px] font-semibold">+ New employee</a>
          </div>

          <div className="flex flex-col gap-3">
            {/* Legacy single default agent — configured via the original /agent editor. */}
            <div className="border border-line rounded-2xl bg-white p-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-signal-tint flex items-center justify-center text-signal font-display font-bold text-2xl shrink-0">
                {legacySettings.agentName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-[16px] font-semibold">{legacySettings.agentName}</div>
                  <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${legacyPublished ? "bg-signal-tint text-signal" : "bg-paper border border-line text-ink-soft"}`}>
                    {legacyLoading ? "Checking…" : legacyPublished ? "Hired · Live on Cartesia" : "Not hired yet"}
                  </span>
                </div>
                <div className="text-[13px] text-ink-soft mt-0.5">NEET PG / INICET / FMGE admissions counsellor · DBMCI South India</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <a href="/talk" className="bg-signal text-white rounded-lg px-4 py-2 text-[12.5px] font-semibold">Talk</a>
                <a href="/agent" className="border border-line bg-white rounded-lg px-4 py-2 text-[12.5px] font-semibold hover:bg-paper">Open page</a>
              </div>
            </div>

            {scriptsLoading && <div className="text-[12.5px] text-ink-soft px-1">Loading the rest of your team…</div>}
            {scriptsError && <div className="text-[12.5px] text-miss px-1">{scriptsError}</div>}

            {scripts.map((s) => {
              const published = !!s.cartesia_agent_id;
              const langLabel = LANGUAGES.find((l) => l.code === s.starting_language)?.label ?? s.starting_language;
              return (
                <div key={s.id} className="border border-line rounded-2xl bg-white p-5 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-signal-tint flex items-center justify-center text-signal font-display font-bold text-2xl shrink-0">
                    {(s.name || "?").charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-[16px] font-semibold">{s.name}</div>
                      <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${published ? "bg-signal-tint text-signal" : "bg-paper border border-line text-ink-soft"}`}>
                        {published ? "Hired · Live on Cartesia" : "Not hired yet"}
                      </span>
                      {s.status === "active" && (
                        <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Answers inbound line</span>
                      )}
                    </div>
                    <div className="text-[13px] text-ink-soft mt-0.5">{langLabel} · {(s.steps || []).length} script steps</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <a href={`/talk?scriptId=${s.id}`} className="bg-signal text-white rounded-lg px-4 py-2 text-[12.5px] font-semibold">Talk</a>
                    <a href={`/agents/new?id=${s.id}`} className="border border-line bg-white rounded-lg px-4 py-2 text-[12.5px] font-semibold hover:bg-paper">Edit</a>
                  </div>
                </div>
              );
            })}

            {!scriptsLoading && !scriptsError && scripts.length === 0 && (
              <div className="border border-dashed border-line rounded-2xl p-8 text-center">
                <div className="text-[13.5px] text-ink-soft">No custom agents yet. Click <span className="font-semibold">+ New employee</span> to write one from scratch — pick its language, voice and script.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
