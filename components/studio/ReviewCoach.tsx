// @ts-nocheck
"use client";
// Review step: AI Coach (checks the script like a sales trainer, rewrites any answer) and
// Practice (chat with the employee as a customer — or let an AI customer call it — before going live).

import { useRef, useState } from "react";
import { Spinner } from "./Editors";
import { OBJECTION_TYPES, INTENTS, ACTIONS, REWRITE_KINDS, PERSONAS } from "@/lib/coach";

const LANGS = [["auto", "Same as the call"], ["mix", "Mixed (Tenglish / Hinglish)"], ["te", "Telugu"], ["hi", "Hindi"], ["en", "English"], ["ta", "Tamil"], ["kn", "Kannada"]];
const QUICK = [
  "Your fee is too high. Why should I pay that much?", "I don't have money right now.", "I'll think about it and call you back.",
  "Send the details on WhatsApp.", "I want to join today — how do I pay?", "Can I talk to someone from your team?",
  "I already paid but my admission is not confirmed.", "Are you a robot?",
];

async function coach(body: any) {
  const res = await fetch("/api/studio/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "The AI coach couldn't answer. Try again.");
  return d;
}

function refLabel(ref: string, pb: any) {
  const [k, n] = ref.split(" ");
  const i = Number(n);
  if (k === "objection") return `Objection ${i + 1}${pb.objections[i] ? ` — “${pb.objections[i].objection}”` : ""}`;
  if (k === "pitch") return `Pitch point ${i + 1}`;
  if (k === "discovery") return `Question ${i + 1}`;
  if (k === "faq") return `FAQ ${i + 1}${pb.faqs[i] ? ` — ${pb.faqs[i].question}` : ""}`;
  return { opening: "Opening", closing: "Closing", greeting: "Greeting" }[k] || "Call flow";
}
function currentOf(ref: string, pb: any, greeting: string) {
  const [k, n] = ref.split(" "); const i = Number(n);
  if (k === "objection") return pb.objections[i]?.response;
  if (k === "pitch") return pb.pitch[i];
  if (k === "discovery") return pb.discovery[i];
  if (k === "faq") return pb.faqs[i]?.answer;
  if (k === "opening") return pb.opening;
  if (k === "closing") return pb.closing;
  if (k === "greeting") return greeting;
  return null;
}
/** Write `text` into the playbook at `ref`; returns the studio patch. */
function applyAt(ref: string, text: string, pb: any) {
  const [k, n] = ref.split(" "); const i = Number(n);
  const upd = (arr: any[], fn: (x: any) => any) => arr.map((x, j) => (j === i ? fn(x) : x));
  if (k === "objection") return { playbook: { ...pb, objections: upd(pb.objections, (o) => ({ ...o, response: text })) } };
  if (k === "pitch") return { playbook: { ...pb, pitch: upd(pb.pitch, () => text) } };
  if (k === "discovery") return { playbook: { ...pb, discovery: upd(pb.discovery, () => text) } };
  if (k === "faq") return { playbook: { ...pb, faqs: upd(pb.faqs, (f) => ({ ...f, answer: text })) } };
  if (k === "opening" || k === "closing") return { playbook: { ...pb, [k]: text } };
  if (k === "greeting") return { greeting: text };
  return null;
}

const Pill = ({ tone = "neutral", children }: any) => (
  <span className={`text-[10.5px] font-semibold rounded-full px-2 py-0.5 border ${tone === "hot" ? "bg-hot-tint border-hot/40 text-warm" : tone === "signal" ? "bg-signal-tint border-signal/30 text-signal" : tone === "violet" ? "bg-violet-tint border-violet/30 text-violet" : tone === "miss" ? "bg-miss-tint border-miss/30 text-miss" : "bg-paper border-line text-ink-soft"}`}>{children}</span>
);

/* ─────────────── Rewrite toolbar for one line ─────────────── */
function Rewriter({ text, context, onUse, base }: any) {
  const [busy, setBusy] = useState<string | null>(null);
  const [lang, setLang] = useState("auto");
  const [options, setOptions] = useState<string[]>([]);
  const [err, setErr] = useState("");
  async function run(kind: string) {
    setBusy(kind); setErr(""); setOptions([]);
    try { const d = await coach({ ...base, mode: "rewrite", text, kind, language: lang, context }); setOptions(d.options); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {Object.entries(REWRITE_KINDS).filter(([k]) => k !== "objection" || context).map(([k, l]) => (
          <button key={k} type="button" disabled={!!busy || !text?.trim()} onClick={() => run(k)} data-testid={`rw-${k}`}
            className="text-[11.5px] font-semibold border border-line rounded-full px-2.5 py-1 bg-paper hover:border-signal disabled:opacity-40 flex items-center gap-1">
            {busy === k && <Spinner />}{l}
          </button>
        ))}
        <select value={lang} onChange={(e) => setLang(e.target.value)} className="text-[11.5px] border border-line rounded-full px-2 py-1 bg-paper">
          {LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {err && <div className="text-[12px] text-miss">{err}</div>}
      {options.map((o, i) => (
        <div key={i} className="flex items-start gap-2 border border-signal/30 bg-signal-tint/30 rounded-lg px-3 py-2" data-testid="rw-option">
          <div className="text-[13px] flex-1 leading-relaxed">{o}</div>
          <button type="button" onClick={() => { onUse(o); setOptions([]); }} className="text-[12px] font-semibold text-signal shrink-0">Use this</button>
        </div>
      ))}
    </div>
  );
}

/* ─────────────── Coach tab ─────────────── */
function CoachPanel({ studio, set, base }: any) {
  const pb = studio.playbook;
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<any>(null);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [openRw, setOpenRw] = useState<string | null>(null);
  const [line, setLine] = useState("");
  const [answer, setAnswer] = useState<any>(null);
  const [answering, setAnswering] = useState(false);

  async function runAudit() {
    setBusy(true); setErr(""); setDone({});
    try { setAudit(await coach({ ...base, mode: "audit" })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function ask() {
    if (!line.trim()) return;
    setAnswering(true); setAnswer(null);
    try { const d = await coach({ ...base, mode: "simulate", history: [{ role: "customer", text: line.trim() }] }); setAnswer({ ...d, line: line.trim() }); }
    catch (e: any) { setAnswer({ error: e.message }); } finally { setAnswering(false); }
  }
  const addObjection = (objection: string, response: string) => set({ playbook: { ...pb, objections: [...pb.objections, { objection, response }] } });

  const lines = [
    studio.greeting && { ref: "greeting", label: "Greeting", text: studio.greeting },
    pb.opening && { ref: "opening", label: "Opening", text: pb.opening },
    ...pb.objections.map((o: any, i: number) => ({ ref: `objection ${i}`, label: `“${o.objection}”`, text: o.response, context: o.objection })),
    ...pb.pitch.map((p: string, i: number) => p && { ref: `pitch ${i}`, label: `Pitch ${i + 1}`, text: p }),
    pb.closing && { ref: "closing", label: "Closing", text: pb.closing },
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4" data-testid="coach">
      <div className="border border-line rounded-xl bg-raised p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="text-[14px] font-semibold">AI script check</div>
            <div className="text-[12px] text-ink-soft">Reads your script like a sales trainer: weak answers, missing objections, lines that won't sound natural on a call.</div>
          </div>
          <button type="button" onClick={runAudit} disabled={busy} data-testid="run-audit" className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50 flex items-center gap-2">
            {busy ? <><Spinner /> Checking… (20–40 s)</> : audit ? "✦ Check again" : "✦ Check my script"}
          </button>
        </div>
        {err && <div className="text-[12.5px] text-miss">{err}</div>}
        {audit && (
          <div className="flex flex-col gap-3" data-testid="audit">
            <div className="flex items-center gap-3">
              <div className={`w-14 h-14 rounded-full border-4 flex items-center justify-center font-display font-bold text-[18px] ${audit.score >= 80 ? "border-signal text-signal" : audit.score >= 60 ? "border-hot text-warm" : "border-miss text-miss"}`}>{audit.score}</div>
              <div className="text-[13px] flex-1">{audit.summary || "Here's what would make it stronger."}</div>
            </div>
            {audit.findings.map((f: any, i: number) => {
              const key = `f${i}`; const cur = currentOf(f.ref, pb, studio.greeting);
              return (
                <div key={key} className={`border rounded-lg p-3 ${done[key] ? "border-signal/40 bg-signal-tint/30" : "border-line bg-paper"}`} data-testid="finding">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[12px] font-semibold">{refLabel(f.ref, pb)}</span>
                    {f.type !== "flow" && <Pill tone="violet">{OBJECTION_TYPES[f.type]}</Pill>}
                  </div>
                  {cur && <div className="text-[12.5px] text-ink-soft"><span className="font-semibold">Now:</span> {cur}</div>}
                  <div className="text-[12.5px] text-warm mt-1">{f.problem}</div>
                  <div className="text-[13px] mt-1.5 leading-relaxed"><span className="font-semibold text-signal">Better:</span> {f.suggestion}</div>
                  <div className="flex gap-3 mt-2">
                    {done[key] ? <span className="text-[12px] font-semibold text-signal">✓ Applied</span> : (
                      applyAt(f.ref, f.suggestion, pb)
                        ? <button type="button" onClick={() => { set(applyAt(f.ref, f.suggestion, pb)); setDone((d) => ({ ...d, [key]: true })); }} className="text-[12px] font-semibold text-signal" data-testid="use-finding">Use this</button>
                        : <span className="text-[11.5px] text-ink-soft">Apply it by hand in the Studio.</span>
                    )}
                  </div>
                </div>
              );
            })}
            {audit.missing.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-[12.5px] font-semibold">Objections your script doesn't handle yet</div>
                {audit.missing.map((m: any, i: number) => {
                  const key = `m${i}`;
                  return (
                    <div key={key} className="border border-hot/30 bg-hot-tint/40 rounded-lg p-3" data-testid="missing-objection">
                      <div className="flex items-center gap-2"><span className="text-[13px] font-semibold">“{m.objection}”</span><Pill tone="violet">{OBJECTION_TYPES[m.type]}</Pill></div>
                      <div className="text-[13px] mt-1">→ {m.response}</div>
                      {done[key] ? <div className="text-[12px] font-semibold text-signal mt-1.5">✓ Added</div>
                        : <button type="button" onClick={() => { addObjection(m.objection, m.response); setDone((d) => ({ ...d, [key]: true })); }} className="text-[12px] font-semibold text-signal mt-1.5" data-testid="add-missing">+ Add to script</button>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border border-line rounded-xl bg-raised p-4 flex flex-col gap-2">
        <div className="text-[14px] font-semibold">What if a customer says…</div>
        <div className="text-[12px] text-ink-soft">Type anything a customer might say. See how your employee answers, what it understood, and save good answers to the script.</div>
        <div className="flex gap-2">
          <input value={line} onChange={(e) => setLine(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="e.g. I don't have money right now" data-testid="whatif-input"
            className="flex-1 border border-line rounded-lg px-3 py-2 text-[13px] bg-paper outline-none focus:border-signal" />
          <button type="button" onClick={ask} disabled={answering || !line.trim()} data-testid="whatif-go" className="bg-ink text-paper rounded-lg px-4 text-[13px] font-semibold disabled:opacity-40 flex items-center gap-2">{answering ? <Spinner /> : "See answer"}</button>
        </div>
        <div className="flex flex-wrap gap-1.5">{QUICK.slice(0, 4).map((q) => <button key={q} type="button" onClick={() => setLine(q)} className="text-[11.5px] border border-dashed border-line rounded-full px-2.5 py-0.5 text-ink-soft hover:text-ink">{q}</button>)}</div>
        {answer?.error && <div className="text-[12.5px] text-miss">{answer.error}</div>}
        {answer?.reply && (
          <div className="border border-line rounded-lg bg-paper p-3 flex flex-col gap-2" data-testid="whatif-answer">
            <Analysis a={answer.analysis} />
            <div className="text-[13.5px] leading-relaxed"><span className="font-semibold text-signal">Employee:</span> {answer.reply}</div>
            <div className="flex gap-3">
              <button type="button" onClick={() => { addObjection(answer.line, answer.reply); setAnswer({ ...answer, saved: true }); }} disabled={answer.saved} className="text-[12px] font-semibold text-signal disabled:text-ink-soft" data-testid="save-answer">{answer.saved ? "✓ Saved to objection handling" : "Save as objection handling"}</button>
            </div>
          </div>
        )}
      </div>

      <div className="border border-line rounded-xl bg-raised p-4 flex flex-col gap-2">
        <div className="text-[14px] font-semibold">Improve any answer</div>
        <div className="text-[12px] text-ink-soft">Pick a line and ask the AI to rewrite it — more natural, shorter, more human, or in Telugu / English / mixed.</div>
        {lines.map((l: any) => (
          <div key={l.ref} className="border border-line rounded-lg px-3 py-2 bg-paper">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[11.5px] font-semibold text-ink-soft truncate">{l.label}</div>
                <div className="text-[13px] leading-relaxed">{l.text}</div>
              </div>
              <button type="button" onClick={() => setOpenRw(openRw === l.ref ? null : l.ref)} className="text-[12px] font-semibold text-signal shrink-0" data-testid={`rewrite-${l.ref.replace(" ", "-")}`}>{openRw === l.ref ? "Close" : "✦ Rewrite"}</button>
            </div>
            {openRw === l.ref && <Rewriter text={l.text} context={l.context} base={base} onUse={(t: string) => set(applyAt(l.ref, t, pb))} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function Analysis({ a }: any) {
  if (!a) return null;
  const transfer = a.action === "transfer";
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="analysis">
      <Pill>{INTENTS[a.intent] || a.intent}</Pill>
      {a.objection && <Pill tone="violet">Objection: {OBJECTION_TYPES[a.objection]}</Pill>}
      <Pill tone={a.lead_intent === "high" ? "hot" : a.lead_intent === "low" ? "miss" : "neutral"}>Lead intent: {a.lead_intent.toUpperCase()}</Pill>
      <Pill tone={transfer ? "hot" : "signal"}>→ {ACTIONS[a.action]}{transfer && a.transfer_to ? `: ${a.transfer_to}` : ""}</Pill>
      {a.why && <span className="text-[11.5px] text-ink-soft">{a.why}</span>}
    </div>
  );
}

/* ─────────────── Practice tab ─────────────── */
function PracticePanel({ studio, set, base }: any) {
  const [turns, setTurns] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [persona, setPersona] = useState("price");
  const [err, setErr] = useState("");
  const stop = useRef(false);
  const history = (list: any[]) => list.map((t) => ({ role: t.role, text: t.text }));

  async function agentTurn(list: any[]) {
    const d = await coach({ ...base, mode: "simulate", history: history(list) });
    const next = [...list];
    next[next.length - 1] = { ...next[next.length - 1], analysis: d.analysis };
    next.push({ role: "agent", text: d.reply, action: d.analysis?.action, to: d.analysis?.transfer_to });
    setTurns(next);
    return next;
  }
  async function send(text?: string) {
    const t = (text ?? input).trim(); if (!t || busy) return;
    setErr(""); setBusy(true); setInput("");
    const list = [...turns, { role: "customer", text: t }]; setTurns(list);
    try { await agentTurn(list); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function runAuto() {
    setErr(""); setAuto(true); setBusy(true); stop.current = false;
    let list: any[] = [];
    setTurns([]);
    try {
      for (let i = 0; i < 8 && !stop.current; i++) {
        const c = await coach({ ...base, mode: "customer", persona, history: history(list) });
        list = [...list, { role: "customer", text: c.line }]; setTurns(list);
        if (stop.current) break;
        list = await agentTurn(list);
        const last = list[list.length - 1];
        if (c.done || ["end_call", "transfer"].includes(last.action)) break;
      }
    } catch (e: any) { setErr(e.message); } finally { setAuto(false); setBusy(false); }
  }
  const pairSave = (i: number) => {
    const c = turns[i - 1]; const a = turns[i];
    if (!c || !a) return;
    set({ playbook: { ...studio.playbook, objections: [...studio.playbook.objections, { objection: c.text, response: a.text }] } });
    setTurns(turns.map((t, j) => (j === i ? { ...t, saved: true } : t)));
  };

  return (
    <div className="flex flex-col gap-3" data-testid="practice">
      <div className="text-[12.5px] text-ink-soft">Talk to your employee by typing as the customer — it answers exactly from this script, and shows what it understood and what it would do next (keep talking, close, or hand over to your team). Nothing here is a real call and it's free.</div>
      <div className="border border-line rounded-xl bg-raised p-4 flex flex-col gap-3 min-h-[240px]">
        {studio.greeting && <Bubble who="agent" text={studio.greeting} />}
        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-1">
            <Bubble who={t.role} text={t.text} />
            {t.role === "customer" && t.analysis && <div className="self-end max-w-[85%]"><Analysis a={t.analysis} /></div>}
            {t.role === "agent" && t.action === "transfer" && <div className="text-[12px] font-semibold text-warm">↪ Hands the call to {t.to || "your team"}{studio.handoff?.enabled ? "" : " — set up who gets it in Studio → Call transfer"}</div>}
            {t.role === "agent" && i > 0 && turns[i - 1]?.analysis?.objection && (
              <button type="button" onClick={() => pairSave(i)} disabled={t.saved} className="self-start text-[11.5px] font-semibold text-signal disabled:text-ink-soft">{t.saved ? "✓ Saved to objection handling" : "Save this answer to the script"}</button>
            )}
          </div>
        ))}
        {busy && <div className="text-[12px] text-ink-soft flex items-center gap-2"><Spinner /> {auto ? "AI customer and your employee are talking…" : "Your employee is replying…"}</div>}
        {!turns.length && !busy && <div className="text-[12.5px] text-ink-soft">Start with one of these, or type your own:</div>}
        {!turns.length && !busy && <div className="flex flex-wrap gap-1.5">{QUICK.map((q) => <button key={q} type="button" onClick={() => send(q)} className="text-[12px] border border-line rounded-full px-2.5 py-1 bg-paper hover:border-signal" data-testid="quick">{q}</button>)}</div>}
      </div>
      {err && <div className="text-[12.5px] text-miss">{err}</div>}
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} disabled={auto} placeholder="Type what the customer says…" data-testid="practice-input"
          className="flex-1 border border-line rounded-lg px-3 py-2 text-[13px] bg-paper outline-none focus:border-signal" />
        <button type="button" onClick={() => send()} disabled={busy || !input.trim()} data-testid="practice-send" className="bg-ink text-paper rounded-lg px-4 text-[13px] font-semibold disabled:opacity-40">Send</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="text-[12.5px] font-semibold">Let AI play the customer:</span>
        <select value={persona} onChange={(e) => setPersona(e.target.value)} disabled={auto} className="text-[12.5px] border border-line rounded-lg px-2 py-1.5 bg-paper max-w-[340px]" data-testid="persona">
          {Object.entries(PERSONAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {auto
          ? <button type="button" onClick={() => { stop.current = true; }} className="border border-line rounded-lg px-3 py-1.5 text-[12.5px] font-semibold">Stop</button>
          : <button type="button" onClick={runAuto} disabled={busy} data-testid="run-auto" className="bg-violet text-on-accent rounded-lg px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40">▶ Run a full conversation</button>}
        {turns.length > 0 && !busy && <button type="button" onClick={() => { setTurns([]); setErr(""); }} className="text-[12px] text-ink-soft underline ml-auto">Start over</button>}
      </div>
    </div>
  );
}

function Bubble({ who, text }: any) {
  const agent = who === "agent";
  return (
    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed ${agent ? "self-start bg-paper border border-line rounded-bl-md" : "self-end bg-signal-tint border border-signal/20 rounded-br-md"}`}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft mb-0.5">{agent ? "Your employee" : "Customer"}</div>
      {text}
    </div>
  );
}

export default function ReviewCoach({ tab, studio, set, name, openingLanguage, policy, strictness }: any) {
  const base = { playbook: studio.playbook, greeting: studio.greeting, links: studio.links, pronunciations: studio.pronunciations, handoff: studio.handoff, openingLanguage, policy, name, strictness };
  if (!studio.playbook) return <div className="text-[13px] text-ink-soft">Build the call plan in the Studio first.</div>;
  return tab === "practice" ? <PracticePanel studio={studio} set={set} base={base} /> : <CoachPanel studio={studio} set={set} base={base} />;
}
