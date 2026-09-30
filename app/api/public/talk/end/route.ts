export const runtime = "nodejs";
import { chatJson, llmProvider } from "@/lib/llm";
import { getWebTalk, finishWebTalk } from "@/lib/webTalk";
import { scenarioOf } from "@/app/landing/talkContent";
import { sendEmail, emailHtml, APP_URL } from "@/lib/notify";
import { hqEmails } from "@/lib/hq";

/**
 * Public: POST { talkId, secret, transcript: [{ role, text }] } when a website conversation ends.
 * Records its length, and turns the transcript into what a real call produces: a lead card (Talk to Rana)
 * or the call outcome (Instant demo). HQ gets an email for every real Talk-to-Rana conversation.
 */
const clip = (v: any, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({} as any));
  const id = String(b.talkId || "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const row = await getWebTalk(id);
  if (!row || row.secret !== String(b.secret || "")) return Response.json({ error: "not found" }, { status: 404 });
  if (row.ended_at) return Response.json({ ok: true, result: row.result || null });

  const seconds = Math.max(0, Math.min(Number(row.max_seconds) || 180, Math.round((Date.now() - Date.parse(row.started_at)) / 1000)));
  const transcript = (Array.isArray(b.transcript) ? b.transcript : [])
    .map((t: any) => ({ role: t?.role === "user" ? "user" : "agent", text: clip(t?.text, 500) }))
    .filter((t: any) => t.text).slice(0, 80);
  const userTurns = transcript.filter((t: any) => t.role === "user").length;
  const text = transcript.map((t: any) => `${t.role === "user" ? "Visitor" : "Rana"}: ${t.text}`).join("\n");

  let result: any = null;
  if (userTurns && llmProvider()) {
    try {
      if (row.kind === "demo") {
        const s = scenarioOf(row.scenario);
        result = await chatJson([
          { role: "system", content: "You turn a phone-call transcript into the outcome a business would see in its CRM. Use only what was said. Reply with JSON only." },
          { role: "user", content: `Business: ${s.business}. Call type: ${s.title}. Rana is the business's AI employee; the Visitor played the customer.
Transcript:
${text}

Return JSON: {"outcome": "a short CRM tag in CAPS style like 'HOT LEAD · site visit Sat 11 AM' or 'APPOINTMENT · Thu 5 PM' or 'NOT INTERESTED · price' (max 70 chars, in English)", "fields": [{"label": "...", "value": "..."}] (2 to 5 facts the customer gave, e.g. Budget, Timeline, Slot, Objection, Name — in English), "summary": "one sentence in English about what happened"}` },
        ], { maxTokens: 400, temperature: 0.2, timeoutMs: 20000 });
      } else {
        result = await chatJson([
          { role: "system", content: "You turn a sales call transcript into a lead card for the sales team. Use only what the visitor actually said — never guess. Reply with JSON only." },
          { role: "user", content: `Rana (RANA AI's AI sales assistant) talked with a website visitor.
Transcript:
${text}

Return JSON (null for anything not said; all text in English): {"name": string|null, "company": string|null, "business": string|null (what they do), "city": string|null, "calls": string|null (call volume in their words), "languages": string[], "pain": string|null (their main problem, short), "phone": string|null, "email": string|null, "interest": "hot"|"warm"|"cold", "summary": "one or two sentences for the sales team", "next_step": "short suggestion"}` },
        ], { maxTokens: 500, temperature: 0.2, timeoutMs: 20000 });
      }
    } catch (e: any) { console.error("[web talk end] summarise", e?.message || e); }
  }

  await finishWebTalk(id, { ended_at: new Date().toISOString(), seconds, transcript, result });

  if (row.kind === "talk" && userTurns >= 2) {
    const r = result || {};
    const lines = [
      `<b>${esc(r.name || "A visitor")}</b>${r.company ? ` from <b>${esc(r.company)}</b>` : ""} talked to Rana on the website for ${Math.round(seconds / 6) / 10} min (${esc(row.language || "en")}, ${esc(row.market || "in")} page).`,
      ...(r.summary ? [esc(r.summary)] : []),
      `Business: ${esc(r.business || "—")}${r.city ? ` · ${esc(r.city)}` : ""} · Calls: ${esc(r.calls || "—")} · Pain: ${esc(r.pain || "—")} · Interest: <b>${esc(r.interest || "—")}</b>`,
      ...(r.phone || r.email ? [`📞 ${esc(r.phone || "—")} · ✉️ ${esc(r.email || "—")}`] : ["No contact details yet — they may book a demo from the page."]),
      `<details><summary>Transcript</summary>${transcript.map((t: any) => `<div><b>${t.role === "user" ? "Visitor" : "Rana"}:</b> ${esc(t.text)}</div>`).join("")}</details>`,
    ];
    const hq = Array.from(new Set([...hqEmails(), "hello@ranaai.in"]));
    await sendEmail({ to: hq, kind: "web_talk", subject: `Website visitor talked to Rana${r.company ? `: ${r.company}` : ""}${r.interest ? ` (${r.interest})` : ""}`, html: emailHtml({ title: "Talk to Rana — new conversation", lines, button: { label: "Open demo requests", url: `${APP_URL()}/hq/demos` } }) }).catch(() => {});
  }
  return Response.json({ ok: true, seconds, result });
}
