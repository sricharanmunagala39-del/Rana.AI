// Documents and web pages an employee should know about. Text is extracted in the browser (PDF,
// Word, TXT) or fetched here (website URL), then summarised into caller-relevant facts.
import { sb } from "./db";
import { chat, llmProvider } from "./llm";
import { summarizeMessages } from "./playbook";

export const MAX_KNOWLEDGE_CHARS = 200_000;

export async function listKnowledge(scriptId: string) {
  return sb<any[]>(`/agent_knowledge?script_id=eq.${scriptId}&order=created_at.asc&select=id,kind,title,source,content,summary,chars,created_at`);
}

export async function addKnowledge(row: { client_id: string; script_id: string; kind: string; title: string; source?: string | null; content: string; created_by?: string | null }) {
  const content = row.content.slice(0, MAX_KNOWLEDGE_CHARS);
  let summary: string | null = null;
  if (llmProvider() && content.length > 1200) {
    try { summary = (await chat(summarizeMessages(row.title, content), { maxTokens: 900, temperature: 0.1 })).slice(0, 5000); } catch { summary = null; }
  }
  const r = await sb<any[]>(`/agent_knowledge`, { method: "POST", body: JSON.stringify({ ...row, content, summary, chars: content.length }) });
  return r[0];
}

export async function getKnowledge(scriptId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await sb<any[]>(`/agent_knowledge?id=eq.${id}&script_id=eq.${scriptId}&limit=1`);
  return r?.[0] ?? null;
}

/** Few characters from a website usually means prices/plans are loaded by JavaScript or behind a login. */
export function thinHint(k: { kind: string; chars: number }): string | null {
  if ((k.chars || 0) >= 1500) return null;
  return k.kind === "url"
    ? "Only a little text could be read from this page — plan details and prices are often loaded after the page opens or shown only after login. Better sources: the brochure or fee-sheet PDF (Upload document), or open the page, select the plan details, copy and paste them under \"Type or paste\"."
    : "This document has very little text. If it is a scanned PDF or an image, paste the important parts as text instead.";
}

export async function deleteKnowledge(scriptId: string, id: string) {
  await sb(`/agent_knowledge?id=eq.${id}&script_id=eq.${scriptId}`, { method: "DELETE", prefer: "return=minimal" });
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8,te;q=0.7",
};

export const BLOCKED_MESSAGE = "This website blocks automatic reading. Open the page in your browser, press Ctrl+A then Ctrl+C, and paste it under \"Type or paste\".";

function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

/** Reader fallback for sites that block bots or build the page with JavaScript: returns the rendered page as text. */
async function readerFetch(url: string): Promise<{ title: string; text: string } | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: "text/plain", "X-Return-Format": "text" }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const raw = (await res.text()).slice(0, 2_000_000);
    const title = raw.match(/^Title:\s*(.+)$/m)?.[1]?.trim().slice(0, 120) || new URL(url).hostname;
    const body = (raw.split(/^Markdown Content:\s*$/m)[1] ?? raw).replace(/\n{3,}/g, "\n\n").trim();
    return body.length >= 80 ? { title, text: body } : null;
  } catch { return null; }
}

/** Fetches a public web page and returns its readable text. */
export async function fetchPageText(url: string): Promise<{ title: string; text: string }> {
  const u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
  if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) throw new Error("That address can't be read.");
  // Tracking parameters (utm_*, gclid…) don't change the page; drop them.
  for (const k of Array.from(u.searchParams.keys())) if (/^(utm_|gclid|fbclid|gad_|gbraid|wbraid)/i.test(k)) u.searchParams.delete(k);
  const clean = u.toString();

  let direct: { title: string; text: string } | null = null;
  let short: { title: string; text: string } | null = null;
  let status = 0;
  try {
    const res = await fetch(clean, { headers: BROWSER_HEADERS, redirect: "follow", signal: AbortSignal.timeout(15000) });
    status = res.status;
    if (res.ok) {
      const html = (await res.text()).slice(0, 2_000_000);
      const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || u.hostname).replace(/\s+/g, " ").trim().slice(0, 120);
      const text = htmlToText(html);
      // Pages built with JavaScript come back almost empty — treat as not readable and try the reader.
      if (text.length >= 400) direct = { title, text };
      else if (text.length >= 80) short = { title, text };
    }
  } catch { /* try the reader */ }
  if (direct) return direct;
  // A page that doesn't exist shouldn't become "knowledge" via the reader.
  if (status === 404 || status === 410) throw new Error("That page doesn't exist (the site answered 404). Check the address and try again.");

  const viaReader = await readerFetch(clean);
  if (viaReader) return viaReader;
  if (short) return short;
  if (status === 401 || status === 403 || status === 429 || status === 503) throw new Error(BLOCKED_MESSAGE);
  if (status && status >= 400) throw new Error(`The site answered ${status}. Check the address, or copy the page text and paste it under "Type or paste".`);
  throw new Error("Couldn't find readable text on that page. Copy the page text and paste it under \"Type or paste\".");
}
