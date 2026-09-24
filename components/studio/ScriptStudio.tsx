// @ts-nocheck
"use client";
// Script Studio: paste any script → the AI splits it into a call playbook (opening, questions,
// pitch, objections, FAQs, closing, facts), finds links and hard-to-say words, and points out gaps.
// Every card stays editable by hand, and "Ask AI to change" edits it in plain words.

import { useState } from "react";
import { Card, ListEditor, PairEditor, AutoText, Spinner } from "./Editors";
import AskAiBar from "./AskAiBar";
import KnowledgePanel from "./KnowledgePanel";
import PronunciationPanel from "./PronunciationPanel";
import { EMPTY_PLAYBOOK, LANG_NAMES, baseLang, detectScriptLanguage, spokenUrl } from "@/lib/playbook";

const PURPOSES = [["payment", "Payment"], ["website", "Website"], ["booking", "Booking / demo"], ["brochure", "Brochure"], ["other", "Other"]];

const SAMPLE = `Intro: Namaskaram, I'm calling from DBMCI Hyderabad about NEET PG coaching.
Ask: Which year are you preparing for? Are you doing internship now?
Pitch: Our NEET PG regular batch starts 5th October. Classes by top faculty, recorded videos, 50+ grand tests.
Fee is ₹1,20,000. EMI available.
Objection: Fees are too high → We have EMI from ₹10,000 per month and a 10% early-bird discount till 30th September.
Objection: I'll think about it → Sure, can I send the brochure on WhatsApp? Seats in the regular batch are limited.
Close: Ask them to book a free demo class at dbmci.com/demo or pay the seat booking amount at https://rzp.io/l/dbmci-neetpg`;

