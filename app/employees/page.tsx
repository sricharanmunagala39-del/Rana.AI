// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { DEFAULT_AGENT_SETTINGS, getAgentSettings } from "@/lib/storage";

export default function EmployeesPage() {
  const [settings, setSettings] = useState(DEFAULT_AGENT_SETTINGS);
  const [publishInfo, setPublishInfo] = useState<{ agentId?: string; hasWebhook?: boolean } | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    setSettings(getAgentSettings());
    (async () => {
      try {
        const res = await fetch("/api/admin/cartesia-agent");
        const data = await res.json();
        if (res.ok && data.agentId) setPublishInfo({ agentId: data.agentId, hasWebhook: data.hasWebhook });
      } catch { /* stays "Not hired" */ }
      finally { setStatusLoading(false); }
    })();
  }, []);

  const isPublished = !!publishInfo?.agentId;

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
            <a href="/agent" className="border border-line bg-white rounded-lg px-4 py-2 text-[12.5px] font-semibold hover:bg-paper">+ New employee</a>
          </div>

          <div className="border border-line rounded-2xl bg-white p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-signal-tint flex items-center justify-center text-signal font-display font-bold text-2xl shrink-0">
              {settings.agentName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-[16px] font-semibold">{settings.agentName}</div>
                <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${isPublished ? "bg-signal-tint text-signal" : "bg-paper border border-line text-ink-soft"}`}>
                  {statusLoading ? "Checking…" : isPublished ? "Hired · Live on Cartesia" : "Not hired yet"}
                </span>
              </div>
              <div className="text-[13px] text-ink-soft mt-0.5">NEET PG / INICET / FMGE admissions counsellor · DBMCI South India</div>
            </div>
            <div className="flex gap-2 shrink-0">
              <a href="/talk" className="bg-signal text-white rounded-lg px-4 py-2 text-[12.5px] font-semibold">Talk</a>
              <a href="/agent" className="border border-line bg-white rounded-lg px-4 py-2 text-[12.5px] font-semibold hover:bg-paper">Open page</a>
            </div>
          </div>

          <div className="mt-6 border border-dashed border-line rounded-2xl p-8 text-center">
            <div className="text-[13.5px] text-ink-soft">Hiring for a second role — Vizag, Vijayawada, or something else entirely — comes here next.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
