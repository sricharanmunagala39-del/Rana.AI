// @ts-nocheck
"use client";
// What the employee knows beyond the script: brochures, fee sheets, FAQs, the website. Files are
// read in the browser (only text is uploaded); long documents are summarised to the facts a caller
// might ask about, and those notes go into the agent's instructions when it is published.

import { useEffect, useRef, useState } from "react";
import { extractText, ACCEPT } from "@/lib/docExtract";
import { Spinner } from "./Editors";

const KIND_ICON: Record<string, string> = { file: "📄", url: "🌐", text: "📝" };

export default function KnowledgePanel({ scriptId, ensureSaved, onCount }: any) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState("");
  const [url, setUrl] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"file" | "url" | "text">("file");
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => { onCount?.(items.length); }, [items.length]);

  useEffect(() => {
    if (!scriptId) return;
    setLoading(true);
    fetch(`/api/studio/knowledge?scriptId=${scriptId}`).then((r) => r.json()).then((d) => setItems(d.items || [])).catch(() => {}).finally(() => setLoading(false));
  }, [scriptId]);

  async function add(body: any): Promise<boolean> {
    const id = scriptId || (await ensureSaved());
    if (!id) { setErr("Give the employee a name first so we can save it."); return false; }
    const res = await fetch("/api/studio/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scriptId: id, ...body }) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Couldn't add that.");
    setItems((l) => [...l, d.item]);
    return true;
  }

  async function onFiles(files: FileList | File[]) {
    setErr("");
    for (const f of Array.from(files)) {
      setBusy(`Reading ${f.name}…`);
      try {
        const content = await extractText(f);
        setBusy(content.length > 1200 ? `Summarising ${f.name}…` : `Saving ${f.name}…`);
        await add({ kind: "file", title: f.name, content });
      } catch (e: any) { setErr(e.message); }
    }
    setBusy("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function addUrl() {
    setErr(""); setBusy("Reading the page…");
    try { if (await add({ kind: "url", url: url.trim() })) setUrl(""); } catch (e: any) { setErr(e.message); }
    setBusy("");
  }

  async function addNote() {
    setErr(""); setBusy("Saving…");
    try { if (await add({ kind: "text", title: noteTitle.trim() || "Notes", content: note })) { setNote(""); setNoteTitle(""); } } catch (e: any) { setErr(e.message); }
    setBusy("");
  }

  async function remove(id: string) {
    const prev = items;
    setItems((l) => l.filter((x) => x.id !== id));
    const res = await fetch(`/api/studio/knowledge?scriptId=${scriptId}&id=${id}`, { method: "DELETE" });
    if (!res.ok) { setItems(prev); setErr("Couldn't remove that."); }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="knowledge">
      <div className="text-[12.5px] text-ink-soft">
        Add brochures, fee sheets, FAQs or your website. The employee uses them to answer questions the script doesn't cover — and says it will check with the team when the answer isn't there.
      </div>

      <div className="flex gap-1.5">
        {[["file", "Upload document"], ["url", "Website page"], ["text", "Type or paste"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k as any)}
            className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-full border ${mode === k ? "bg-ink text-white border-ink" : "bg-white text-ink-soft border-line"}`}>{l}</button>
        ))}
      </div>

      {mode === "file" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files); }}
          onClick={() => !busy && fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl px-4 py-7 text-center cursor-pointer ${drag ? "border-signal bg-signal-tint" : "border-line bg-white hover:border-signal/60"}`}>
          <div className="text-[13.5px] font-semibold">Drop files here or click to choose</div>
          <div className="text-[11.5px] text-ink-soft mt-1">PDF, Word (.docx) or text · up to 25 MB each · read on your computer, only the text is saved</div>
          <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" data-testid="knowledge-file" onChange={(e) => e.target.files && onFiles(e.target.files)} />
        </div>
      )}
      {mode === "url" && (
        <div className="flex gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourinstitute.com/courses/neet-pg"
            className="flex-1 border border-line rounded-lg px-3 py-2 text-[13.5px] bg-white outline-none focus:border-signal" />
          <button type="button" onClick={addUrl} disabled={!!busy || !/^https?:\/\/\S+\.\S+/.test(url.trim())}
            className="bg-ink text-white rounded-lg px-4 text-[13px] font-semibold disabled:opacity-40">Add page</button>
        </div>
      )}
      {mode === "text" && (
        <div className="flex flex-col gap-2 border border-line rounded-xl bg-white p-3">
          <input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Title, e.g. Fee structure 2026"
            className="text-[13.5px] font-semibold outline-none bg-transparent" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder="Paste anything the employee should know…"
            className="text-[13.5px] outline-none bg-transparent resize-y" />
          <div className="flex justify-end">
            <button type="button" onClick={addNote} disabled={!!busy || note.trim().length < 20}
              className="bg-ink text-white rounded-lg px-4 py-1.5 text-[13px] font-semibold disabled:opacity-40">Add notes</button>
          </div>
        </div>
      )}

      {busy && <div className="text-[12.5px] text-signal flex items-center gap-2"><Spinner /> {busy}</div>}
      {err && (
        <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2 flex items-center justify-between gap-3" data-testid="knowledge-error">
          <span>{err}</span>
          {/Type or paste/.test(err) && mode !== "text" && (
            <button type="button" onClick={() => { setMode("text"); setNoteTitle(noteTitle || (url ? (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })() : "")); setErr(""); }}
              className="shrink-0 bg-white border border-line rounded-md px-2.5 py-1 font-semibold text-ink">Paste it instead</button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {loading && <div className="text-[12.5px] text-ink-soft">Loading…</div>}
        {!loading && items.length === 0 && <div className="text-[12.5px] text-ink-soft">Nothing added yet.</div>}
        {items.map((k) => (
          <div key={k.id} className="border border-line rounded-xl bg-white" data-testid="knowledge-item">
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <span aria-hidden>{KIND_ICON[k.kind] || "📄"}</span>
              <button type="button" onClick={() => setOpen(open === k.id ? null : k.id)} className="flex-1 min-w-0 text-left">
                <div className="text-[13.5px] font-semibold truncate">{k.title}</div>
                <div className="text-[11.5px] text-ink-soft">{Math.round((k.chars || 0) / 1000) || "<1"}k characters{k.summary ? " · summarised for calls" : ""}{k.source ? ` · ${k.source}` : ""}</div>
              </button>
              <button type="button" onClick={() => setOpen(open === k.id ? null : k.id)} className="text-[12px] font-semibold text-signal">{open === k.id ? "Hide" : "What it learned"}</button>
              <button type="button" onClick={() => remove(k.id)} className="text-miss text-[12px] font-semibold" aria-label={`Remove ${k.title}`}>✕</button>
            </div>
            {open === k.id && (
              <div className="border-t border-line px-3.5 py-2.5 text-[12.5px] whitespace-pre-wrap leading-relaxed text-ink-soft max-h-72 overflow-y-auto">{k.summary || k.preview}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
