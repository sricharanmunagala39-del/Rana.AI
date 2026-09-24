export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { unauthorized, forbidUnless } from "@/lib/auth";
import { listDnc, addDnc, removeDnc, countDnc } from "@/lib/compliance";
import { normalisePhone } from "@/lib/campaigns";
import { audit } from "@/lib/audit";

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const q = new URL(req.url).searchParams.get("q") || undefined;
  const [rows, total] = await Promise.all([listDnc(session.clientId, q), countDnc(session.clientId)]);
  return Response.json({ numbers: rows, total });
}

/** POST { phones: string | string[], reason? } — paste one or many numbers. Sales reps can add; only managers can remove. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "agent"); if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const raw: string[] = Array.isArray(b.phones) ? b.phones : String(b.phones || "").split(/[\n,;]+/);
  const valid = new Set<string>(); const invalid: string[] = [];
  for (const r of raw) { const t = String(r).trim(); if (!t) continue; const p = normalisePhone(t); if (p) valid.add(p); else invalid.push(t); }
  if (!valid.size) return Response.json({ error: invalid.length ? "None of those look like phone numbers." : "Paste at least one number." }, { status: 400 });
  if (valid.size > 20000) return Response.json({ error: "Up to 20,000 numbers at a time." }, { status: 400 });
  const reason = String(b.reason || "").slice(0, 200) || null;
  await addDnc(session.clientId, Array.from(valid).map((phone) => ({ phone, reason, source: valid.size > 20 ? "import" : "manual", addedBy: session.email })));
  await audit(session, "dnc_added", { req, targetType: "dnc", detail: { count: valid.size, sample: Array.from(valid).slice(0, 3) } });
  return Response.json({ ok: true, added: valid.size, invalid, total: await countDnc(session.clientId) });
}

/** DELETE ?phone=+91… */
export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "manager"); if (denied) return denied;
  const phone = normalisePhone(new URL(req.url).searchParams.get("phone") || "");
  if (!phone) return Response.json({ error: "Which number?" }, { status: 400 });
  await removeDnc(session.clientId, phone);
  await audit(session, "dnc_removed", { req, targetType: "dnc", targetId: phone });
  return Response.json({ ok: true });
}
