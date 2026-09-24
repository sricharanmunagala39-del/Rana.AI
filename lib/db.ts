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

/** Quote a value for a PostgREST `in.(...)` filter. */
export function inList(values: string[]): string {
  return `(${values.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(",")})`;
}
