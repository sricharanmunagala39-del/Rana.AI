export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { sb } from "@/lib/db";

/** GET → the new-client setup checklist (what's done, what's next). */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const id = session.clientId;
  const [c] = (await sb<any[]>(`/clients?id=eq.${id}&select=plan,billing_name,is_hq&limit=1`)) || [];
  if (!c || c.is_hq) return Response.json({ items: [], done: true });
  const [scripts, tests, users, campaigns] = await Promise.all([
    sb<any[]>(`/scripts?client_id=eq.${id}&select=id,published_at`).catch(() => []),
    sb<any[]>(`/calls?client_id=eq.${id}&source=eq.manual&duration_seconds=gt.0&select=id&limit=1`).catch(() => []),
    sb<any[]>(`/users?client_id=eq.${id}&is_active=eq.true&select=id`).catch(() => []),
    sb<any[]>(`/campaigns?client_id=eq.${id}&select=id&limit=1`).catch(() => []),
  ]);
  const items = [
    { key: "employee", label: "Create your first AI employee", href: "/agents/new", done: (scripts || []).length > 0 },
    { key: "publish", label: "Publish the employee so it can take calls", href: "/employees", done: (scripts || []).some((x) => x.published_at) },
    { key: "test", label: "Talk to your employee (test call)", href: "/talk", done: (tests || []).length > 0 },
    { key: "billing", label: "Add billing details", href: "/billing", done: !!c.billing_name },
    { key: "plan", label: "Choose a plan", href: "/billing", done: c.plan !== "trial" },
    { key: "campaign", label: "Launch your first campaign", href: "/outbound", done: (campaigns || []).length > 0 },
    { key: "team", label: "Invite your team", href: "/settings", done: (users || []).length > 1 },
  ];
  return Response.json({ items, done: items.every((i) => i.done), completed: items.filter((i) => i.done).length });
}
