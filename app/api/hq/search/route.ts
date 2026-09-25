export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";

/** GET ?q= → search every client: companies, people, phone numbers (calls + campaign lists), invoices. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const q = String(new URL(req.url).searchParams.get("q") || "").trim().slice(0, 60);
  if (q.length < 2) return Response.json({ results: [] });
  const like = encodeURIComponent(`*${q.replace(/[*,()]/g, "")}*`);
  const digits = q.replace(/\D/g, "");
  const phone = digits.length >= 4 ? encodeURIComponent(`*${digits.slice(-10)}*`) : null;
  const clients = (await sb<any[]>(`/clients?is_hq=eq.false&select=id,name`).catch(() => [])) || [];
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name || "—";
  const [cl, us, calls, contacts, inv] = await Promise.all([
    sb<any[]>(`/clients?is_hq=eq.false&or=(name.ilike.${like},login_email.ilike.${like},billing_name.ilike.${like},billing_gstin.ilike.${like})&select=id,name,plan,status&limit=10`).catch(() => []),
    sb<any[]>(`/users?or=(email.ilike.${like},name.ilike.${like})&select=id,client_id,email,name,role&limit=10`).catch(() => []),
    phone ? sb<any[]>(`/calls?or=(caller_phone.ilike.${phone},agent_phone.ilike.${phone})&select=id,client_id,caller_phone,caller_name,created_at,duration_seconds,lead_status&order=created_at.desc&limit=10`).catch(() => []) : sb<any[]>(`/calls?caller_name=ilike.${like}&select=id,client_id,caller_phone,caller_name,created_at,duration_seconds,lead_status&order=created_at.desc&limit=10`).catch(() => []),
    phone ? sb<any[]>(`/campaign_contacts?phone=ilike.${phone}&select=id,client_id,campaign_id,name,phone,status&limit=10`).catch(() => []) : sb<any[]>(`/campaign_contacts?name=ilike.${like}&select=id,client_id,campaign_id,name,phone,status&limit=10`).catch(() => []),
    sb<any[]>(`/invoices?number=ilike.${like}&select=id,client_id,number,total,status&limit=10`).catch(() => []),
  ]);
  const results = [
    ...(cl || []).map((c) => ({ type: "Client", title: c.name, sub: `${c.plan} · ${c.status}`, clientId: c.id })),
    ...(us || []).filter((u) => clients.some((c) => c.id === u.client_id)).map((u) => ({ type: "Person", title: u.name || u.email, sub: `${u.email} · ${u.role} at ${nameOf(u.client_id)}`, clientId: u.client_id })),
    ...(calls || []).map((c) => ({ type: "Call", title: `${c.caller_name || c.caller_phone || "Unknown"}`, sub: `${nameOf(c.client_id)} · ${new Date(c.created_at).toLocaleString("en-IN")} · ${Math.round(Number(c.duration_seconds) || 0)}s${c.lead_status ? ` · ${c.lead_status}` : ""}`, clientId: c.client_id })),
    ...(contacts || []).map((c) => ({ type: "Lead", title: c.name || c.phone, sub: `${c.phone} · ${nameOf(c.client_id)} · ${c.status}`, clientId: c.client_id })),
    ...(inv || []).map((i) => ({ type: "Invoice", title: i.number, sub: `${nameOf(i.client_id)} · ₹${Number(i.total).toLocaleString("en-IN")} · ${i.status}`, clientId: i.client_id, href: `/billing/invoices/${i.id}` })),
  ];
  return Response.json({ results });
}
