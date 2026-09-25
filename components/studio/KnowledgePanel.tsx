// @ts-nocheck
"use client";
// What the employee knows beyond the script: brochures, fee sheets, FAQs, the website. Files are
// read in the browser (only text is uploaded); long documents are summarised to the facts a caller
// might ask about, and those notes go into the agent's instructions when it is published.

import { useEffect, useRef, useState } from "react";
import { extractText, ACCEPT } from "@/lib/docExtract";
import { Spinner } from "./Editors";

const KIND_ICON: Record<string, string> = { file: "📄", url: "🌐", text: "📝" };

/** Short, readable form of a web address: host + path, no tracking parameters. */
function shortSource(src: string) {
  try { const u = new URL(src); return (u.hostname.replace(/^www\./, "") + u.pathname).replace(/\/$/, "").slice(0, 70); } catch { return String(src || "").slice(0, 70); }
}

export default function KnowledgePanel({ scriptId, ensureSaved, onCount, openingLanguage, onUse }: any) {
  // "Use in script": what the AI pulled out of one document, for the owner to tick and add.
  const [extract, setExtract] = useState<Record<string, any>>({});
  const [picked, setPicked] = useState<Record<string, Record<string, boolean>>>({});
  const [added, setAdded] = useState<Record<string, string>>({});
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
    if (!id) { setErr("Couldn't save the employee yet — check the message next to the Save button at the top."); return false; }
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

  async function runExtract(id: string) {
    setExtract((m) => ({ ...m, [id]: { loading: true } }));
    setAdded((m) => ({ ...m, [id]: "" }));
    try {
      const res = await fetch("/api/studio/knowledge/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scriptId, id, openingLanguage }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't read this document.");
      setExtract((m) => ({ ...m, [id]: d }));
      const all: Record<string, boolean> = {};
      d.facts.forEach((_: any, i: number) => (all[`f${i}`] = true));
      d.faqs.forEach((_: any, i: number) => (all[`q${i}`] = true));
      d.pitch.forEach((_: any, i: number) => (all[`p${i}`] = true));
      setPicked((m) => ({ ...m, [id]: all }));
    } catch (e: any) { setExtract((m) => ({ ...m, [id]: { error: e.message } })); }
  }

  function addPicked(id: string) {
    const d = extract[id]; const p = picked[id] || {};
    const facts = d.facts.filter((_: any, i: number) => p[`f${i}`]);
    const faqs = d.faqs.filter((_: any, i: number) => p[`q${i}`]);
    const pitch = d.pitch.filter((_: any, i: number) => p[`p${i}`]);
    onUse?.({ facts, faqs, pitch });
    const parts = [facts.length && `${facts.length} fact${facts.length === 1 ? "" : "s"}`, faqs.length && `${faqs.length} FAQ${faqs.length === 1 ? "" : "s"}`, pitch.length && `${pitch.length} pitch point${pitch.length === 1 ? "" : "s"}`].filter(Boolean);
    setAdded((m) => ({ ...m, [id]: parts.length ? `Added ${parts.join(", ")} to the Script tab.` : "Nothing selected." }));
  }

  const toggle = (id: string, key: string) => setPicked((m) => ({ ...m, [id]: { ...(m[id] || {}), [key]: !(m[id] || {})[key] } }));

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
            className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-full border ${mode === k ? "bg-ink text-paper border-ink" : "bg-raised text-ink-soft border-line"}`}>{l}</button>
        ))}
      </div>

      {mode === "file" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files); }}
          onClick={() => !busy && fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl px-4 py-7 text-center cursor-pointer ${drag ? "border-signal bg-signal-tint" : "border-line bg-raised hover:border-signal/60"}`}>
          <div className="text-[13.5px] font-semibold">Drop files here or click to choose</div>
          <div className="text-[11.5px] text-ink-soft mt-1">PDF, Word (.docx) or text · up to 25 MB each · read on your computer, only the text is saved</div>
          <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" data-testid="knowledge-file" onChange={(e) => e.target.files && onFiles(e.target.files)} />
        </div>
      )}
      {mode === "url" && (
        <div className="flex gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourinstitute.com/courses/neet-pg"
            className="flex-1 border border-line rounded-lg px-3 py-2 text-[13.5px] bg-raised outline-none focus:border-signal" />
          <button type="button" onClick={addUrl} disabled={!!busy || !/^https?:\/\/\S+\.\S+/.test(url.trim())}
            className="bg-ink text-paper rounded-lg px-4 text-[13px] font-semibold disabled:opacity-40">Add page</button>
        </div>
      )}
      {mode === "text" && (
        <div className="flex flex-col gap-2 border border-line rounded-xl bg-raised p-3">
          <input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Title, e.g. Fee structure 2026"
            className="text-[13.5px] font-semibold outline-none bg-transparent" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder="Paste anything the employee should know…"
            className="text-[13.5px] outline-none bg-transparent resize-y" />
          <div className="flex justify-end">
            <button type="button" onClick={addNote} disabled={!!busy || note.trim().length < 20}
              className="bg-ink text-paper rounded-lg px-4 py-1.5 text-[13px] font-semibold disabled:opacity-40">Add notes</button>
          </div>
        </div>
      )}

      {busy && <div className="text-[12.5px] text-signal flex items-center gap-2"><Spinner /> {busy}</div>}
      {err && (
        <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2 flex items-center justify-between gap-3" data-testid="knowledge-error">
          <span>{err}</span>
          {/Type or paste/.test(err) && mode !== "text" && (
            <button type="button" onClick={() => { setMode("text"); setNoteTitle(noteTitle || (url ? (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })() : "")); setErr(""); }}
              className="shrink-0 bg-raised border border-line rounded-md px-2.5 py-1 font-semibold text-ink">Paste it instead</button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {loading && <div className="text-[12.5px] text-ink-soft">Loading…</div>}
        {!loading && items.length === 0 && <div className="text-[12.5px] text-ink-soft">Nothing added yet.</div>}
        {items.map((k) => (
          <div key={k.id} className="border border-line rounded-xl bg-raised" data-testid="knowledge-item">
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <span aria-hidden>{KIND_ICON[k.kind] || "📄"}</span>
              <button type="button" onClick={() => setOpen(open === k.id ? null : k.id)} className="flex-1 min-w-0 text-left">
                <div className="text-[13.5px] font-semibold truncate">{k.title}</div>
                <div className="text-[11.5px] text-ink-soft truncate" title={k.source || ""}>
                  {(k.chars || 0) < 1000 ? `${k.chars || 0} characters` : `${Math.round((k.chars || 0) / 1000)}k characters`}{k.summary ? " · summarised for calls" : ""}{k.source ? ` · ${shortSource(k.source)}` : ""}
                </div>
              </button>
              <button type="button" onClick={() => runExtract(k.id)} disabled={extract[k.id]?.loading} data-testid="knowledge-use"
                className="shrink-0 text-[12px] font-semibold bg-signal text-on-accent rounded-md px-2.5 py-1 disabled:opacity-50 flex items-center gap-1.5">
                {extract[k.id]?.loading ? <><Spinner /> Reading…</> : "✦ Use in script"}
              </button>
              <button type="button" onClick={() => setOpen(open === k.id ? null : k.id)} className="shrink-0 text-[12px] font-semibold text-signal">{open === k.id ? "Hide" : "What it read"}</button>
              <button type="button" onClick={() => remove(k.id)} className="shrink-0 text-miss text-[12px] font-semibold" aria-label={`Remove ${k.title}`}>✕</button>
            </div>
            {k.hint && (
              <div className="mx-3.5 mb-2.5 text-[12px] bg-hot-tint border border-hot/30 rounded-lg px-3 py-2 flex items-start justify-between gap-3" data-testid="knowledge-hint">
                <span>{k.hint}</span>
                {k.kind === "url" && <button type="button" onClick={() => { setMode("text"); setNoteTitle(k.title); }} className="shrink-0 bg-raised border border-line rounded-md px-2 py-0.5 font-semibold">Paste instead</button>}
              </div>
            )}
            {open === k.id && (
              <div className="border-t border-line px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-soft max-h-80 overflow-y-auto">
                <div className="text-[10.5px] font-semibold uppercase tracking-wide mb-1">{k.summary ? "Notes the employee uses on calls" : "Text read from the source"}</div>
                <div className="whitespace-pre-wrap break-words">{k.summary || k.preview}</div>
                {k.summary && k.preview && (
                  <details className="mt-2"><summary className="cursor-pointer font-semibold text-ink">Show the original text</summary><div className="whitespace-pre-wrap break-words mt-1">{k.preview}</div></details>
                )}
              </div>
            )}
            {extract[k.id]?.error && <div className="border-t border-line px-3.5 py-2.5 text-[12.5px] text-miss">{extract[k.id].error}</div>}
            {extract[k.id]?.facts && (() => {
              const d = extract[k.id]; const p = picked[k.id] || {};
              const Row = ({ id: key, children }: any) => (
                <label className="flex items-start gap-2 py-0.5 cursor-pointer">
                  <input type="checkbox" checked={!!p[key]} onChange={() => toggle(k.id, key)} className="mt-1 accent-signal" />
                  <span className="flex-1">{children}</span>
                </label>
              );
              const empty = !d.facts.length && !d.faqs.length && !d.pitch.length;
              return (
                <div className="border-t border-line px-3.5 py-3 text-[12.5px] flex flex-col gap-3" data-testid="knowledge-extract">
                  {d.summary && <div className="text-ink-soft">{d.summary}</div>}
                  {empty && <div className="text-warm">Nothing script-ready was found in this source.{d.hint ? "" : " Try the brochure or fee sheet instead."}</div>}
                  {d.facts.length > 0 && <div><div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft mb-1">Facts → Facts card</div>{d.facts.map((f: string, i: number) => <Row key={i} id={`f${i}`}>{f}</Row>)}</div>}
                  {d.faqs.length > 0 && <div><div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft mb-1">Questions callers ask → FAQs card</div>{d.faqs.map((f: any, i: number) => <Row key={i} id={`q${i}`}><b>{f.question}</b> <span className="text-ink-soft">— {f.answer}</span></Row>)}</div>}
                  {d.pitch.length > 0 && <div><div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft mb-1">Selling points → Pitch card</div>{d.pitch.map((f: string, i: number) => <Row key={i} id={`p${i}`}>{f}</Row>)}</div>}
                  {d.missing?.length > 0 && <div className="bg-paper border border-line rounded-lg px-3 py-2"><div className="font-semibold mb-0.5">Not in this source — find it elsewhere</div>{d.missing.map((m: string, i: number) => <div key={i}>• {m}</div>)}</div>}
                  {!empty && (
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => addPicked(k.id)} data-testid="knowledge-add" className="bg-ink text-paper rounded-lg px-3.5 py-1.5 font-semibold">Add selected to script</button>
                      {added[k.id] && <span className="text-signal font-semibold">{added[k.id]}</span>}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
