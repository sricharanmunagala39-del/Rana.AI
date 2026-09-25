export const runtime = "nodejs";
export const maxDuration = 60;
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { chatJson } from "@/lib/llm";
import { audit } from "@/lib/audit";

/** POST { clientId } → AI grades up to 6 recent connected calls: did the employee follow its script, tone, missed steps. */
export async function POST(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "ai"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  const id = String(b.clientId || "").replace(/[^0-9a-f-]/gi, "");
  const [c] = (await sb<any[]>(`/clients?id=eq.${id}&is_hq=eq.false&select=id,name&limit=1`)) || [];
  if (!c) return Response.json({ error: "Client not found" }, { status: 404 });
  const calls = (await sb<any[]>(`/calls?client_id=eq.${c.id}&duration_seconds=gt.20&transcript=not.is.null&select=id,created_at,duration_seconds,caller_name,caller_phone,transcript,summary,lead_status&order=created_at.desc&limit=6`)) || [];
  if (!calls.length) return Response.json({ error: "No recent connected calls with a transcript to grade yet." }, { status: 400 });
  const scripts = (await sb<any[]>(`/scripts?client_id=eq.${c.id}&published_at=not.is.null&select=name,greeting,instructions,steps&limit=3`)) || [];
  const tx = (t: any) => (typeof t === "string" ? t : JSON.stringify(t)).slice(0, 3500);
  try {
    const out = await chatJson<{ calls: { id: string; score: number; followedScript: boolean; tone: string; missed: string[]; good: string[] }[]; overall: string; fixes: string[] }>([
      { role: "system", content: "You are a call-quality reviewer for AI voice agents at an Indian company. Grade each call 0–10 against the employee's script and instructions: did it greet correctly, follow the steps, answer accurately, handle objections, capture the lead, stay polite and in the caller's language. Reply ONLY with JSON: {\"calls\":[{\"id\",\"score\",\"followedScript\",\"tone\",\"missed\":[],\"good\":[]}],\"overall\":\"2 sentences\",\"fixes\":[\"up to 4 concrete script changes\"]}." },
      { role: "user", content: `Scripts:\n${JSON.stringify(scripts).slice(0, 6000)}\n\nCalls:\n${calls.map((k) => `--- id ${k.id} (${Math.round(k.duration_seconds)}s, lead: ${k.lead_status || "?"})\n${tx(k.transcript)}`).join("\n")}` },
    ], { maxTokens: 1800, temperature: 0.1, timeoutMs: 55000 });
    await audit(session!, "lead_updated", { req, targetType: "client", targetId: c.id, detail: { qa: true, calls: calls.length } });
    const byId: Record<string, any> = Object.fromEntries(calls.map((k) => [k.id, k]));
    return Response.json({ client: c.name, overall: out.overall, fixes: out.fixes || [], calls: (out.calls || []).map((g) => ({ ...g, when: byId[g.id]?.created_at, who: byId[g.id]?.caller_name || byId[g.id]?.caller_phone, seconds: byId[g.id]?.duration_seconds })) });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 502 });
  }
}
