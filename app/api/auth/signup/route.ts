export const runtime = "nodejs";
import { sb } from "@/lib/db";
import { isZone } from "@/lib/tz";
import { countryOf } from "@/lib/countries";
import { hashPassword } from "@/lib/auth";
import { createUser, getUserByEmail, normaliseEmail, validEmail, tempPassword } from "@/lib/users";
import { audit } from "@/lib/audit";
import { sendEmail, emailHtml, hqInbox, APP_URL, esc } from "@/lib/notify";

const recent = new Map<string, number[]>();
const INDUSTRIES = ["edtech", "realestate", "hospitality", "saas", "other"];

/**
 * POST { company, name, email, phone, password, industry } → public "Start a free trial".
 * Creates the workspace as PENDING (no calling, no free minutes) until RANA HQ approves it, so nobody can farm trials.
 */
export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  const hits = (recent.get(ip) || []).filter((t) => Date.now() - t < 3600e3);
  if (hits.length >= 3) return Response.json({ error: "Too many sign-ups from this network. Write to support@ranaai.in." }, { status: 429 });
  const b = await req.json().catch(() => ({} as any));
  const company = String(b.company || "").trim().slice(0, 80);
  const name = String(b.name || "").trim().slice(0, 80);
  const email = normaliseEmail(b.email);
  const country = countryOf(b.country);
  const phone = String(b.phone || "").replace(/[^\d+]/g, "").slice(0, 16);
  const password = String(b.password || "");
  const sourceTag = String(b.source || "").replace(/[^\w.=&-]/g, "").slice(0, 250);
  const market = ["in", "global", "us", "ae", "eu", "jp"].includes(b.market) ? b.market : "in";
  if (company.length < 2) return Response.json({ error: "Enter your company name." }, { status: 400 });
  if (!validEmail(email)) return Response.json({ error: "Enter a valid work email." }, { status: 400 });
  // The form sends +<country code><number>; older clients may still send 10–13 digits without "+".
  const okPhone = phone.startsWith("+") ? /^\+\d{8,15}$/.test(phone) && (!country || (phone.startsWith("+" + country.dial) && phone.length - 1 - country.dial.length >= 6)) : /^\d{10,13}$/.test(phone);
  if (!okPhone) return Response.json({ error: "Enter your mobile number — pick your country, then type the number without the country code." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "Use a password of at least 8 characters." }, { status: 400 });
  if (await getUserByEmail(email)) return Response.json({ error: "That email already has a RANA login. Sign in instead." }, { status: 409 });
  const owned = await sb<any[]>(`/clients?login_email=eq.${encodeURIComponent(email)}&select=id&limit=1`).catch(() => []);
  if (owned?.length) return Response.json({ error: "That email already has a RANA workspace. Sign in instead." }, { status: 409 });
  const lastHour = (await sb<any[]>(`/clients?signup_source=like.web*&created_at=gte.${encodeURIComponent(new Date(Date.now() - 3600e3).toISOString())}&select=id`).catch(() => [])) || [];
  if (lastHour.length >= 20) return Response.json({ error: "Sign-ups are busy right now. Please try again in an hour." }, { status: 429 });
  hits.push(Date.now()); recent.set(ip, hits);

  const [client] = await sb<any[]>(`/clients`, {
    method: "POST",
    body: JSON.stringify({
      name: company, company_name: company, login_email: email, industry: INDUSTRIES.includes(b.industry) ? b.industry : "other",
      login_password: hashPassword(tempPassword() + tempPassword()), plan: "trial", status: "pending", signup_source: sourceTag ? `web|${sourceTag}` : "web",
      contact_phone: phone, market, ...(market !== "in" && isZone(b.timezone) ? { timezone: String(b.timezone) } : {}), hq_notes: `Signed up on the website by ${name || email} (${phone}${country ? ", " + country.name : ""}).`,
    }),
  });
  const user = await createUser({ clientId: client.id, email, name: name || company, password, role: "owner", mustChange: false });
  await audit({ clientId: client.id, email, userId: user.id }, "user_invited", { req, detail: { signup: true } });
  await sendEmail({ to: hqInbox(), kind: "signup", clientId: client.id, subject: `New sign-up waiting: ${company}`, html: emailHtml({ title: `${company} wants a free trial`, lines: [`${esc(name || "—")} · ${esc(email)} · ${esc(phone)}${country ? " · " + esc(country.name) : ""}`, "Approve it in RANA HQ to start their 14-day trial."], button: { label: "Open RANA HQ", url: `${APP_URL()}/hq` } }) });
  await sendEmail({ to: email, kind: "signup_received", clientId: client.id, subject: "We've got your RANA AI sign-up", html: emailHtml({ title: "Thanks for signing up", lines: ["A RANA specialist will switch on your 14-day free trial shortly — usually within a working day. You can already sign in and start building your first AI employee."], button: { label: "Sign in", url: `${APP_URL()}/login` } }) });
  return Response.json({ ok: true }, { status: 201 });
}
