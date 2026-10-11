export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { dealPatch, addActivity, view, stageOf, STAGES, ACTIVITY_KINDS, NEEDS_FOLLOW_UP } from "@/lib/crm";

const ok = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const stageLabel = (k: string) => STAGES.find((s) => s.key === stageOf(k))?.label || k;

/** GET → one deal with its activity timeline. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  if (!ok(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [d] = (await sb<any[]>(`/crm_deals?id=eq.${params.id}&limit=1`)) || [];
  if (!d) return Response.json({ error: "Not found" }, { status: 404 });
  const activities = (await sb<any[]>(`/crm_activities?deal_id=eq.${d.id}&order=created_at.desc&limit=200`).catch(() => [])) || [];
  return Response.json({ deal: view(d), activities });
}

/** PATCH → change fields; a stage change is logged on the timeline. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  if (!ok(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [cur] = (await sb<any[]>(`/crm_deals?id=eq.${params.id}&limit=1`)) || [];
  if (!cur) return Response.json({ error: "Not found" }, { status: 404 });
  const b = await req.json().catch(() => ({} as any));
  const { patch, error } = dealPatch(b);
  if (error) return Response.json({ error }, { status: 400 });
  if (!Object.keys(patch).length) return Response.json({ error: "Nothing to change" }, { status: 400 });
  const nextStage = patch.stage || stageOf(cur.stage);
  const nextAt = "next_action_at" in patch ? patch.next_action_at : cur.next_action_at;
  if (patch.stage && patch.stage !== stageOf(cur.stage) && NEEDS_FOLLOW_UP.includes(nextStage) && (!nextAt || Date.parse(nextAt) < Date.now() - 60e3))
    return Response.json({ error: "Pick the next follow-up date (today or later).", needFollowUp: true }, { status: 400 });
  if (patch.stage === "not_interested" || patch.stage === "deal") { if (!("next_action_at" in patch)) patch.next_action_at = null; }
  patch.updated_at = new Date().toISOString();
  patch.last_activity_at = patch.updated_at;
  const [d] = await sb<any[]>(`/crm_deals?id=eq.${cur.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (patch.stage && patch.stage !== cur.stage) {
    await addActivity(cur.id, "stage", `${stageLabel(cur.stage)} → ${stageLabel(patch.stage)}${patch.stage === "not_interested" && patch.lost_reason ? ` (${patch.lost_reason})` : ""}${b.stageNote ? ` — ${String(b.stageNote).slice(0, 500)}` : ""}`, session!.email).catch(() => {});
    await audit(session!, "crm_stage_changed", { req, targetType: "crm_deal", targetId: cur.id, detail: { business: cur.business, from: cur.stage, to: patch.stage } }).catch(() => {});
  }
  if ("discount_pct" in patch && Number(patch.discount_pct) !== Number(cur.discount_pct)) await addActivity(cur.id, "system", `Discount offered: ${patch.discount_pct}%`, session!.email).catch(() => {});
  if ("owner" in patch && patch.owner !== cur.owner) await addActivity(cur.id, "system", `Owner: ${patch.owner || "nobody"}`, session!.email).catch(() => {});
  if ("next_action_at" in patch && patch.next_action_at && patch.next_action_at !== cur.next_action_at) await addActivity(cur.id, "system", `Next follow-up: ${new Date(patch.next_action_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}${patch.next_action ? ` — ${patch.next_action}` : ""}`, session!.email).catch(() => {});
  return Response.json({ ok: true, deal: view(d) });
}

/** POST { kind, text, nextAction?, nextActionAt? } → log a call / note / WhatsApp and optionally set the next follow-up. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  if (!ok(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  const b = await req.json().catch(() => ({} as any));
  const text = String(b.text || "").trim();
  if (!text) return Response.json({ error: "Write what happened." }, { status: 400 });
  const kind = ACTIVITY_KINDS[b.kind] ? b.kind : "note";
  await addActivity(params.id, kind, text, session!.email);
  const patch: any = { updated_at: new Date().toISOString() };
  patch.last_activity_at = patch.updated_at;
  if (["call", "whatsapp", "email", "meeting"].includes(kind)) patch.last_contact_at = patch.updated_at;
  const n = dealPatch({ ...("nextAction" in b ? { nextAction: b.nextAction } : {}), ...("nextActionAt" in b ? { nextActionAt: b.nextActionAt } : {}) }).patch;
  Object.assign(patch, n);
  const [d] = await sb<any[]>(`/crm_deals?id=eq.${params.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  return Response.json({ ok: true, deal: d ? view(d) : null });
}

/** DELETE → remove a deal (founders only). */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "team"); if (denied) return denied;
  if (!ok(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [d] = (await sb<any[]>(`/crm_deals?id=eq.${params.id}&select=id,business&limit=1`)) || [];
  if (!d) return Response.json({ error: "Not found" }, { status: 404 });
  await sb(`/crm_deals?id=eq.${d.id}`, { method: "DELETE", prefer: "return=minimal" });
  await audit(session!, "crm_deal_deleted", { req, targetType: "crm_deal", targetId: d.id, detail: { business: d.business } }).catch(() => {});
  return Response.json({ ok: true });
}
