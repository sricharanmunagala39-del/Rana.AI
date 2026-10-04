export const runtime = "nodejs";
import { siteProfile } from "@/lib/siteProfile";

/** Public: POST { url } → a short profile of that company's website, used to personalise an industry live demo. */
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 600e3);
  if (list.length >= 6) return Response.json({ error: "Please wait a few minutes before reading another website." }, { status: 429 });
  list.push(now); hits.set(ip, list);
  const b = await req.json().catch(() => ({} as any));
  try {
    const profile = await siteProfile(String(b.url || "").slice(0, 300));
    return Response.json({ profile });
  } catch (e: any) {
    const msg = String(e?.message || "");
    return Response.json({ error: /timeout|aborted/i.test(msg) ? "That website took too long to respond. Try again, or continue with the sample business." : msg || "We couldn't read that website. Continue with the sample business instead." }, { status: 400 });
  }
}