export default function ScriptStudio({ value, set, agentName, openingLanguage, policy, voiceId, speed, scriptId, ensureSaved, strictness, setStrictness, strictnessLabels }: any) {
  const { sourceScript, playbook, greeting, links, pronunciations, keyterms } = value;
  const [tab, setTab] = useState<"script" | "knowledge" | "links" | "say">("script");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const [showSource, setShowSource] = useState(!playbook);
  const [translating, setTranslating] = useState(false);
  const [translateErr, setTranslateErr] = useState("");
  const [knowledgeCount, setKnowledgeCount] = useState<number | null>(null);

  const open = baseLang(openingLanguage);
  const openName = LANG_NAMES[open] || "English";
  const pb = playbook || EMPTY_PLAYBOOK;
  const setPb = (patch: any) => set({ playbook: { ...pb, ...patch } });

  async function analyze() {
    if (playbook && !confirm("Re-reading the script replaces the cards below (knowledge, pronunciation and links you added stay). Continue?")) return;
    setAnalyzing(true); setAnalyzeMsg(null);
    try {
      const res = await fetch("/api/studio/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: sourceScript, agentName, openingLanguage, scriptId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't read the script.");
      const mergedLinks = [...links];
      for (const l of d.links || []) if (!mergedLinks.some((x: any) => x.url === l.url)) mergedLinks.push(l);
      const mergedPron = [...pronunciations];
      for (const p of d.pronunciations || []) if (!mergedPron.some((x: any) => x.word.toLowerCase() === p.word.toLowerCase())) mergedPron.push(p);
      set({
        playbook: d.playbook,
        greeting: d.greeting || greeting,
        links: mergedLinks,
        pronunciations: mergedPron,
        keyterms: Array.from(new Set([...(keyterms || []), ...(d.keyterms || [])])),
      });
      setShowSource(false);
      const pbx = d.playbook;
      const n = (pbx.discovery?.length || 0) + (pbx.pitch?.length || 0) + (pbx.objections?.length || 0) + (pbx.faqs?.length || 0);
      setAnalyzeMsg(d.fallback
        ? { tone: "warn", text: d.warning || "AI isn't set up yet, so the script was split by its headings. Check each card." }
        : d.warning ? { tone: "warn", text: d.warning }
        : { tone: "ok", text: `Read your script${d.parts > 1 ? ` (in ${d.parts} parts)` : ""}: ${pbx.objections.length} objection${pbx.objections.length === 1 ? "" : "s"}, ${pbx.faqs.length} FAQ${pbx.faqs.length === 1 ? "" : "s"}, ${n} items in total${d.links?.length ? `, ${d.links.length} link${d.links.length === 1 ? "" : "s"}` : ""}. Check the cards below.` });
    } catch (e: any) { setAnalyzeMsg({ tone: "err", text: e.message }); }
    finally { setAnalyzing(false); }
  }

  async function translateGreeting() {
    setTranslating(true); setTranslateErr("");
    try {
      const res = await fetch("/api/studio/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: greeting, to: open }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Translation failed.");
      set({ greeting: d.text });
    } catch (e: any) { setTranslateErr(e.message); }
    finally { setTranslating(false); }
  }

  const greetLang = detectScriptLanguage(greeting);
  const greetMismatch = greeting.trim() && greetLang && greetLang !== open;

  const tabs = [
    ["script", "Script", null],
    ["knowledge", "Knowledge", knowledgeCount],
    ["links", "Links & payments", links.length || null],
    ["say", "Pronunciation", pronunciations.length || null],
  ];

  const setLink = (i: number, k: string, v: string) => set({ links: links.map((l: any, j: number) => (j === i ? { ...l, [k]: v, ...(k === "url" && (!l.say || l.say === spokenUrl(l.url)) ? { say: spokenUrl(v) } : {}) } : l)) });

  return (
    <div className="flex flex-col gap-5" data-testid="studio">
      <div className="flex gap-1 border-b border-line -mx-1">
        {tabs.map(([k, l, n]) => (
          <button key={k} type="button" onClick={() => setTab(k as any)} data-testid={`tab-${k}`}
            className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px flex items-center gap-1.5 ${tab === k ? "border-signal text-signal" : "border-transparent text-ink-soft hover:text-ink"}`}>
            {l}{n ? <span className="text-[10.5px] bg-paper border border-line rounded-full px-1.5 text-ink-soft">{n}</span> : null}
          </button>
        ))}
      </div>

      {tab === "script" && (
        <>
          {/* 1. The raw script */}
          {showSource ? (
            <Card title="Paste your call script" hint="Any format works — headings, bullet points, a paragraph, or a transcript of your best counsellor's call. English, Telugu, Hindi or mixed." testId="source-card">
              <textarea value={sourceScript} onChange={(e) => set({ sourceScript: e.target.value })} rows={10} data-testid="source-script"
                placeholder={"Intro: …\nQuestions to ask: …\nOffer / fees: …\nIf they say it's expensive: …\nClosing: …"}
                className="w-full border border-line rounded-lg px-3 py-2.5 text-[13.5px] bg-white outline-none focus:border-signal resize-y leading-relaxed" />
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button type="button" onClick={analyze} disabled={analyzing || sourceScript.trim().length < 40} data-testid="analyze"
                  className="bg-signal text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-40 flex items-center gap-2">
                  {analyzing ? <><Spinner /> Reading your script…</> : <>✦ {playbook ? "Read it again" : "Build the call plan with AI"}</>}
                </button>
                {!playbook && !sourceScript && (
                  <button type="button" onClick={() => set({ sourceScript: SAMPLE })} className="text-[12.5px] font-semibold text-ink-soft underline">Try a sample script</button>
                )}
                {!playbook && (
                  <button type="button" onClick={() => { set({ playbook: { ...EMPTY_PLAYBOOK } }); setShowSource(false); }} className="text-[12.5px] font-semibold text-ink-soft ml-auto">
                    or write it card by card →
                  </button>
                )}
                {playbook && <button type="button" onClick={() => setShowSource(false)} className="text-[12.5px] font-semibold text-ink-soft ml-auto">Hide</button>}
              </div>
              {analyzing && <div className="text-[12px] text-ink-soft mt-2">Finding the opening, questions, objections, FAQs and closing… {sourceScript.length > 9000 ? `this is a long script, so it's read in ${Math.min(6, Math.ceil(sourceScript.length / 9000))} parts at once — about 1–2 minutes.` : "this takes 10–40 seconds."}</div>}
            </Card>
          ) : (
            <button type="button" onClick={() => setShowSource(true)} className="text-left border border-dashed border-line rounded-xl px-4 py-2.5 text-[12.5px] text-ink-soft hover:border-signal">
              <span className="font-semibold text-ink">Original script</span> · {sourceScript ? `${sourceScript.trim().split(/\s+/).length} words — show / read again` : "paste one to let AI build the plan"}
            </button>
          )}

          {analyzeMsg && (
            <div className={`text-[12.5px] rounded-lg px-3 py-2 border ${analyzeMsg.tone === "ok" ? "bg-signal-tint border-signal/20 text-signal" : analyzeMsg.tone === "warn" ? "bg-hot-tint border-hot/30 text-warm" : "bg-miss-tint border-miss/20 text-miss"}`} data-testid="analyze-msg">
              {analyzeMsg.text}
            </div>
          )}

          {playbook && (
            <>
              <AskAiBar playbook={pb} greeting={greeting} links={links} openingLanguage={openingLanguage} onApply={(x: any) => set(x)} />

              {pb.missing?.length > 0 && (
                <Card title="Gaps the AI noticed" hint="Callers often ask these. Add the answer to a card below, or in Knowledge." tone="warn" testId="missing">
                  <ul className="flex flex-col gap-1">
                    {pb.missing.map((m: string, i: number) => (
                      <li key={i} className="text-[13px] flex items-start gap-2">
                        <span className="text-hot mt-0.5">!</span><span className="flex-1">{m}</span>
                        <button type="button" onClick={() => setPb({ missing: pb.missing.filter((_: any, j: number) => j !== i) })} className="text-[11px] text-ink-soft hover:text-ink">Dismiss</button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <Card title="Greeting" hint={`Said word-for-word the moment the call connects, in ${openName}.`} testId="greeting-card"
                right={greetMismatch ? null : greeting.trim() ? <span className="text-[11px] text-signal font-semibold">✓ {openName}</span> : null}>
                <AutoText value={greeting} onChange={(v: string) => set({ greeting: v })} rows={2} data-testid="greeting"
                  placeholder={open === "te" ? "నమస్కారం, నేను DBMCI నుండి మాట్లాడుతున్నాను…" : open === "hi" ? "नमस्ते, मैं DBMCI से बात कर रही हूँ…" : "Hello, this is Priya calling from DBMCI…"}
                  className="text-[14px] border border-line rounded-lg px-3 py-2 bg-white focus:border-signal" />
                {greetMismatch && (
                  <div className="mt-2 flex items-center justify-between gap-3 text-[12.5px] bg-hot-tint border border-hot/30 rounded-lg px-3 py-2" data-testid="greeting-mismatch">
                    <span>This greeting is in {LANG_NAMES[greetLang] || "another language"}, but the employee opens calls in <b>{openName}</b>.</span>
                    <button type="button" onClick={translateGreeting} disabled={translating} className="shrink-0 bg-white border border-line rounded-md px-2.5 py-1 font-semibold flex items-center gap-1.5">
                      {translating ? <Spinner /> : null} Translate to {openName}
                    </button>
                  </div>
                )}
                {translateErr && <div className="text-[12px] text-miss mt-1">{translateErr}</div>}
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <Card title="Goal of the call" hint="What a successful call ends with.">
                  <AutoText value={pb.goal} onChange={(v: string) => setPb({ goal: v })} placeholder="Book a free demo class or collect the seat booking amount" className="text-[13.5px]" />
                </Card>
                <Card title="Who the employee is" hint="Name, role, tone.">
                  <AutoText value={pb.persona} onChange={(v: string) => setPb({ persona: v })} placeholder="Priya, a friendly senior counsellor at DBMCI Hyderabad" className="text-[13.5px]" />
                </Card>
              </div>

              <Card title="① Opening" hint="Right after the greeting — why you're calling." testId="card-opening">
                <AutoText value={pb.opening} onChange={(v: string) => setPb({ opening: v })} placeholder="I'm calling about our NEET PG batch starting next month…" className="text-[13.5px]" />
              </Card>
              <Card title="② Questions to ask" hint="Asked one at a time, in this order." badge={pb.discovery.length} testId="card-discovery">
                <ListEditor items={pb.discovery} onChange={(v: any) => setPb({ discovery: v })} numbered placeholder="Which year are you preparing for?" addLabel="+ Add a question" />
              </Card>
              <Card title="③ Pitch" hint="Key points, most important first. The employee picks the ones that match the caller." badge={pb.pitch.length} testId="card-pitch">
                <ListEditor items={pb.pitch} onChange={(v: any) => setPb({ pitch: v })} numbered placeholder="Recorded videos you can watch anytime" addLabel="+ Add a point" />
              </Card>
              <Card title="④ Objection handling" hint="When the caller pushes back." badge={pb.objections.length} testId="card-objections">
                <PairEditor items={pb.objections} onChange={(v: any) => setPb({ objections: v })} left="If the caller says" right="Respond with" leftKey="objection" rightKey="response"
                  leftPh="Fees are too high" rightPh="We have EMI from ₹10,000 a month…" addLabel="+ Add an objection" />
              </Card>
              <Card title="⑤ Closing" hint="The exact ask / next step." testId="card-closing">
                <AutoText value={pb.closing} onChange={(v: string) => setPb({ closing: v })} placeholder="Shall I book your free demo class for this Saturday?" className="text-[13.5px]" />
              </Card>
              <Card title="If they're not ready" hint="Callback, send details on WhatsApp, etc.">
                <AutoText value={pb.followUp} onChange={(v: string) => setPb({ followUp: v })} placeholder="Offer to send the brochure on WhatsApp and ask for a good time to call back." className="text-[13.5px]" />
              </Card>
              <Card title="Questions callers ask" hint="The employee answers these from here — word it the way you'd say it." badge={pb.faqs.length} testId="card-faqs">
                <PairEditor items={pb.faqs} onChange={(v: any) => setPb({ faqs: v })} left="Question" right="Answer" leftKey="question" rightKey="answer"
                  leftPh="Is there hostel facility?" rightPh="Hostel isn't included, but we can share nearby options." addLabel="+ Add a question" />
              </Card>
              <div className="grid grid-cols-2 gap-4">
                <Card title="Facts" hint="Prices, dates, timings — never changed." badge={pb.facts.length || null} testId="card-facts">
                  <ListEditor items={pb.facts} onChange={(v: any) => setPb({ facts: v })} placeholder="Regular batch starts 5 October" addLabel="+ Add a fact" />
                </Card>
                <Card title="Never say" hint="Promises it must not make." badge={pb.doNot.length || null}>
                  <ListEditor items={pb.doNot} onChange={(v: any) => setPb({ doNot: v })} placeholder="Never guarantee a rank or selection" addLabel="+ Add a rule" />
                </Card>
              </div>

              <div className="flex items-center gap-3 text-[12.5px]">
                <span className="text-ink-soft">How closely should it stick to this?</span>
                <select value={strictness} onChange={(e) => setStrictness(parseInt(e.target.value, 10))} className="border border-line rounded-lg px-2 py-1 text-[12.5px] bg-white outline-none">
                  {strictnessLabels.map((t: any) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <span className="text-ink-soft">{strictnessLabels.find((t: any) => t.value === strictness)?.description}</span>
              </div>
            </>
          )}
        </>
      )}

      {tab === "knowledge" && <KnowledgePanel scriptId={scriptId} ensureSaved={ensureSaved} onCount={setKnowledgeCount} />}

      {tab === "links" && (
        <div className="flex flex-col gap-3" data-testid="links">
          <div className="text-[12.5px] text-ink-soft">
            Payment pages, your website, demo booking. On the call the employee says the short spoken form (never letter by letter) and tells the caller your team will send the link on WhatsApp.
            {policy?.mode === "match_caller" ? " It says it in the caller's language." : ""}
          </div>
          {links.map((l: any, i: number) => (
            <div key={i} className="border border-line rounded-xl bg-white p-3 flex flex-col gap-2" data-testid="link-row">
              <div className="flex gap-2">
                <input value={l.label} onChange={(e) => setLink(i, "label", e.target.value)} placeholder="Label, e.g. Seat booking"
                  className="w-[180px] border border-line rounded-lg px-2.5 py-1.5 text-[13px] font-semibold outline-none focus:border-signal" />
                <select value={l.purpose} onChange={(e) => setLink(i, "purpose", e.target.value)} className="border border-line rounded-lg px-2 text-[12.5px] bg-white outline-none">
                  {PURPOSES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </select>
                <button type="button" onClick={() => set({ links: links.filter((_: any, j: number) => j !== i) })} className="ml-auto text-miss text-[12px] font-semibold px-1" aria-label="Remove link">✕</button>
              </div>
              <input value={l.url} onChange={(e) => setLink(i, "url", e.target.value)} placeholder="https://rzp.io/l/your-link"
                className="border border-line rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-signal font-mono" />
              <div className="flex items-center gap-2 text-[12.5px]">
                <span className="text-ink-soft shrink-0">Says it as</span>
                <input value={l.say || ""} onChange={(e) => setLink(i, "say", e.target.value)} placeholder={spokenUrl(l.url)}
                  className="flex-1 border-b border-line py-1 outline-none focus:border-signal bg-transparent" />
              </div>
              {l.purpose === "payment" && <div className="text-[11.5px] text-warm">Shared only when the caller is ready to pay or asks how to pay.</div>}
            </div>
          ))}
          <button type="button" onClick={() => set({ links: [...links, { label: "", url: "", purpose: "website", say: "" }] })} className="text-[12.5px] font-semibold text-signal text-left">+ Add a link</button>
        </div>
      )}

      {tab === "say" && (
        <PronunciationPanel items={pronunciations} onChange={(v: any) => set({ pronunciations: v })} keyterms={keyterms || []} onKeytermsChange={(v: any) => set({ keyterms: v })}
          voiceId={voiceId} language={open} speed={speed} />
      )}
    </div>
  );
}
