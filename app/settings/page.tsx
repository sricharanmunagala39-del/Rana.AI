"use client";
import { useState } from "react";
import Sidebar from "@/components/Sidebar";

type Diagnostic = {
  appId: string;
  expectedWebhookUrl: string;
  totalDeploymentsInWorkspace: number;
  matchingDeployments: {
    deployment_id: string;
    name: string | null;
    status: string | null;
    channel_direction: string;
    app_version: number;
    current_webhook_config: { url?: string } | null;
    already_correct: boolean;
  }[];
  rawSample: unknown[];
};

export default function SettingsPage() {
  const [diag, setDiag] = useState<Diagnostic | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [settingId, setSettingId] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<Record<string, string>>({});

  async function check() {
    setLoading(true); setError(""); setDiag(null);
    try {
      const res = await fetch("/api/admin/sarvam-webhook");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ? `${data.error}${data.detail ? " — " + JSON.stringify(data.detail) : ""}` : "Failed");
      setDiag(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function connect(deploymentId: string) {
    setSettingId(deploymentId);
    setResultMsg((m) => ({ ...m, [deploymentId]: "" }));
    try {
      const res = await fetch("/api/admin/sarvam-webhook", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deploymentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ? `${data.error}${data.detail ? " — " + JSON.stringify(data.detail) : ""}` : "Failed");
      setResultMsg((m) => ({ ...m, [deploymentId]: "Connected ✓" }));
      check();
    } catch (e: any) {
      setResultMsg((m) => ({ ...m, [deploymentId]: `Error: ${e.message}` }));
    } finally { setSettingId(null); }
  }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="settings" />
      <main className="flex-1 box-border p-11 flex flex-col gap-6 max-w-[820px]">
        <div>
          <h1 className="font-display text-[26px] font-semibold m-0">Voice engine connection</h1>
          <div className="text-[13px] text-ink-soft mt-1">
            Check whether Sarvam is sending call results to RANA, and fix it if not — using Sarvam&apos;s official Deployments API, not the dashboard.
          </div>
        </div>

        <button onClick={check} disabled={loading} className="bg-ink text-white rounded-lg px-4 py-2.5 text-[13.5px] font-semibold w-fit disabled:opacity-50">
          {loading ? "Checking…" : "Check webhook status"}
        </button>

        {error && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5 whitespace-pre-wrap">{error}</div>}

        {diag && (
          <div className="flex flex-col gap-4">
            <div className="text-[12.5px] text-ink-soft">
              Agent <code className="bg-paper px-1 rounded">{diag.appId}</code> · {diag.totalDeploymentsInWorkspace} deployment(s) in workspace, {diag.matchingDeployments.length} belong to this agent.
            </div>

            {diag.matchingDeployments.length === 0 && (
              <div className="text-[13px] text-ink-soft bg-raised border border-line rounded-lg p-4">
                No deployment found for this agent yet. You need to create one (bind the agent to a phone number) in the Sarvam dashboard before a webhook can be attached to it.
              </div>
            )}

            {diag.matchingDeployments.map((d) => (
              <div key={d.deployment_id} className="bg-raised border border-line rounded-lg p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[14px] font-semibold">{d.name || d.deployment_id}</div>
                    <div className="text-[12px] text-ink-soft">{d.channel_direction} · v{d.app_version} · {d.status}</div>
                  </div>
                  {d.already_correct ? (
                    <span className="text-[12px] font-semibold text-signal bg-signal-tint px-2.5 py-1 rounded-full">Connected ✓</span>
                  ) : (
                    <button onClick={() => connect(d.deployment_id)} disabled={settingId === d.deployment_id}
                      className="text-[12.5px] font-semibold bg-signal text-white rounded-lg px-3 py-1.5 disabled:opacity-50">
                      {settingId === d.deployment_id ? "Connecting…" : "Connect webhook"}
                    </button>
                  )}
                </div>
                <div className="text-[11.5px] text-ink-soft font-mono break-all">
                  current: {d.current_webhook_config?.url || "(none set)"}
                </div>
                {resultMsg[d.deployment_id] && <div className="text-[12.5px] whitespace-pre-wrap break-all">{resultMsg[d.deployment_id]}</div>}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
