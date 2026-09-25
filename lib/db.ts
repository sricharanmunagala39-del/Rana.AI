// Shared Supabase REST helper (service key — server only). New modules use this instead of copying sbFetch.
const URL_ = () => process.env.SUPABASE_URL!;
const KEY_ = () => process.env.SUPABASE_SERVICE_KEY!;

export async function sb<T = any>(path: string, opts: RequestInit & { prefer?: string } = {}): Promise<T> {
  const { prefer, ...rest } = opts;
  const res = await fetch(`${URL_()}/rest/v1${path}`, {
    ...rest,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      apikey: KEY_(),
      Authorization: `Bearer ${KEY_()}`,
      Prefer: prefer ?? "return=representation",
      ...(rest.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path.split("?")[0]}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * GET every row, 1,000 at a time. Supabase's API returns at most 1,000 rows per request (max-rows), so
 * billing and usage totals must page or they silently undercount busy clients. Pass a path with an `order=`.
 */
export async function sbAll<T = any>(path: string, max = 200_000): Promise<T[]> {
  const base = path.replace(/([?&])limit=\d+&?/, "$1").replace(/[?&]$/, "");
  const sep = base.includes("?") ? "&" : "?";
  const out: T[] = [];
  for (let offset = 0; offset < max; offset += 1000) {
    const page = (await sb<T[]>(`${base}${sep}limit=1000&offset=${offset}`)) || [];
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

/** Quote a value for a PostgREST `in.(...)` filter. */
export function inList(values: string[]): string {
  return `(${values.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(",")})`;
}
