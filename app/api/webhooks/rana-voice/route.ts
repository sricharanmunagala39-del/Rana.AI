// Finished calls from RANA's own voice engine (voice-agent/). Signed with RANA_VOICE_SECRET (see lib/voice/rana.ts).
// Runs the same after-call steps as the Sarvam webhook: AI read, opt-out → do-not-call, handoff alert,
// the client's lead alerts, and the Promise Engine. A retried delivery updates the same call row.
import { getClientById } from "@/lib/supabase";
import { existingCall, upsertCall } from "@/lib/calls";
import { applyInsight } from "@/lib/callInsight";
import { optOutPhrase, addDnc } from "@/lib/compliance";
import { normalisePhone } from "@/lib/campaigns";
import { handoffAfterCall } from "@/lib/handoffAlert";
import { leadAlertsAfterCall } from "@/lib/leadAlerts";
import { recordPromisesForCall } from "@/lib/promises/store";
import { payloadProblem, ranaPayloadToCall, verify, voiceSecret, type RanaCallPayload } from "@/lib/voice/rana";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  const bad = verify(voiceSecret(), { signature: req.headers.get("x-rana-signature"), timestamp: req.headers.get("x-rana-timestamp") }, raw);
  if (bad) return Response.json({ error: bad }, { status: 401 });
  let p: RanaCallPayload;
  try { p = JSON.parse(raw); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const problem = payloadProblem(p);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  const client: any = await getClientById(p.client_id);
  if (!client) return Response.json({ error: "Unknown client." }, { status: 404 });

  try {
    const row: any = ranaPayloadToCall(p);
    row.engine = "rana";
    const prev: any = await existingCall(row.interaction_id);
    if (prev && prev.client_id !== client.id) return Response.json({ error: "That call belongs to another workspace." }, { status: 409 });
    if (prev?.lead_reason === "Set manually by your team.") { delete row.lead_status; delete row.lead_reason; }
    if (prev?.insight) { delete row.lead_status; delete row.lead_reason; delete row.summary; }
    if (prev?.handoff) row.follow_up = true;

    let saved: any = await upsertCall(row);
    if (row.source !== "manual") saved = await applyInsight(client, { ...saved, insight: prev?.insight || saved.insight || null }, { keepLead: prev?.lead_reason === "Set manually by your team." });

    const phone = normalisePhone(String(row.caller_phone || ""));
    const said = optOutPhrase((row.transcript || []).filter((t: any) => t.role === "user").map((t: any) => t.text).join(" "));
    if (said && phone && row.source !== "manual") {
      await addDnc(client.id, [{ phone, source: "caller_request", reason: `Caller said "${said}"`, callId: String(row.interaction_id) }]).catch(() => {});
    }

    let handoff = prev?.handoff || null;
    if (!handoff && row.source !== "manual" && (row.duration_seconds ?? 0) > 0) {
      handoff = await handoffAfterCall(client, saved, { rana_script_id: p.script_id }).catch((e: any) => { console.error("[rana-voice] handoff", e?.message); return null; });
    }
    const alerts = await leadAlertsAfterCall(client, { ...saved, handoff: handoff || saved.handoff || null, follow_up: saved.follow_up || !!handoff });
    const promises = await recordPromisesForCall(client, { ...saved, handoff: handoff || saved.handoff || null });
    return Response.json({ ok: true, id: saved.id, lead_status: saved.lead_status, handoff: handoff ? handoff.rule : null, alerts, promises });
  } catch (err: any) {
    console.error("[rana-voice] failed", err?.message);
    return Response.json({ error: "Failed to store call." }, { status: 500 });
  }
}
