export const runtime = "nodejs";
import { getSession, forgetUser } from "@/lib/session";
import { unauthorized, verifyPassword, hashPassword } from "@/lib/auth";
import { getUser, updateUser, passwordProblem } from "@/lib/users";
import { audit } from "@/lib/audit";

/** POST { current, next } — change your own password. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  if (!session.userId) return Response.json({ error: "Sign out and sign back in once to switch to your personal login, then change your password." }, { status: 400 });
  const { current, next } = await req.json().catch(() => ({}));
  const user = await getUser(session.clientId, session.userId);
  if (!user) return unauthorized();
  if (!verifyPassword(String(current || ""), user.password_hash)) return Response.json({ error: "Your current password isn't right." }, { status: 400 });
  const problem = passwordProblem(String(next || ""));
  if (problem) return Response.json({ error: problem }, { status: 400 });
  if (current === next) return Response.json({ error: "Pick a password you haven't used here." }, { status: 400 });
  await updateUser(user.id, { password_hash: hashPassword(next), must_change_password: false } as any);
  forgetUser(user.id);
  await audit(session, "password_changed", { req, targetType: "user", targetId: user.id });
  return Response.json({ ok: true });
}
