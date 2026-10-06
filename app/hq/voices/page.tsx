"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import R1VoiceBrowser, { type R1Row } from "@/components/R1VoiceBrowser";

type Voice = { voiceId: string; ownerId?: string; name: string; preview: string | null; gender?: string; accent?: string; language?: string; description?: string; category?: string; uses?: number };

const LANGS: [string, string, string?][] = [["hi", "Hindi"], ["en", "Indian English", "indian"], ["te", "Telugu"], ["ta", "Tamil"], ["kn", "Kannada"], ["ml", "Malayalam"], ["en", "Global English"]];
const PICKS = ["Anika", "Tripti", "Raju", "Monika Sogam", "P K Anil", "Kanika", "Muthu", "Veda Sky"];

/** RANA HQ → Voice engines: choose R1 (Sarvam) or R3 (ElevenLabs natural voices) for the website, and pick voices. */
export default function HqVoicesPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [engine, setEngine] = useState<"sarvam" | "elevenlabs">("sarvam");
  const [voiceId, setVoiceId] = useState("");
  const [maleId, setMaleId] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [lang, setLang] = useState(0);
  const [gender, setGender] = useState("");
  const [search, setSearch] = useState("");
  const [lib, setLib] = useState<Voice[] | null>(null);
  const [libBusy, setLibBusy] = useState(false);
  const [adding, setAdding] = useState("");
  const [playing, setPlaying] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const [r1, setR1] = useState<R1Row[] | null>(null);
  const [r1Edit, setR1Edit] = useState<Record<string, string>>({});
  const [r1Busy, setR1Busy] = useState("");
  const loadR1 = () => fetch("/api/hq/voices/r1").then((r) => r.json()).then((j) => setR1(j.voices || [])).catch(() => setR1([]));
  useEffect(() => { loadR1(); }, []);
  async function connectR1(v: R1Row, agent: string) {
    setR1Busy(v.id); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/hq/voices/r1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: v.id, agent }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setMsg(j.live ? `${v.name} is live on calls.` : `${v.name} disconnected.`);
      setR1((list) => (list || []).map((x) => x.id === v.id ? { ...x, agent: j.agent, live: j.live } : x));
    } catch (e: any) { setErr(e.message); } finally { setR1Busy(""); }
  }

  const load = () => fetch("/api/hq/voices").then(async (r) => {
    const j = await r.json(); if (!r.ok) throw new Error(j.error);
    setData(j); setEngine(j.web?.engine || "sarvam"); setVoiceId(j.web?.voiceId || ""); setMaleId(j.web?.maleVoiceId || ""); setModel(j.web?.model || j.eleven?.models?.[0]?.id || "");
  }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  function play(v: Voice) {
    if (!v.preview) return;
    if (playing === v.voiceId) { audio.current?.pause(); setPlaying(""); return; }
    audio.current?.pause();
    const a = new Audio(v.preview); audio.current = a; setPlaying(v.voiceId);
    a.onended = () => setPlaying(""); a.play().catch(() => setPlaying(""));
  }

  async function findVoices(over?: { search?: string }) {
    setLibBusy(true); setErr("");
    const [code, , accent] = LANGS[lang];
    const q = new URLSearchParams();
    const s = over?.search ?? search;
    if (!s) { q.set("language", code); if (accent) q.set("accent", accent); q.set("useCase", "conversational"); }
    if (gender) q.set("gender", gender);
    if (s) q.set("search", s);
    try {
      const r = await fetch(`/api/hq/voices/library?${q}`); const j = await r.json();
      if (!r.ok) throw new Error(j.error); setLib(j.voices);
    } catch (e: any) { setErr(e.message); } finally { setLibBusy(false); }
  }

  async function add(v: Voice) {
    setAdding(v.voiceId); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/hq/voices/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId: v.ownerId, voiceId: v.voiceId, name: v.name.split(/ [-–] /)[0] }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setMsg(`${v.name.split(/ [-–] /)[0]} added to RANA's voices.`); await load();
    } catch (e: any) { setErr(e.message); } finally { setAdding(""); }
  }

  async function save() {
    setSaving(true); setErr(""); setMsg("");
    const v = (data?.eleven?.voices || []).find((x: Voice) => x.voiceId === voiceId);
    const mv = (data?.eleven?.voices || []).find((x: Voice) => x.voiceId === maleId);
    try {
      const r = await fetch("/api/hq/voices", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engine, voiceId, voiceName: v?.name, maleVoiceId: maleId, maleVoiceName: mv?.name || "", model }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setMsg(engine === "elevenlabs" ? `Website now speaks with ${v?.name || "the chosen voice"} (R3). Try it on ranaai.in.` : "Website is back on R1."); await load();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  }

  const el = data?.eleven;
  const mine: Voice[] = el?.voices || [];
  const card = "border border-line rounded-xl bg-raised p-5";

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="hq" />
      <div className="flex-1 p-6 md:p-10 min-w-0">
        <div className="w-full max-w-[1300px] flex flex-col gap-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-signal"><Link href="/hq">RANA HQ</Link> · Voice engines</div>
            <div className="text-[22px] font-display font-semibold">Which voice speaks for RANA</div>
            <div className="text-[13px] text-ink-soft mt-0.5">R1 = Sarvam (Indian languages, phone numbers). R3 = ElevenLabs (the most natural, human-sounding voices). Customers only ever see “R1” / “R3”.</div>
          </div>
          {err && <div className="text-[13px] text-miss" role="alert">{err}</div>}
          {msg && <div className="text-[13px] text-signal" role="status">{msg}</div>}
          {!data && !err && <div className="text-[13px] text-ink-soft">Loading…</div>}

          {data && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className={card} data-testid="engine-sarvam">
                <div className="flex items-center justify-between"><div className="font-semibold">R1 · Sarvam</div><span className={`text-[11px] font-mono rounded-full px-2 py-0.5 border ${data.sarvam.ready ? "text-signal border-signal/50" : "text-miss border-miss/50"}`}>{data.sarvam.ready ? "CONNECTED" : "NOT SET"}</span></div>
                <p className="text-[13px] text-ink-soft mt-2">All 11 Indian languages, switches language mid-call, runs your Indian phone numbers and campaigns.</p>
              </div>
              <div className={card} data-testid="engine-eleven">
                <div className="flex items-center justify-between"><div className="font-semibold">R3 · ElevenLabs</div><span className={`text-[11px] font-mono rounded-full px-2 py-0.5 border ${el?.ready && !el?.error ? "text-signal border-signal/50" : "text-hot border-hot/50"}`}>{!el?.ready ? "ADD KEY" : el?.error ? "CHECK" : "CONNECTED"}</span></div>
                {!el?.ready ? (
                  <ol className="text-[13px] text-ink-soft mt-2 list-decimal pl-4 flex flex-col gap-1">
                    <li>ElevenLabs → Developers → API keys → Create key (give it Agents, Voices and Text-to-speech access).</li>
                    <li>Vercel → rana-ai → Settings → Environment Variables → add <b className="text-ink">ELEVENLABS_API_KEY</b> (Production).</li>
                    <li>Redeploy, then come back here.</li>
                  </ol>
                ) : (
                  <div className="text-[13px] text-ink-soft mt-2">
                    {el.account && <>Plan: <b className="text-ink capitalize">{el.account.tier}</b> · credits used {el.account.used.toLocaleString("en-IN")} / {el.account.limit.toLocaleString("en-IN")}. </>}
                    {el.account?.tier === "free" && <span className="text-hot">The free plan can&apos;t use library voices on calls and has ~15 agent minutes — upgrade before going live.</span>}
                    {el.error && <div className="text-miss mt-1">{el.error}</div>}
                  </div>
                )}
              </div>
            </div>
          )}

          {data && (
            <div className={card} data-testid="web-voice">
              <div className="font-semibold">Website live voice</div>
              <div className="text-[13px] text-ink-soft mt-0.5">Used by Talk to Rana, the instant demos and every industry live demo on ranaai.in. If R3 ever fails, the call automatically uses R1.</div>
              <div className="flex flex-wrap gap-2 mt-4">
                {([["sarvam", "R1 · Sarvam"], ["elevenlabs", "R3 · ElevenLabs (natural)"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setEngine(k)} aria-pressed={engine === k} disabled={k === "elevenlabs" && !el?.ready}
                    className={`rounded-full border px-4 py-1.5 text-[13px] disabled:opacity-40 ${engine === k ? "bg-ink text-paper border-ink font-semibold" : "border-line text-ink-soft hover:text-ink"}`} data-testid={`web-engine-${k}`}>{l}</button>
                ))}
              </div>
              {engine === "elevenlabs" && (
                <div className="grid md:grid-cols-2 gap-3 mt-4 text-[13px]">
                  <label className="flex flex-col gap-1">Default voice (female)
                    <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className="rounded-lg border border-line bg-paper px-3 py-2" data-testid="web-voice-select">
                      <option value="">— pick one of RANA&apos;s voices —</option>
                      {mine.map((v) => <option key={v.voiceId} value={v.voiceId}>{v.name}{v.accent ? ` · ${v.accent}` : ""}{v.gender ? ` · ${v.gender}` : ""}</option>)}
                    </select>
                    <span className="text-[11.5px] text-ink-soft">Not here? Find one below and press “Add to RANA”.</span>
                  </label>
                  <label className="flex flex-col gap-1">Male voice (when a visitor picks &ldquo;Male voice&rdquo;)
                    <select value={maleId} onChange={(e) => setMaleId(e.target.value)} className="rounded-lg border border-line bg-paper px-3 py-2" data-testid="web-male-voice-select">
                      <option value="">Automatic: a male voice from RANA&apos;s account</option>
                      {mine.map((v) => <option key={v.voiceId} value={v.voiceId}>{v.name}{v.accent ? ` · ${v.accent}` : ""}{v.gender ? ` · ${v.gender}` : ""}</option>)}
                    </select>
                    <span className="text-[11.5px] text-ink-soft">For Indian languages R1&apos;s male voice (Aditya) is used if R3 has none.</span>
                  </label>
                  <label className="flex flex-col gap-1">Voice model
                    <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-lg border border-line bg-paper px-3 py-2">
                      {(el?.models || []).map((m: any) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </label>
                </div>
              )}
              <div className="flex items-center gap-3 mt-4">
                <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-signal text-on-accent px-4 py-2 text-[13px] font-semibold disabled:opacity-50" data-testid="web-voice-save">{saving ? "Saving…" : "Save"}</button>
                <span className="text-[12px] text-ink-soft">Now: <b className="text-ink">{data.web.engine === "elevenlabs" ? `R3 · ${data.web.voiceName || "voice"}` : "R1 · Sarvam"}</b></span>
              </div>
            </div>
          )}

          {el?.ready && (
            <div className={card} data-testid="voice-library">
              <div className="font-semibold">Find natural voices</div>
              <div className="text-[13px] text-ink-soft mt-0.5">ElevenLabs&apos; public library. Play a sample, then “Add to RANA” to use it on calls.</div>
              <div className="flex flex-wrap gap-1.5 mt-4">
                {LANGS.map(([, l], i) => <button key={l} type="button" onClick={() => setLang(i)} className={`rounded-full border px-3 py-1 text-[12.5px] ${lang === i ? "bg-ink text-paper border-ink font-semibold" : "border-line text-ink-soft"}`}>{l}</button>)}
                <span className="w-3" />
                {([["", "Any"], ["female", "Female"], ["male", "Male"]] as const).map(([g, l]) => <button key={l} type="button" onClick={() => setGender(g)} className={`rounded-full border px-3 py-1 text-[12.5px] ${gender === g ? "bg-ink text-paper border-ink font-semibold" : "border-line text-ink-soft"}`}>{l}</button>)}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") findVoices(); }} placeholder="Search by name or style (e.g. warm, sales)" className="flex-1 min-w-[220px] rounded-lg border border-line bg-paper px-3 py-2 text-[13px]" />
                <button type="button" onClick={() => findVoices()} disabled={libBusy} className="rounded-lg bg-ink text-paper px-4 py-2 text-[13px] font-semibold disabled:opacity-50" data-testid="voice-find">{libBusy ? "Searching…" : "Find voices"}</button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-3 text-[12px]">
                <span className="text-ink-soft mr-1">Our shortlist:</span>
                {PICKS.map((p) => <button key={p} type="button" onClick={() => { setSearch(p); findVoices({ search: p }); }} className="rounded-full border border-signal/40 text-signal px-2.5 py-0.5 hover:bg-signal/10">{p}</button>)}
              </div>
              {lib && (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4" data-testid="voice-results">
                  {lib.length === 0 && <div className="text-[13px] text-ink-soft">No voices found. Try another language or search.</div>}
                  {lib.map((v) => {
                    const have = mine.some((m) => m.voiceId === v.voiceId || m.name === v.name.split(/ [-–] /)[0]);
                    return (
                      <div key={v.voiceId} className="border border-line rounded-xl p-3.5 flex flex-col gap-2 bg-paper">
                        <div className="flex items-start gap-3">
                          <button type="button" onClick={() => play(v)} disabled={!v.preview} className="shrink-0 w-9 h-9 rounded-full bg-signal text-on-accent grid place-items-center text-[13px] disabled:opacity-40" aria-label={`Play ${v.name}`}>{playing === v.voiceId ? "❚❚" : "▶"}</button>
                          <div className="min-w-0">
                            <div className="text-[13.5px] font-semibold leading-snug">{v.name}</div>
                            <div className="text-[11.5px] text-ink-soft">{[v.gender, v.accent, v.language].filter(Boolean).join(" · ")}{v.uses ? ` · used ${v.uses.toLocaleString("en-IN")}×` : ""}</div>
                          </div>
                        </div>
                        {v.description && <p className="text-[12px] text-ink-soft leading-snug line-clamp-3">{v.description}</p>}
                        <button type="button" onClick={() => add(v)} disabled={have || adding === v.voiceId} className="self-start rounded-lg border border-line px-3 py-1 text-[12.5px] font-semibold hover:border-signal disabled:opacity-50">{have ? "In RANA ✓" : adding === v.voiceId ? "Adding…" : "Add to RANA"}</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className={card} data-testid="r1-library">
            <div className="font-semibold">R1 voice library — all {r1?.length || 200} voices (v3 + v4)</div>
            <div className="text-[13px] text-ink-soft mt-0.5">Every voice is in RANA&apos;s employee builder. Sarvam can&apos;t change the voice per call, so a voice is <b className="text-ink">READY</b> once it has its own agent. To switch one on:</div>
            <ol className="text-[12.5px] text-ink-soft mt-2 list-decimal pl-4 flex flex-col gap-0.5">
              <li>In Sarvam, make a copy of <b className="text-ink">RANA Runtime - Rahul</b> (Duplicate, or a new agent with the same instructions and the <code>rana_instructions</code> variable).</li>
              <li>In the copy: Settings → Voice → pick the voice → Save → Commit as v1. Rename it “RANA Runtime - &lt;voice&gt;”.</li>
              <li>Copy the ID from the address bar (…/update-agent/<b className="text-ink">RANA-Runtim-xxxxxxxx-xxxx</b>), paste it below and press Connect.</li>
            </ol>
            <div className="text-[12px] text-ink-soft mt-2">Until a voice is connected, calls with it use Priya (female) or Aditya (male). Voices customers already picked are listed first.</div>
            <div className="mt-4">
              {!r1 ? <div className="text-[13px] text-ink-soft">Loading…</div> : (
                <R1VoiceBrowser voices={r1} sortWanted extra={(v) => v.builtin ? (
                  <div className="text-[11.5px] text-ink-soft">Built-in · {v.agent}</div>
                ) : (
                  <div className="flex gap-1.5">
                    <input value={r1Edit[v.id] ?? v.agent ?? ""} onChange={(e) => setR1Edit((m) => ({ ...m, [v.id]: e.target.value }))} placeholder="RANA-Runtim-xxxxxxxx-xxxx" className="flex-1 min-w-0 rounded-lg border border-line bg-raised px-2 py-1 text-[12px] font-mono" aria-label={`Agent for ${v.name}`} />
                    <button type="button" disabled={r1Busy === v.id} onClick={() => connectR1(v, r1Edit[v.id] ?? v.agent ?? "")} className="rounded-lg bg-ink text-paper px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50">{r1Busy === v.id ? "…" : v.live && (r1Edit[v.id] ?? v.agent) === v.agent ? "Saved" : "Connect"}</button>
                    {v.agent && <button type="button" disabled={r1Busy === v.id} onClick={() => { setR1Edit((m) => ({ ...m, [v.id]: "" })); connectR1(v, ""); }} className="rounded-lg border border-line px-2 py-1 text-[12px]" aria-label="Disconnect">✕</button>}
                  </div>
                )} />
              )}
            </div>
          </div>

          {el?.ready && mine.length > 0 && (
            <div className={card}>
              <div className="font-semibold">RANA&apos;s ElevenLabs voices ({mine.length})</div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2 mt-3">
                {mine.map((v) => (
                  <div key={v.voiceId} className="flex items-center gap-3 border border-line rounded-lg p-2.5 bg-paper">
                    <button type="button" onClick={() => play(v)} disabled={!v.preview} className="shrink-0 w-8 h-8 rounded-full border border-signal text-signal grid place-items-center text-[12px] disabled:opacity-40">{playing === v.voiceId ? "❚❚" : "▶"}</button>
                    <div className="min-w-0"><div className="text-[13px] font-semibold truncate">{v.name}</div><div className="text-[11px] text-ink-soft truncate">{[v.gender, v.accent, v.category].filter(Boolean).join(" · ")}</div></div>
                    <button type="button" onClick={() => { setEngine("elevenlabs"); setVoiceId(v.voiceId); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="ml-auto text-[12px] text-signal font-semibold whitespace-nowrap">Use on website</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
