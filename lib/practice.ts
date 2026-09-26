// Talk-page practice (browser test calls). Sarvam bills these like calls (₹4.50 a started minute), so RANA
// meters them itself: every session is recorded when it starts and closed when it ends. A session that is
// never closed (tab closed, network lost) counts as the maximum length. Clients get a free allowance per
// billing period (RANA_FREE_PRACTICE_MIN, default 30); each session is capped at MAX_PRACTICE_S.
import { sb, sbAll } from "./db";

export const MAX_PRACTICE_S = Number(process.env.RANA_MAX_PRACTICE_SECONDS) || 600;

export async function startPractice(clientId: string, scriptId: string, email: string | null): Promise<string | null> {
  const r = await sb<any[]>(`/practice_sessions`, { method: "POST", body: JSON.stringify({ client_id: clientId, script_id: scriptId, user_email: email }) }).catch(() => null);
  return r?.[0]?.id || null;
}

export async function endPractice(id: string, clientId: string): Promise<number | null> {
  const rows = (await sb<any[]>(`/practice_sessions?id=eq.${id}&client_id=eq.${clientId}&select=started_at,ended_at`).catch(() => [])) || [];
  const row = rows[0];
  if (!row || row.ended_at) return null;
  const seconds = Math.max(0, Math.min(MAX_PRACTICE_S, Math.round((Date.now() - Date.parse(row.started_at)) / 1000)));
  await sb(`/practice_sessions?id=eq.${id}&client_id=eq.${clientId}&ended_at=is.null`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ ended_at: new Date().toISOString(), seconds }) }).catch(() => {});
  return seconds;
}

/** Seconds a session counts for: its recorded length, or time so far (capped) if still open. */
export function practiceSeconds(r: { started_at: string; ended_at: string | null; seconds: number | null }, now = Date.now()): number {
  if (r.ended_at) return Math.max(0, Number(r.seconds) || 0);
  return Math.max(0, Math.min(MAX_PRACTICE_S, Math.round((now - Date.parse(r.started_at)) / 1000)));
}

/** Minutes the way Sarvam bills them: every started minute counts. */
export const pulseMinutes = (secs: number[]) => secs.reduce((m, s) => (s > 0 ? m + Math.ceil(s / 60) : m), 0);

export async function practiceRows(from: Date, to: Date = new Date(), clientId?: string) {
  return (await sbAll<any>(`/practice_sessions?started_at=gte.${encodeURIComponent(from.toISOString())}&started_at=lt.${encodeURIComponent(to.toISOString())}${clientId ? `&client_id=eq.${clientId}` : ""}&select=client_id,started_at,ended_at,seconds&order=started_at.asc,id.asc`).catch(() => [])) || [];
}

export async function practiceMinutes(clientId: string, from: Date): Promise<number> {
  return pulseMinutes((await practiceRows(from, new Date(), clientId)).map((r) => practiceSeconds(r)));
}
