// Public SEO articles for ranaai.in/blog, stored in Supabase table `site_posts`.
// Read-only and cached (ISR): a new row shows up on the site within the revalidate window, no redeploy needed.
export type Post = {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  category: string;
  body_html: string;
  faq: { q: string; a: string }[];
  published_at: string;
  updated_at: string;
};

const REVALIDATE = 900; // seconds

async function query(path: string): Promise<Post[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/rest/v1/site_posts${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: REVALIDATE, tags: ["site_posts"] },
    });
    if (!res.ok) return [];
    return (await res.json()) ?? [];
  } catch {
    return [];
  }
}

const COLS = "slug,title,description,keywords,category,body_html,faq,published_at,updated_at";

export async function listPosts(): Promise<Post[]> {
  return query(`?select=${COLS}&status=eq.published&published_at=lte.${encodeURIComponent(new Date().toISOString())}&order=published_at.desc&limit=500`);
}

export async function getPost(slug: string): Promise<Post | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const rows = await query(`?select=${COLS}&status=eq.published&slug=eq.${slug}&limit=1`);
  return rows[0] ?? null;
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}
