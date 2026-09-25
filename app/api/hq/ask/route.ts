export const runtime = "nodejs";
export const maxDuration = 60;
import { getSession } from "@/lib/session";
import { requireHq, hqCan } from "@/lib/hq";
import { hqOverview } from "@/lib/insights";
import { chat } from "@/lib/llm";

/** POST { question } → "Ask HQ": answers in plain language from today's HQ data (clients, usage, alerts, money). */
export async function POST(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "ai"); if (denied) return denied;
  const q = String((await req.json().catch(() => ({} as any))).question || "").trim().slice(0, 500);
  if (q.length < 3) return Response.json({ error: "Ask a question." }, { status: 400 });
  const o = await hqOverview();
  const facts = {
    today: new Date().toISOString().slice(0, 10),
    live: o.live, growth: o.growth, money: hqCan(session, "money") ? o.money : "hidden for this role",
    alerts: o.alerts.map((a) => `${a.level.toUpperCase()} ${a.client ? a.client + ": " : ""}${a.text}`),
    clients: o.clients.map((c) => ({
      name: c.name, plan: c.planName, status: c.status, health: c.health.score, healthReasons: c.health.why,
      minutesUsedThisPeriod: c.usage?.used, minutesIncluded: c.usage?.included, trialDaysLeft: c.usage?.trialDaysLeft,
      wallet: c.wallet, last7days: c.week, previous7days: c.prevWeek, callsToday: c.today.total,
      daysSinceLogin: c.daysSinceLogin, unpaid: c.outstanding, overdue: c.overdue,
    })),
  };
  try {
    const answer = await chat([
      { role: "system", content: "You are the operations analyst for RANA AI, an Indian voice-AI calling SaaS. Answer the founder's question using ONLY the JSON facts given. Be direct: lead with the answer, then at most 5 short bullet points with client names and numbers, then one suggested action. Use ₹ and Indian number formatting. If the facts don't contain the answer, say what's missing. Reply in the language of the question (English, Telugu or Hindi)." },
      { role: "user", content: `Facts (JSON):\n${JSON.stringify(facts).slice(0, 24000)}\n\nQuestion: ${q}` },
    ], { maxTokens: 700, temperature: 0.2, timeoutMs: 45000 });
    return Response.json({ answer });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 502 });
  }
}
