export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { replyInThread, withinWindow, ensureDeal } from "@/lib/metaInbox";
import { canSend } from "@/lib/meta";

const ok = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
async function thread(id: string) { const [t] = (await sb<any[]>(`/meta_threads?id=eq.${id}&limit=1`).catch(() => [])) || []; return t || null; }

/** GET → one conversation with its messages (marks it read). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  if (!ok(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  const t = await thread(params.id); if (!t) return Response.json({ error: "Not found" }, { status: 404 });
  const messages = (await sb<any[]>(`/meta_messages?thread_id=eq.${t.id}&order=created_at.asc&limit=500`).catch(() => [])) || [];
  if (t.unread) await sb(`/meta_threads?id=eq.${t.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ unread: 0 }) }).catch(() => {});
  const deal = t.crm_deal_id ? ((await sb<any[]>(`/crm_deals?id=eq.${t.crm_deal_id}&select=id,business,stage,phone&limit=1`).catch(() => [])) || [])[0] || null : null;
  return Response.json({ thread: { ...t, unread: 0 }, messages, deal, canReply: canSend() && withinWindow(t.last_inbound_at) });
}

/** POST { text } → send a reply as a person (only within 24 hours of their last message). Founders / Operations. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "clients"); if (denied) return denied;
  if (!ok(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  const t = await thread(params.id); if (!t) return Response.json({ error: "Not found" }, { status: 404 });
  const b = await req.json().catch(() => ({} as any));
  const text = String(b.text || "").trim().slice(0, 1000);
  if (!text) return Response.json({ error: "Write a reply first." }, { status: 400 });
  if (!canSend()) return Response.json({ error: "Instagram/Facebook isn't connected yet (META_PAGE_ACCESS_TOKEN missing in Vercel)." }, { status: 409 });
  if (!withinWindow(t.last_inbound_at)) return Response.json({ error: "Meta only allows replies within 24 hours of their last message. Wait for them to message again." }, { status: 409 });
  const r = await replyInThread(t, text, "human");
  if (!r.ok) return Response.json({ error: r.error || "Meta refused the message." }, { status: 502 });
  // A person replied → the AI steps back in this chat until switched on again.
  await sb(`/meta_threads?id=eq.${t.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ mode: t.mode === "closed" ? "closed" : "human", needs_human: false }) });
  if (t.crm_deal_id) await sb(`/crm_deals?id=eq.${t.crm_deal_id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ last_contact_at: new Date().toISOString(), last_activity_at: new Date().toISOString() }) }).catch(() => {});
  return Response.json({ ok: true });
}

/** PATCH { mode?, needsHuman?, createLead?, business?, phone? } → hand over to AI / a person / close, or add to the CRM. Founders / Operations. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "clients"); if (denied) return denied;
  if (!ok(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  const t = await thread(params.id); if (!t) return Response.json({ error: "Not found" }, { status: 404 });
  const b = await req.json().catch(() => ({} as any));
  const patch: any = { updated_at: new Date().toISOString() };
  if (["agent", "human", "closed"].includes(b.mode)) patch.mode = b.mode;
  if ("needsHuman" in b) patch.needs_human = !!b.needsHuman;
  if (b.createLead) {
    const lead = { ...(t.lead || {}), ...(b.business ? { business: String(b.business).slice(0, 150) } : {}), ...(b.phone ? { phone: String(b.phone) } : {}) };
    const { phoneOf } = await import("@/lib/crm");
    if (lead.phone) lead.phone = phoneOf(lead.phone);
    await sb(`/meta_threads?id=eq.${t.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ lead }) });
    const dealId = await ensureDeal({ ...t, lead }, lead);
    if (!dealId) return Response.json({ error: "Couldn't add it to the CRM." }, { status: 500 });
  }
  await sb(`/meta_threads?id=eq.${t.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify(patch) });
  return Response.json({ ok: true, thread: await thread(t.id) });
}
