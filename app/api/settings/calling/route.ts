export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { unauthorized, forbidUnless } from "@/lib/auth";
import { getClientById, updateClient } from "@/lib/supabase";
import { rulesFromClient, describeRules, insideWindow, nextWindowOpen, countDnc } from "@/lib/compliance";
import { audit } from "@/lib/audit";

function view(c: any) {
  const r = rulesFromClient(c);
  const next = nextWindowOpen(r);
  return { rules: r, summary: describeRules(r), openNow: insideWindow(r), nextOpen: next ? next.toISOString() : null };
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const client = await getClientById(session.clientId);
  return Response.json({ ...view(client), dncCount: await countDnc(session.clientId).catch(() => 0) });
}

/** PATCH { timezone?, windowStart?, windowEnd?, days?, enforce? } */
export async function PATCH(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const patch: any = {};
  if (b.timezone !== undefined) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: String(b.timezone) }); } catch { return Response.json({ error: "Unknown timezone" }, { status: 400 }); }
    patch.timezone = String(b.timezone);
  }
  const mins = (v: any) => Number.isInteger(v) && v >= 0 && v <= 1440;
  if (b.windowStart !== undefined) { if (!mins(b.windowStart)) return Response.json({ error: "Bad start time" }, { status: 400 }); patch.calling_window_start = b.windowStart; }
  if (b.windowEnd !== undefined) { if (!mins(b.windowEnd)) return Response.json({ error: "Bad end time" }, { status: 400 }); patch.calling_window_end = b.windowEnd; }
  if (b.days !== undefined) {
    if (!Array.isArray(b.days) || !b.days.length || b.days.some((d: any) => !Number.isInteger(d) || d < 0 || d > 6)) return Response.json({ error: "Pick at least one calling day." }, { status: 400 });
    patch.calling_days = Array.from(new Set(b.days as number[])).sort();
  }
  if (typeof b.enforce === "boolean") patch.enforce_calling_window = b.enforce;
  const start = patch.calling_window_start ?? undefined, end = patch.calling_window_end ?? undefined;
  const before: any = await getClientById(session.clientId);
  const s = start ?? before?.calling_window_start ?? 540, e = end ?? before?.calling_window_end ?? 1260;
  if (s >= e) return Response.json({ error: "The window has to end after it starts." }, { status: 400 });
  if (!Object.keys(patch).length) return Response.json({ error: "Nothing to change" }, { status: 400 });
  const updated = await updateClient(session.clientId, patch);
  await audit(session, "calling_rules_changed", { req, targetType: "client", targetId: session.clientId, detail: { from: describeRules(rulesFromClient(before)), to: describeRules(rulesFromClient(updated)) } });
  return Response.json({ ok: true, ...view(updated) });
}
