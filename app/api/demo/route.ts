export const runtime = "nodejs";
import { sb } from "@/lib/db";
import { sendEmail, emailHtml, APP_URL } from "@/lib/notify";
import { hqEmails } from "@/lib/hq";

// Public "Book a demo" form on ranaai.in. Saves the request, emails RANA HQ straight away (with the visitor's
// phone and email), and confirms to the visitor. Honeypot + per-IP limit keep bots out.
const hits = new Map<string, number[]>();
const clip = (v: any, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const INDUSTRIES = ["Clinic / hospital / diagnostics", "Real estate", "Education / coaching / college", "E-commerce / D2C", "Insurance / loans / finance", "Hotel / restaurant / travel", "Automobile dealer / service", "Home & local services", "Other"];
const WANTS: Record<string, string> = { answer: "Answer incoming calls", call: "Call our leads / customers", both: "Both" };

/** Indian mobile → +91XXXXXXXXXX. Other international numbers are kept as typed (with +). */
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
  if (list.length > 8) return Response.json({ error: "Too many requests from this network. Email hello@ranaai.in instead." }, { status: 429 });

  const b = await req.json().catch(() => ({} as any));
  if (b.website) return Response.json({ ok: true }); // honeypot: bots fill every field
  const name = clip(b.name, 80), company = clip(b.company, 120), email = clip(b.email, 120).toLowerCase();
  const phone = phoneOf(b.phone);
  if (name.length < 2) return Response.json({ error: "Please tell us your name." }, { status: 400 });
  if (!phone) return Response.json({ error: "Please enter a valid mobile number (10 digits)." }, { status: 400 });
  if (company.length < 2) return Response.json({ error: "Please tell us your company name." }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return Response.json({ error: "That email doesn't look right." }, { status: 400 });
  if (!b.consent) return Response.json({ error: "Please tick the box so we're allowed to call you back." }, { status: 400 });

  const row = {
    name, phone, email: email || null, company,
    industry: INDUSTRIES.includes(b.industry) ? b.industry : clip(b.industry, 60) || null,
    wants: WANTS[b.wants] ? b.wants : null,
    languages: (Array.isArray(b.languages) ? b.languages : []).map((l: any) => clip(l, 20)).filter(Boolean).slice(0, 11),
    volume: clip(b.volume, 40) || null, best_time: clip(b.bestTime, 40) || null,
    message: clip(b.message, 1000) || null, source: clip(b.source, 40) || null, ip,
  };
  const saved = await sb<any[]>(`/demo_requests`, { method: "POST", body: JSON.stringify(row) }).catch((e) => { console.error("[demo]", e?.message); return null; });
  if (!saved?.[0]) return Response.json({ error: "Couldn't save your request just now. Please email hello@ranaai.in." }, { status: 500 });

  const lines = [
    `<b>${esc(name)}</b> from <b>${esc(company)}</b> wants a demo.`,
    `📞 <b>${esc(phone)}</b>${email ? ` · ✉️ ${esc(email)}` : ""}${row.best_time ? ` · best time: ${esc(row.best_time)}` : ""}`,
    `Industry: ${esc(row.industry || "—")} · Wants: ${esc(row.wants ? WANTS[row.wants] : "—")}${row.languages.length ? ` · Languages: ${esc(row.languages.join(", "))}` : ""}${row.volume ? ` · Volume: ${esc(row.volume)}` : ""}`,
    ...(row.message ? [`“${esc(row.message)}”`] : []),
    "Call them within the hour — fast replies win demos.",
  ];
  const hq = Array.from(new Set([...hqEmails(), "hello@ranaai.in"]));
  await sendEmail({ to: hq, kind: "demo_request", subject: `New demo request: ${company} (${name})`, html: emailHtml({ title: "New demo request", lines, button: { label: "Open demo requests", url: `${APP_URL()}/hq/demos` } }) }).catch(() => {});
  if (email) {
    await sendEmail({
      to: email, kind: "demo_confirm", subject: "We got your RANA AI demo request",
      html: emailHtml({
        title: `Thanks, ${esc(name.split(" ")[0])} — we'll call you soon`,
        lines: [
          `Someone from RANA AI will call you on <b>${esc(phone)}</b> within one working day${row.best_time ? ` (you said ${esc(row.best_time.toLowerCase())} works best)` : ""}.`,
          "On the call we'll listen to how your calls work today, then show you an AI employee answering and calling in your language.",
          "Can't wait? Start the free 14-day trial and build your first AI employee yourself — no card needed.",
        ],
        button: { label: "Start free trial", url: `${APP_URL()}/signup` },
      }),
    }).catch(() => {});
  }
  return Response.json({ ok: true });
}
