// Which client and AI employee answer a call on RANA's own voice engine, with the compiled script.
// Called by the self-hosted agent (voice-agent/) at the start of every call. Signed with RANA_VOICE_SECRET.
//
// Body: { to?: "+9140…" (RANA number that was dialled, inbound), remote?: "+91…" (the customer's number), direction: "inbound" | "outbound",
//         script_id?: uuid (outbound calls name their employee), caller?: { name?, variables? } }
import { sb } from "@/lib/db";
import { getActiveScript, getClientById } from "@/lib/supabase";
import { normalisePhone } from "@/lib/campaigns";
import { sessionPayload } from "@/lib/sarvamAgent";
import { dncSet, insideWindow, rulesFromClient } from "@/lib/compliance";
import { verify, voiceSecret } from "@/lib/voice/rana";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  const bad = verify(voiceSecret(), { signature: req.headers.get("x-rana-signature"), timestamp: req.headers.get("x-rana-timestamp") }, raw);
  if (bad) return Response.json({ error: bad }, { status: 401 });
  let body: any;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const direction = body?.direction === "outbound" ? "outbound" : "inbound";

  let script: any = null;
  let client: any = null;
  if (body?.script_id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(body.script_id))) return Response.json({ error: "script_id must be a UUID." }, { status: 400 });
    script = ((await sb<any[]>(`/scripts?id=eq.${body.script_id}&limit=1`).catch(() => [])) || [])[0] || null;
    client = script ? await getClientById(script.client_id) : null;
  } else {
    const to = normalisePhone(String(body?.to || ""));
    if (!to) return Response.json({ error: "Give the dialled number (to) or a script_id." }, { status: 400 });
    const num = ((await sb<any[]>(`/phone_numbers?number=eq.${encodeURIComponent(to)}&status=eq.active&select=client_id&limit=1`).catch(() => [])) || [])[0];
    client = num ? await getClientById(num.client_id) : null;
    script = client ? await getActiveScript(client.id) : null;
  }
  if (!client) return Response.json({ error: "No active RANA number or employee matches this call." }, { status: 404 });
  if (client.is_active === false) return Response.json({ error: "This workspace is paused." }, { status: 403 });
  if (!script) return Response.json({ error: "This workspace has no published AI employee yet." }, { status: 404 });

  // Outbound: never dial someone on the client's do-not-call list, and only inside the legal calling window.
  if (direction === "outbound") {
    const callee = normalisePhone(String(body?.remote || ""));
    if (!callee) return Response.json({ error: "Outbound calls must give the customer's number (remote)." }, { status: 400 });
    const blocked = await dncSet(client.id, [callee]).catch(() => null);
    if (!blocked) return Response.json({ error: "Could not check the do-not-call list, so the call was not placed." }, { status: 503 });
    if (blocked.has(callee)) return Response.json({ error: "This number is on the do-not-call list.", dnc: true }, { status: 409 });
    if (!insideWindow(rulesFromClient(client))) return Response.json({ error: "Outside this client's legal calling hours.", window: true }, { status: 409 });
  }

  const s = sessionPayload(script, body?.caller, direction);
  return Response.json({
    client_id: client.id,
    client_name: client.company_name || client.name,
    script_id: script.id,
    employee: script.name,
    direction,
    instructions: s.agent_variables.rana_instructions || "",
    greeting: s.agent_variables.rana_greeting || s.initial_bot_message || "",
    language: script.starting_language || "te-IN",
    voice: script.voice_name || script.speaker || null,
    speech_rate: Number(script.speech_rate) || 1,
    transfer_to: s.agent_variables.transfer_to || null,
  });
}
