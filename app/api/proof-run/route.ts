export const runtime = "nodejs";
import { sb } from "@/lib/db";
import { sendEmail, emailHtml, APP_URL } from "@/lib/notify";
import { hqEmails } from "@/lib/hq";

// Public "Free proof run" form on the industry pages: a business sends up to 200 old enquiries, RANA HQ calls them
// as a campaign and sends a report. Saved as a demo request (kind = proof_run) so it shows in HQ → Demo requests.
const MAX = 200;
const hits = new Map<string, number[]>();
const clip = (v: any, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function phoneOf(raw: string): string | null {
  const s = String(raw || "").trim();
  const d = s.replace(/\D/g, "");
  const local = d.length === 12 && d.startsWith("91") ? d.slice(2) : d.length === 11 && d.startsWith("0") ? d.slice(1) : d;
  if (/^[6-9]\d{9}$/.test(local)) return `+91${local}`;
  if (s.startsWith("+") && d.length >= 8 && d.length <= 15) return `+${d}`;
  return null;
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  list.push(now); hits.set(ip, list);
  if (list.length > 5) return Response.json({ error: "Too many requests from this network. Email hello@ranaai.in instead." }, { status: 429 });

  const b = await req.json().catch(() => ({} as any));
  if (b.website) return Response.json({ ok: true }); // honeypot
  const name = clip(b.name, 80), company = clip(b.company, 120), email = clip(b.email, 120).toLowerCase(), city = clip(b.city, 60);
  const phone = phoneOf(b.phone);
  if (name.length < 2) return Response.json({ error: "Please tell us your name." }, { status: 400 });
  if (company.length < 2) return Response.json({ error: "Please tell us your business name." }, { status: 400 });
  if (!phone) return Response.json({ error: "Please enter a valid mobile number." }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return Response.json({ error: "That email doesn't look right." }, { status: 400 });
  if (!b.consent) return Response.json({ error: "Please tick the box to confirm these people enquired with you or agreed to be contacted." }, { status: 400 });

  const seen = new Set<string>();
  const leads = (Array.isArray(b.leads) ? b.leads : []).map((l: any) => ({ phone: phoneOf(l?.phone), name: clip(l?.name, 60), note: clip(l?.note, 120) }))
    .filter((l: any) => l.phone && !seen.has(l.phone) && seen.add(l.phone)).slice(0, MAX);

  const row = {
    kind: "proof_run", name, phone, email: email || null, company, city: city || null,
    industry: clip(b.industry, 60) || null, wants: "call", message: clip(b.message, 1000) || null,
    source: clip(b.source, 300) || "proof-run", ip, leads: leads.length ? leads : null, lead_count: leads.length,
  };
  const saved = await sb<any[]>(`/demo_requests`, { method: "POST", body: JSON.stringify(row) }).catch((e) => { console.error("[proof-run]", e?.message); return null; });
  if (!saved?.[0]) return Response.json({ error: "Couldn't save your request just now. Please email hello@ranaai.in." }, { status: 500 });

  const lines = [
    `<b>${esc(name)}</b> from <b>${esc(company)}</b>${city ? ` (${esc(city)})` : ""} wants a <b>free proof run</b>.`,
    `📞 <b>${esc(phone)}</b>${email ? ` · ✉️ ${esc(email)}` : ""} · Industry: ${esc(row.industry || "—")}`,
    leads.length ? `List attached in HQ: <b>${leads.length} numbers</b>. Download it from Demo requests and launch it as a campaign.` : "No list uploaded yet — ask them to WhatsApp or email it.",
    ...(row.message ? [`“${esc(row.message)}”`] : []),
    "Call them today to confirm the script, then send the report within 5 working days.",
  ];
  const hq = Array.from(new Set([...hqEmails(), "hello@ranaai.in"]));
  await sendEmail({ to: hq, kind: "demo_request", subject: `Proof run request: ${company} (${leads.length} numbers)`, html: emailHtml({ title: "New free proof run", lines, button: { label: "Open demo requests", url: `${APP_URL()}/hq/demos` } }) }).catch(() => {});
  if (email) {
    await sendEmail({
      to: email, kind: "demo_confirm", subject: "Your free RANA AI proof run",
      html: emailHtml({
        title: `Thanks, ${esc(name.split(" ")[0])} — we're on it`,
        lines: [
          `We'll call you on <b>${esc(phone)}</b> within one working day to confirm the script.`,
          leads.length ? `Then RANA calls your ${leads.length} enquiries during permitted hours, and we send you a report of who is still interested.` : "Reply to this email with your enquiry list (Excel or CSV, up to 200 numbers) whenever you're ready.",
          "Only people who enquired with you or agreed to be contacted are called, and anyone who says no is never called again.",
        ],
      }),
    }).catch(() => {});
  }
  return Response.json({ ok: true, count: leads.length });
}
