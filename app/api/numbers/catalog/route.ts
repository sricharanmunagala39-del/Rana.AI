export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { unauthorized } from "@/lib/auth";
import { catalog } from "@/lib/numbers";

/** GET ?city=hyderabad&fancy=1 — numbers available to buy right now (when the telephony partner is connected). */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const sp = new URL(req.url).searchParams;
  try {
    const cat = await catalog({ city: sp.get("city") || undefined, fancyOnly: sp.get("fancy") === "1" });
    // RANA's own cost price stays on the server.
    return Response.json({ ...cat, numbers: cat.numbers.map(({ vendorMonthly, vendorSetup, ...n }: any) => n) });
  } catch (e: any) {
    console.error("[numbers catalog]", e?.message || e);
    return Response.json({ live: true, numbers: [], error: "Couldn't load numbers right now. Please try again in a minute." }, { status: 502 });
  }
}
