export const runtime = "nodejs";
export const maxDuration = 60;
import { unauthorized } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { listCallsLean, listCampaigns } from "@/lib/calls";
import { kpis } from "@/lib/metrics";
import { getClientById } from "@/lib/supabase";
import { zoneOf, dayStart, localDate, offsetMs, zoneLabel } from "@/lib/tz";
import { chat } from "@/lib/llm";
import { hideVendors } from "@/lib/voice/brand";

/** POST { question } → "Ask Rana": answers a business owner's question about their own calls (today + last 7 days). */
const hits = new Map<string, number[]>();
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const q = String((await req.json().catch(() => ({} as any))).question || "").trim().slice(0, 400);
  if (q.length < 3) return Response.json({ error: "Ask a question." }, { status: 400 });
  // 20 questions / 10 minutes per workspace.
  const now = Date.now(), h = (hits.get(session.clientId) || []).filter((t) => now - t < 600e3);
  if (h.length >= 20) return Response.json({ error: "Give me a minute — lots of questions just now." }, { status: 429 });
  hits.set(session.clientId, [...h, now]);

  const tz = zoneOf(await getClientById(session.clientId).catch(() => null));
  const zl = zoneLabel(tz);
  const startToday = dayStart(tz, localDate(tz, now));
  const rows = (await listCallsLean(session.clientId, new Date(startToday - 7 * 86400e3).toISOString(), new Date(now + 60e3).toISOString(), 4000).catch(() => [])).filter((r) => r.source !== "manual");
  const today = rows.filter((r) => Date.parse(r.created_at) >= startToday);
  const campaigns = (await listCampaigns(session.clientId).catch(() => [])).slice(0, 15).map((c) => ({ name: c.name, status: c.status, contacts: c.total_contacts, created: c.created_at.slice(0, 10) }));
  const t = (iso: string) => { const ms = Date.parse(iso); return new Date(ms + offsetMs(tz, ms)).toISOString().slice(0, 16).replace("T", " "); };
  const facts = {
    timeZone: zl, now: t(new Date(now).toISOString()),
    today: kpis(today), last7days: kpis(rows), campaigns,
    recentCalls: rows.slice(0, 60).map((r) => ({ at: t(r.created_at), dir: r.direction, name: r.caller_name, phone: r.caller_phone, secs: Math.round(Number(r.duration_seconds) || 0), lead: r.lead_status, why: r.lead_reason, followUp: r.follow_up, summary: r.summary?.slice(0, 200) })),
  };
  try {
    const answer = await chat([
      { role: "system", content: "You are Rana, the AI employee of this business, answering your manager's question about the calls you handled. Use ONLY the JSON facts. Lead with the answer in one sentence, then at most 4 short bullets with names, times (" + zl + ") and numbers, then one suggested next action. Keep it under 90 words — it may be read aloud. Reply in the language of the question. Never mention AI vendors or models." },
      { role: "user", content: `Facts (JSON):\n${JSON.stringify(facts).slice(0, 22000)}\n\nQuestion: ${q}` },
    ], { maxTokens: 400, temperature: 0.2, timeoutMs: 40000 });
    return Response.json({ answer: hideVendors(answer) });
  } catch (e: any) {
    return Response.json({ error: "Rana couldn't answer just now — try again." }, { status: 502 });
  }
}
