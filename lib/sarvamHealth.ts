// Watches every call RANA makes to Sarvam. When Sarvam refuses because the credit balance is used up (or the key
// stops working), RANA HQ gets an email straight away (at most once an hour) and a red banner in HQ, and customers
// see a calm "back shortly" message instead of a raw error. The first successful call clears the alert.
// Also: safe retries for Sarvam's short hiccups (rate limits, 5xx, network blips) on requests that are safe to repeat.
import { sb } from "./db";

export type SarvamProblem = "credits" | "key" | "rate" | "down" | "other";

export function classifySarvamError(status: number, body: string): SarvamProblem {
  const t = String(body || "").toLowerCase();
  if (status === 402 || /insufficient|credit|balance|recharge|top.?up|payment required|quota exceeded|billing/.test(t)) return "credits";
  if (status === 401 || status === 403 || /invalid_api_key|unauthori[sz]ed|forbidden|api key/.test(t)) return "key";
  if (status === 429) return "rate";
  if (status >= 500 || status === 0) return "down";
  return "other";
}

export const CUSTOMER_MESSAGE: Record<SarvamProblem, string> = {
  credits: "Voice services are paused for a few minutes on RANA's side. RANA support has been alerted and is fixing it — please try again shortly.",
  key: "Voice services are paused for a few minutes on RANA's side. RANA support has been alerted and is fixing it — please try again shortly.",
  rate: "Lots of requests right now — please try again in a few seconds.",
  down: "The voice service didn't answer just now — please try again in a minute.",
  other: "That didn't work this time — please try again in a minute.",
};

let lastAlert = 0;
let knownBad = false;

async function hqEmails(): Promise<string[]> {
  return String(process.env.RANA_HQ_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Record a Sarvam failure. Credit/key problems raise the HQ alert. Never throws. */
export async function noteSarvamFailure(service: string, status: number, body: string): Promise<SarvamProblem> {
  const kind = classifySarvamError(status, body);
  if (kind !== "credits" && kind !== "key") return kind;
  try {
    knownBad = true;
    const reason = kind === "credits" ? "Sarvam credit balance is used up" : "Sarvam rejected RANA's API key";
    const now = new Date().toISOString();
    const rows = (await sb<any[]>(`/platform_status?key=eq.sarvam&select=ok,alerted_at,since`).catch(() => [])) || [];
    const prev = rows[0];
    const since = prev && prev.ok === false && prev.since ? prev.since : now;
    const alertedRecently = (prev?.alerted_at && Date.now() - Date.parse(prev.alerted_at) < 3600e3) || Date.now() - lastAlert < 3600e3;
    await sb(`/platform_status?on_conflict=key`, {
      method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify({ key: "sarvam", ok: false, service, reason: `${reason} (${service}: ${status} ${String(body).slice(0, 160)})`, since, updated_at: now, ...(alertedRecently ? {} : { alerted_at: now }) }),
    }).catch(() => {});
    if (!alertedRecently) {
      lastAlert = Date.now();
      const { sendEmail, emailHtml } = await import("./notify");
      await sendEmail({
        to: await hqEmails(), kind: "hq_sarvam_down",
        subject: kind === "credits" ? "URGENT: Sarvam credits are used up — client calls and AI features are stopped" : "URGENT: Sarvam rejected RANA's API key",
        html: emailHtml({
          title: kind === "credits" ? "Top up Sarvam now" : "Check the Sarvam API key",
          lines: kind === "credits"
            ? ["Sarvam refused a request because the credit balance is empty. Until it's topped up, calls, campaigns, the Talk page, voice previews and the AI script tools are stopped for every client.",
               "Top up at indus.sarvam.ai → Billing → Add credits, and turn on Auto top-up so it never runs out again."]
            : ["Sarvam refused RANA's API key. Check the keys in Vercel (SARVAM_CHAT_API_KEY / RANA_SARVAM_AGENTS_API_KEY) against dashboard.sarvam.ai → API Keys."],
          button: { label: "Open Sarvam billing", url: "https://indus.sarvam.ai/billing" },
        }),
      }).catch(() => {});
    }
  } catch {}
  return kind;
}

/** A Sarvam call worked: clear the alert (cheap: only writes when it was set). */
export async function noteSarvamOk(): Promise<void> {
  if (!knownBad) {
    // Another server instance may have set it; check at most once a minute.
    if (Date.now() - lastOkCheck < 60000) return;
    lastOkCheck = Date.now();
    const rows = (await sb<any[]>(`/platform_status?key=eq.sarvam&select=ok`).catch(() => [])) || [];
    if (!rows[0] || rows[0].ok) return;
  }
  knownBad = false;
  await sb(`/platform_status?key=eq.sarvam`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ ok: true, reason: null, since: null, updated_at: new Date().toISOString() }) }).catch(() => {});
}
let lastOkCheck = 0;

export async function sarvamStatus(): Promise<{ ok: boolean; reason: string | null; since: string | null }> {
  const rows = (await sb<any[]>(`/platform_status?key=eq.sarvam&select=ok,reason,since`).catch(() => [])) || [];
  return rows[0] ? { ok: rows[0].ok !== false, reason: rows[0].reason || null, since: rows[0].since || null } : { ok: true, reason: null, since: null };
}

/** An error whose message is safe to show a customer. */
export class SarvamError extends Error {
  kind: SarvamProblem; status: number;
  constructor(kind: SarvamProblem, status: number, detail: string) { super(detail); this.kind = kind; this.status = status; this.name = "SarvamError"; }
  get customerMessage() { return CUSTOMER_MESSAGE[this.kind]; }
}

/**
 * fetch() for Sarvam with health tracking. `retry: true` only for requests that are safe to repeat
 * (text-to-speech, speech-to-text, chat, reads) — never for anything that places a call.
 */
export async function sarvamFetch(service: string, url: string, init: RequestInit & { retry?: boolean; timeoutMs?: number } = {}): Promise<Response> {
  const { retry, timeoutMs, ...rest } = init;
  const attempts = retry ? 3 : 1;
  let last: Response | null = null; let lastErr: any = null;
  for (let i = 0; i < attempts; i++) {
    if (i) await new Promise((r) => setTimeout(r, 400 * 2 ** (i - 1) + Math.random() * 200));
    try {
      const res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs ?? 30000) });
      if (res.ok) { noteSarvamOk().catch(() => {}); return res; }
      last = res;
      if (!(res.status === 429 || res.status >= 500)) break; // 4xx other than 429: repeating won't help
    } catch (e) { lastErr = e; }
  }
  if (last) {
    const body = await last.clone().text().catch(() => "");
    await noteSarvamFailure(service, last.status, body);
    return last;
  }
  await noteSarvamFailure(service, 0, String(lastErr?.message || lastErr));
  throw new SarvamError("down", 0, `${service}: ${lastErr?.message || "network error"}`);
}

/** The message to show a customer for any error thrown while talking to Sarvam. */
export function friendly(e: any, fallback: string): string {
  return e && (e instanceof SarvamError || e.name === "SarvamError") && e.kind !== "other" ? CUSTOMER_MESSAGE[e.kind as SarvamProblem] : fallback;
}
