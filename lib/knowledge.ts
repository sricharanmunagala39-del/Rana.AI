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

export async function deleteKnowledge(scriptId: string, id: string) {
  await sb(`/agent_knowledge?id=eq.${id}&script_id=eq.${scriptId}`, { method: "DELETE", prefer: "return=minimal" });
}

/** Fetches a public web page and returns its readable text. */
export async function fetchPageText(url: string): Promise<{ title: string; text: string }> {
  const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) throw new Error("That address can't be read.");
  const res = await fetch(u.toString(), { headers: { "User-Agent": "RANA-AI-KnowledgeBot/1.0", Accept: "text/html,text/plain" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`The site answered ${res.status}.`);
  const html = (await res.text()).slice(0, 2_000_000);
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || u.hostname).replace(/\s+/g, " ").trim().slice(0, 120);
  const text = html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  if (text.length < 80) throw new Error("Couldn't find readable text on that page.");
  return { title, text };
}
