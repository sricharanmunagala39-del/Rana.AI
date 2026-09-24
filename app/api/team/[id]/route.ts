export const runtime = "nodejs";
import { getSession, forgetUser } from "@/lib/session";
import { unauthorized, forbidUnless, roleOf, outranks, ROLES, type Role } from "@/lib/auth";
import { getUser, updateUser, countActiveOwners, tempPassword, publicUser } from "@/lib/users";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

/** PATCH { role?, active?, resetPassword? } — admins manage teammates; nobody can outrank themselves or lock the team out. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  const target = await getUser(session.clientId, params.id);
  if (!target) return Response.json({ error: "Teammate not found" }, { status: 404 });
  const myRole = roleOf(session);
  if (!outranks(myRole, target.role)) return Response.json({ error: "You can't change someone with a higher role than yours." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const patch: any = {};
  const isSelf = target.id === session.userId;

  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) return Response.json({ error: "Unknown role" }, { status: 400 });
    if (!outranks(myRole, body.role as Role)) return Response.json({ error: "You can't give someone a higher role than your own." }, { status: 403 });
    if (isSelf) return Response.json({ error: "Ask another admin or owner to change your own role." }, { status: 400 });
    if (target.role === "owner" && body.role !== "owner" && (await countActiveOwners(session.clientId)) <= 1) return Response.json({ error: "Every team needs at least one owner. Make someone else an owner first." }, { status: 400 });
    patch.role = body.role;
  }
  if (typeof body.active === "boolean") {
    if (isSelf) return Response.json({ error: "You can't remove your own access." }, { status: 400 });
    if (!body.active && target.role === "owner" && (await countActiveOwners(session.clientId)) <= 1) return Response.json({ error: "You can't remove the last owner." }, { status: 400 });
    patch.is_active = body.active;
  }
  let temp: string | null = null;
  if (body.resetPassword) {
    if (isSelf) return Response.json({ error: "Change your own password under My account." }, { status: 400 });
    temp = tempPassword();
    patch.password_hash = hashPassword(temp);
    patch.must_change_password = true;
  }
  if (!Object.keys(patch).length) return Response.json({ error: "Nothing to change" }, { status: 400 });

  const updated = await updateUser(target.id, patch);
  forgetUser(target.id);
  if (patch.role) await audit(session, "user_role_changed", { req, targetType: "user", targetId: target.id, detail: { email: target.email, from: target.role, to: patch.role } });
  if (patch.is_active === false) await audit(session, "user_deactivated", { req, targetType: "user", targetId: target.id, detail: { email: target.email } });
  if (patch.is_active === true) await audit(session, "user_reactivated", { req, targetType: "user", targetId: target.id, detail: { email: target.email } });
  if (temp) await audit(session, "user_password_reset", { req, targetType: "user", targetId: target.id, detail: { email: target.email } });
  return Response.json({ ok: true, user: updated ? publicUser(updated) : null, tempPassword: temp });
}
