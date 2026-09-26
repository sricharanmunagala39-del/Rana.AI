export const runtime = "nodejs";
import { requestReset, RESET_TTL_MIN } from "@/lib/passwordReset";

// Per-IP brake on top of the per-account limit (3 links an hour), so nobody can use this to spam inboxes.
const hits = new Map<string, number[]>();
const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

/** POST { email } — send a reset link if the account exists. Always the same answer, so it never reveals who has an account. */
export async function POST(req: Request) {
  const ip = ipOf(req);
  const now = Date.now();
  const list = (hits.get(ip || "?") || []).filter((t) => now - t < 15 * 60e3);
  list.push(now); hits.set(ip || "?", list);
  const { email } = await req.json().catch(() => ({}));
  if (!email || typeof email !== "string") return Response.json({ error: "Enter the email you sign in with." }, { status: 400 });
  if (list.length <= 10) {
    try { await requestReset(email, ip); } catch (e: any) { console.error("[forgot]", e?.message); }
  }
  return Response.json({ ok: true, message: `If ${email.trim().toLowerCase()} has a RANA account, a reset link is on its way. It works for ${RESET_TTL_MIN} minutes — check spam too.` });
}
