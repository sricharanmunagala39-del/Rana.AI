export const runtime = "nodejs";
export const maxDuration = 60;
import { getScriptById } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { chatJson, llmProvider } from "@/lib/llm";

/**
 * POST { transcript: [{role, text}] } → the AI test coach: grades one test call of this employee against the
 * five pre-deploy checks, using the employee's own greeting, instructions and facts as the answer key.
 * → { score, verdict, checks: { greeting|facts|language|objection|unknown: { pass: true|false|null, note } }, fixes: string[] }
 */
const KEYS = ["greeting", "facts", "language", "objection", "unknown"] as const;
const clip = (v: any, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const s: any = await getScriptById(params.id);
  if (!s || s.client_id !== session.clientId) return Response.json({ error: "Not found" }, { status: 404 });
  if (!llmProvider()) return Response.json({ error: "The test coach isn't available right now." }, { status: 503 });
  const b = await req.json().catch(() => ({} as any));
  const turns = (Array.isArray(b.transcript) ? b.transcript : []).slice(0, 80).map((t: any) => `${t?.role === "user" ? "Tester" : "Employee"}: ${clip(t?.text, 500)}`);
  if (turns.filter((t: string) => t.startsWith("Tester")).length < 1) return Response.json({ error: "Talk to the employee first — then I'll grade the call." }, { status: 400 });
  const key = [`Name: ${s.name}`, `Greeting: ${clip(s.greeting, 400)}`, `Instructions: ${clip(s.instructions, 3000)}`, `Facts: ${clip(typeof s.facts === "string" ? s.facts : JSON.stringify(s.facts || ""), 3000)}`].join("\n");
  try {
    const r = await chatJson([
      { role: "system", content: "You are a strict QA coach for AI phone agents. Grade ONE test call against the agent's own script. Judge only what happened in the transcript. JSON only, English." },
      { role: "user", content: `AGENT SCRIPT (answer key):\n${key}\n\nTEST CALL:\n${turns.join("\n")}\n\nChecks:\n- greeting: greets correctly and says who it is\n- facts: answers questions correctly per the script (no wrong prices/dates)\n- language: switches language when the caller does\n- objection: handles "not interested" / "call me later" politely\n- unknown: doesn't make things up when it doesn't know\n\nReturn JSON: {"score": 0-100, "verdict": "one sentence", "checks": {"greeting": {"pass": true|false|null, "note": "max 14 words"}, "facts": {...}, "language": {...}, "objection": {...}, "unknown": {...}}, "fixes": ["up to 3 concrete script fixes, max 18 words each"]}. Use pass=null when the call never tested that check.` },
    ], { maxTokens: 700, temperature: 0.1, timeoutMs: 40000 });
    const checks: Record<string, { pass: boolean | null; note: string }> = {};
    for (const k of KEYS) { const c = r?.checks?.[k] || {}; checks[k] = { pass: c.pass === true ? true : c.pass === false ? false : null, note: clip(c.note, 120) }; }
    return Response.json({ score: Math.max(0, Math.min(100, Number(r?.score) || 0)), verdict: clip(r?.verdict, 200), checks, fixes: (Array.isArray(r?.fixes) ? r.fixes : []).slice(0, 3).map((x: any) => clip(x, 160)).filter(Boolean) });
  } catch (e: any) {
    return Response.json({ error: "Couldn't grade this call — try again." }, { status: 502 });
  }
}
