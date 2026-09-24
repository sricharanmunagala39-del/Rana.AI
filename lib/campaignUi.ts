import type { PillTone } from "@/components/StatusPill";

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: PillTone }> = {
  draft: { label: "Draft", tone: "neutral" }, scheduled: { label: "Scheduled", tone: "warm" }, running: { label: "Running", tone: "signal" },
  paused: { label: "Stopped", tone: "neutral" }, completed: { label: "Completed", tone: "neutral" }, failed: { label: "Failed", tone: "miss" },
};
