export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";

const TRIGGERS = ["dm_keyword", "comment_keyword", "welcome"];
const ok = (id: any) => /^[0-9a-f-]{36}$/i.test(String(id || ""));
function clean(b: any): { row: any; error?: string } {
  const row: any = {};
  if ("name" in b) { row.name = String(b.name || "").trim().slice(0, 100); if (!row.name) return { row, error: "Give the rule a name." }; }
  if ("trigger" in b) { if (!TRIGGERS.includes(b.trigger)) return { row, error: "Pick when the rule fires." }; row.trigger = b.trigger; }
  if ("keywords" in b) row.keywords = (Array.isArray(b.keywords) ? b.keywords : String(b.keywords || "").split(",")).map((k: any) => String(k).trim().toLowerCase()).filter(Boolean).slice(0, 30);
  if ("match" in b) row.match = b.match === "exact" ? "exact" : "contains";
  if ("platforms" in b) row.platforms = (Array.isArray(b.platforms) ? b.platforms : []).filter((p: any) => ["instagram", "messenger", "facebook"].includes(p));
  if ("postIds" in b) row.post_ids = (Array.isArray(b.postIds) ? b.postIds : String(b.postIds || "").split(",")).map((x: any) => String(x).trim()).filter(Boolean).slice(0, 50);
  if ("reply" in b) { row.reply = String(b.reply || "").trim().slice(0, 1000); if (!row.reply) return { row, error: "Write the reply." }; }
  if ("publicReply" in b) row.public_reply = String(b.publicReply || "").trim().slice(0, 300) || null;
  if ("createLead" in b) row.create_lead = !!b.createLead;
  if ("handoff" in b) row.handoff = !!b.handoff;
  if ("enabled" in b) row.enabled = !!b.enabled;
  if ("priority" in b) row.priority = Math.max(1, Math.min(999, Math.round(Number(b.priority) || 100)));
  return { row };
}

/** GET → all rules. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  return Response.json({ rules: (await sb<any[]>(`/meta_rules?order=priority.asc`).catch(() => [])) || [] });
}
/** POST → add a rule (founders / Operations). */
export async function POST(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "clients"); if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const { row, error } = clean({ name: "", reply: "", trigger: "dm_keyword", ...b });
  if (error) return Response.json({ error }, { status: 400 });
  if (row.trigger !== "welcome" && !row.keywords?.length) return Response.json({ error: "Add at least one keyword." }, { status: 400 });
  const [r] = await sb<any[]>(`/meta_rules`, { method: "POST", body: JSON.stringify({ ...row, created_by: session!.email }) });
  return Response.json({ ok: true, rule: r }, { status: 201 });
}
/** PATCH { id, ...fields } → edit or switch a rule on/off. */
export async function PATCH(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "clients"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  if (!ok(b.id)) return Response.json({ error: "Not found" }, { status: 404 });
  const { row, error } = clean(b);
  if (error) return Response.json({ error }, { status: 400 });
  row.updated_at = new Date().toISOString();
  const [r] = await sb<any[]>(`/meta_rules?id=eq.${b.id}`, { method: "PATCH", body: JSON.stringify(row) });
  return Response.json({ ok: true, rule: r });
}
/** DELETE ?id= → remove a rule. */
export async function DELETE(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "clients"); if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!ok(id)) return Response.json({ error: "Not found" }, { status: 404 });
  await sb(`/meta_rules?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
  return Response.json({ ok: true });
}
