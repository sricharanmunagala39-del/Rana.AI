export const runtime = "nodejs";
import { isHqClient } from "@/lib/session";
import { getSession } from "@/lib/session";
import { unauthorized, forbidUnless, roleOf, outranks, ROLES, ROLE_INFO, type Role } from "@/lib/auth";
import { listUsers, createUser, getUserByEmail, normaliseEmail, validEmail, tempPassword } from "@/lib/users";
import { audit } from "@/lib/audit";

/** GET — everyone on this client's team. Any signed-in person can see who's on the team. */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const users = await listUsers(session.clientId);
  return Response.json({
    users, me: { id: session.userId ?? null, role: roleOf(session), personal: !!session.userId },
    roles: ROLES.map((r) => ({ key: r, ...ROLE_INFO[r] })),
  });
}

/** POST { email, name, role } — invite a teammate. Returns a one-time password to hand over. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  if (!session.hqFrom && (await isHqClient(session.clientId))) return Response.json({ error: "Manage RANA HQ staff on HQ → Team & security." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const email = normaliseEmail(body.email);
  const role = (ROLES.includes(body.role) ? body.role : "viewer") as Role;
  if (!validEmail(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!outranks(roleOf(session), role)) return Response.json({ error: `You can't give someone a higher role than your own.` }, { status: 403 });
  if (await getUserByEmail(email)) return Response.json({ error: "That email already has a RANA login." }, { status: 409 });
  const password = tempPassword();
  const user = await createUser({ clientId: session.clientId, email, name: String(body.name || "").slice(0, 80), password, role, invitedBy: session.userId ?? null, mustChange: true });
  await audit(session, "user_invited", { req, targetType: "user", targetId: user.id, detail: { email, role } });
  return Response.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role }, tempPassword: password }, { status: 201 });
}
