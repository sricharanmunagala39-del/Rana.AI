export const runtime = "nodejs";
import { sb } from "@/lib/db";
import { importLeads } from "@/lib/crm";

/** For Zapier / Make / any form tool: POST one lead (or { leads: [...] }) to /api/webhooks/crm-inbox?key=… → it lands in New.
 *  Fields: business (or company), name, phone, email, city, industry, notes. */
export async function POST(req: Request) {
  const key = new URL(req.url).searchParams.get("key") || req.headers.get("x-rana-key") || "";
  const [s] = (await sb<any[]>(`/crm_settings?id=eq.1&select=inbox_key&limit=1`).catch(() => [])) || [];
  if (!s?.inbox_key || key.length < 16 || key !== s.inbox_key) return Response.json({ error: "Wrong key" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ error: "Send JSON" }, { status: 400 });
  const list = (Array.isArray(b) ? b : Array.isArray(b.leads) ? b.leads : [b]).slice(0, 500);
  const leads = list.map((x: any) => ({
    business: x.business || x.company || x.business_name || x.name, contactName: x.contactName || x.contact_name || x.name,
    phone: x.phone || x.mobile || x.phone_number, email: x.email, city: x.city, industry: x.industry, notes: x.notes || x.message,
  }));
  const r = await importLeads(leads, { source: "inbox", owner: null, by: "connected app", batch: `inbox:${new Date().toISOString().slice(0, 10)}` });
  return Response.json({ ok: true, added: r.added, duplicates: r.duplicates, skipped: r.skipped, problems: r.problems });
}
