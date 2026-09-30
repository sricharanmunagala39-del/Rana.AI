export const runtime = "nodejs";
import { chatJson, llmProvider } from "@/lib/llm";
import { getWebTalk, finishWebTalk } from "@/lib/webTalk";
import { scenarioOf } from "@/app/landing/talkContent";

/**
 * Public: POST { talkId, secret, transcript } DURING a website conversation → what the live lead card knows so far.
 * Talk to Rana: { fields: { business, city, calls, pain, languages, name }, score, interest }.
 * Instant demo: { fields: [{label, value}], score, tag }.
 * Cheap and capped: at most MAX_PEEKS per conversation, only while it is live.
 */
const MAX_PEEKS = 8;
const clip = (v: any, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({} as any));
  const id = String(b.talkId || "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const row = await getWebTalk(id);
  if (!row || row.secret !== String(b.secret || "")) return Response.json({ error: "not found" }, { status: 404 });
  const age = (Date.now() - Date.parse(row.started_at)) / 1000;
  if (row.ended_at || age > (Number(row.max_seconds) || 180) + 30) return Response.json({ error: "ended" }, { status: 409 });
  if ((Number(row.peeks) || 0) >= MAX_PEEKS || !llmProvider()) return Response.json({ skip: true });
  await finishWebTalk(id, { peeks: (Number(row.peeks) || 0) + 1 });

  const transcript = (Array.isArray(b.transcript) ? b.transcript : []).slice(-30)
    .map((t: any) => `${t?.role === "user" ? "Visitor" : "Rana"}: ${clip(t?.text, 400)}`).join("\n");
  if (!/Visitor:/.test(transcript)) return Response.json({ skip: true });

  try {
    if (row.kind === "demo") {
      const s = scenarioOf(row.scenario);
      const r = await chatJson([
        { role: "system", content: "You update a live CRM card while a call is happening. Use only what the customer actually said. JSON only." },
        { role: "user", content: `Business: ${s.business}. Call type: ${s.title}. The Visitor plays the customer.\nTranscript so far:\n${transcript}\n\nReturn JSON: {"fields":[{"label":"...","value":"..."}] (0-5 facts the customer gave so far, English, short values), "score": 0-100 (how likely this turns into a sale/booking), "tag": "a short CAPS status like QUALIFYING, HOT LEAD, BOOKED, OBJECTION: PRICE (max 24 chars)"}` },
      ], { maxTokens: 250, temperature: 0.1, timeoutMs: 12000 });
      return Response.json({ fields: Array.isArray(r?.fields) ? r.fields.slice(0, 5).map((f: any) => ({ label: clip(f?.label, 24), value: clip(f?.value, 60) })).filter((f: any) => f.label && f.value) : [], score: Math.max(0, Math.min(100, Number(r?.score) || 0)), tag: clip(r?.tag, 24).toUpperCase() });
    }
    const r = await chatJson([
      { role: "system", content: "You update a live lead card while a sales call is happening. Use only what the visitor actually said — never guess. JSON only." },
      { role: "user", content: `Rana (RANA AI's AI sales assistant) is talking with a website visitor.\nTranscript so far:\n${transcript}\n\nReturn JSON (null when not said yet; English; short values): {"name": string|null, "business": string|null, "city": string|null, "calls": string|null (their call/lead volume), "pain": string|null (main problem, max 6 words), "languages": string|null, "score": 0-100 (buying intent so far), "interest": "hot"|"warm"|"cold"}` },
    ], { maxTokens: 220, temperature: 0.1, timeoutMs: 12000 });
    const f = (k: string, n = 48) => (r?.[k] ? clip(Array.isArray(r[k]) ? r[k].join(", ") : r[k], n) : null);
    return Response.json({ fields: { name: f("name", 40), business: f("business"), city: f("city", 30), calls: f("calls", 40), pain: f("pain"), languages: f("languages", 40) }, score: Math.max(0, Math.min(100, Number(r?.score) || 0)), interest: ["hot", "warm", "cold"].includes(r?.interest) ? r.interest : "warm" });
  } catch (e: any) {
    console.error("[web talk peek]", e?.message || e);
    return Response.json({ skip: true });
  }
}
