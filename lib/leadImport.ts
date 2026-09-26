// Smart lead-list import for campaigns: reads CSV / pasted text / Excel (.xlsx), works out which column is what
// (even with headers like "Mobile", "Customer Name", "Program"), and checks every row.
// Nothing is changed silently: every correction is listed as a proposed fix the user approves in the wizard.

export type FieldKey = "name" | "first_name" | "last_name" | "phone" | "alt_phone" | "email" | "course" | "status" | "owner" | "date" | "city" | "extra" | "ignore";

export const FIELD_LABELS: Record<FieldKey, string> = {
  name: "Name", first_name: "First name", last_name: "Last name", phone: "Phone number", alt_phone: "Second phone", email: "Email",
  course: "Course / product", status: "Lead status", owner: "Owner / counsellor", date: "Date", city: "City", extra: "Extra detail", ignore: "Don't use",
};

/* ───────────── reading files ───────────── */

/** Split CSV/TSV/pasted Excel text into rows. Handles quotes, commas inside quotes, tabs and semicolons. */
export function parseText(text: string): string[][] {
  const src = String(text || "").replace(/^﻿/, "");
  const lines = src.split(/\r?\n/);
  // Pick the delimiter that the first non-empty lines use most (tab from Excel paste, else comma/semicolon).
  const sample = lines.filter((l) => l.trim()).slice(0, 20).join("\n");
  const count = (ch: string) => (sample.match(new RegExp(ch === "|" ? "\\|" : ch, "g")) || []).length;
  const delim = count("\t") > 0 ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"' && cur.trim() === "") { q = true; cur = ""; }
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else cur += ch;
  }
  row.push(cur); rows.push(row);
  return rows.map((r) => r.map((c) => c.replace(/ /g, " ")));
}

/** Read the first non-empty sheet of an .xlsx file in the browser, with no library (xlsx = zip of XML). */
export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(buf, (n) => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n) || n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/styles.xml");
  const shared: string[] = [];
  const ss = files["xl/sharedStrings.xml"];
  if (ss) for (const si of ss.match(/<si>[\s\S]*?<\/si>/g) || []) shared.push(xmlText(si));
  const dateStyles = dateStyleIndexes(files["xl/styles.xml"] || "");
  // Sheet order from the workbook; fall back to sheet1, sheet2…
  let order: string[] = [];
  const wb = files["xl/workbook.xml"] || ""; const rels = files["xl/_rels/workbook.xml.rels"] || "";
  for (const m of wb.matchAll(/<sheet\b[^>]*r:id="([^"]+)"/g)) {
    const t = rels.match(new RegExp(`Id="${m[1]}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${m[1]}"`));
    if (t) order.push("xl/" + t[1].replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  if (!order.length) order = Object.keys(files).filter((n) => n.includes("worksheets/")).sort((a, b) => parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, "")));
  for (const name of order) {
    const xml = files[name];
    if (!xml) continue;
    const rows = sheetRows(xml, shared, dateStyles);
    if (rows.some((r) => r.some((c) => c.trim()))) return rows;
  }
  return [];
}

function xmlDecode(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, "&");
}
function xmlText(fragment: string) {
  // Rich text runs: join every <t>…</t>, skip phonetic <rPh> hints.
  const clean = fragment.replace(/<rPh[\s\S]*?<\/rPh>/g, "");
  return xmlDecode((clean.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || []).map((t) => t.replace(/<t\b[^>]*>|<\/t>/g, "")).join(""));
}
function colIndex(ref: string) {
  const letters = (ref.match(/^[A-Z]+/) || ["A"])[0];
  let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function dateStyleIndexes(styles: string): Set<number> {
  const custom = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom.set(Number(m[1]), m[2]);
  const out = new Set<number>();
  const xfs = (styles.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/) || [""])[0];
  let i = 0;
  for (const m of xfs.matchAll(/<xf\b[^>]*?(?:\/>|>)/g)) {
    const id = Number((m[0].match(/numFmtId="(\d+)"/) || [])[1] || 0);
    const code = custom.get(id) || "";
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (/[dmy]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"/g, "")) && !/^[#0.,%]+$/.test(code))) out.add(i);
    i++;
  }
  return out;
}
function excelDate(serial: number) {
  const d = new Date(Math.round((serial - 25569) * 86400000));
  return isNaN(d.getTime()) ? String(serial) : d.toISOString().slice(0, 10);
}
function sheetRows(xml: string, shared: string[], dateStyles: Set<number>): string[][] {
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const rAttr = (rm[1] || rm[3] || "").match(/\br="(\d+)"/);
    const rIdx = rAttr ? Number(rAttr[1]) - 1 : rows.length;
    const cells: string[] = [];
    for (const cm of (rm[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]; const body = cm[2] || "";
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const t = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      const s = Number((attrs.match(/\bs="(\d+)"/) || [])[1] ?? -1);
      const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = "";
      if (t === "s") val = shared[Number(v)] ?? "";
      else if (t === "inlineStr") val = xmlText(body);
      else if (t === "str" || t === "e") val = xmlDecode(v ?? "");
      else if (t === "b") val = v === "1" ? "TRUE" : "FALSE";
      else if (v !== undefined) {
        const n = Number(v);
        if (dateStyles.has(s) && Number.isFinite(n) && n > 20000 && n < 80000) val = excelDate(n);
        // Long numbers (phones) come back as 9848012345 or 9.848012345E9 — write them out in full.
        else val = Number.isFinite(n) && Math.abs(n) >= 1e6 && Number.isInteger(n) ? BigInt(Math.round(n)).toString() : xmlDecode(v);
      }
      const ci = ref ? colIndex(ref) : cells.length;
      while (cells.length < ci) cells.push("");
      cells[ci] = val;
    }
    while (rows.length < rIdx) rows.push([]);
    rows[rIdx] = cells;
  }
  return rows;
}

/** Minimal zip reader (stored + deflate) using the browser's DecompressionStream. */
async function unzip(buf: ArrayBuffer, want: (name: string) => boolean): Promise<Record<string, string>> {
  const dv = new DataView(buf); const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("This doesn't look like an Excel (.xlsx) file.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: Record<string, string> = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true); const extraLen = dv.getUint16(p + 30, true); const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const lNameLen = dv.getUint16(local + 26, true); const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = bytes.subarray(start, start + csize);
    if (method === 0) out[name] = dec.decode(data);
    else if (method === 8) {
      const DS = (globalThis as any).DecompressionStream;
      if (!DS) throw new Error("Your browser can't open Excel files — save the sheet as CSV and upload that.");
      const stream = new Blob([data]).stream().pipeThrough(new DS("deflate-raw"));
      out[name] = await new Response(stream).text();
    }
  }
  return out;
}

/* ───────────── understanding columns ───────────── */

const HEADER_RULES: { field: FieldKey; re: RegExp }[] = [
  { field: "first_name", re: /^(first|given|fore) ?name$|^fname$/ },
  { field: "last_name", re: /^(last|sur|family) ?name$|^surname$|^lname$/ },
  { field: "alt_phone", re: /(alt|alternate|alternative|other|second|2nd|secondary|landline|parent|father|mother|guardian).*(phone|mobile|number|no|contact|cell)|^(phone|mobile|contact) ?(2|no ?2|number ?2)$/ },
  { field: "phone", re: /phone|mobile|mob\b|^mob|cell|contact ?(no|number|num)?$|whats ?app|^ph\b|^ph ?no|^number$|^no$|^tel|telephone|^msisdn$|^contact$/ },
  { field: "email", re: /e-?mail|mail ?id/ },
  { field: "owner", re: /owner|counsell?or|assigned|agent|telecaller|executive|sales ?(person|rep)|^rm$|relationship manager|handled by|caller|employee|advisor/ },
  { field: "status", re: /status|stage|disposition|lead ?type|temperature|hot\/?warm|interest ?level|outcome|remarks? ?status/ },
  { field: "course", re: /course|program|programme|product|batch|plan|package|service|interested in|subject|exam|stream|specialit?y|specialization|branch|degree/ },
  { field: "date", re: /date|created|enquiry ?(on|date)|dob|joined|time|timestamp|follow ?up|day$/ },
  { field: "city", re: /city|town|location|place|district|state|area|region|branch city|centre|center/ },
  { field: "name", re: /name|student|candidate|customer|client|lead|doctor|patient|person|parent|contact ?person|applicant|^dr$/ },
];

function normHeader(h: string) {
  return String(h || "").toLowerCase().replace(/[_\-./#:()]+/g, " ").replace(/\s+/g, " ").trim();
}

const PHONE_CHARS = /^[\d\s+()\-.]{7,22}$/;
export function phoneCandidates(raw: string): string[] {
  // "98480 12345 / 90000 54321" → two numbers. Excel scientific "9.848012345E+09" → digits.
  const s = String(raw || "").trim();
  if (/^\d(\.\d+)?e\+?\d+$/i.test(s)) { const n = Number(s); if (Number.isFinite(n)) return [BigInt(Math.round(n)).toString()]; }
  return s.split(/\s*[\/,;|&]\s*|\s+or\s+|\n/i).map((x) => x.trim()).filter(Boolean);
}

export type PhoneCheck = { e164: string | null; problem?: "too_short" | "too_long" | "not_mobile" | "letters" | "empty" };

/** Normalise an Indian (or international with +) number to +91XXXXXXXXXX. */
export function checkPhone(raw: string): PhoneCheck {
  const s = String(raw || "").trim();
  if (!s) return { e164: null, problem: "empty" };
  if (/[a-z]{2,}/i.test(s.replace(/e\+?\d+$/i, "")) && !/^\+?[\d\s()\-.]+$/.test(s)) return { e164: null, problem: "letters" };
  let d = s.replace(/[^\d+]/g, "");
  if (/^\d(\.\d+)?e\+?\d+$/i.test(s)) d = BigInt(Math.round(Number(s))).toString();
  if (d.startsWith("+")) {
    const rest = d.slice(1).replace(/\+/g, "");
    if (rest.startsWith("91")) return indian(rest.slice(2));
    return /^[1-9]\d{7,14}$/.test(rest) ? { e164: "+" + rest } : { e164: null, problem: rest.length < 8 ? "too_short" : "too_long" };
  }
  d = d.replace(/\+/g, "");
  if (d.startsWith("0091")) return indian(d.slice(4));
  if (d.startsWith("00")) return /^[1-9]\d{7,14}$/.test(d.slice(2)) ? { e164: "+" + d.slice(2) } : { e164: null, problem: "too_long" };
  if (d.length === 12 && d.startsWith("91")) return indian(d.slice(2));
  if (d.length === 11 && d.startsWith("0")) return indian(d.slice(1), true);
  if (d.length === 10) return indian(d);
  return { e164: null, problem: d.length < 10 ? "too_short" : "too_long" };
}
function indian(ten: string, hadZero = false): PhoneCheck {
  if (!/^\d{10}$/.test(ten)) return { e164: null, problem: ten.length < 10 ? "too_short" : "too_long" };
  // Mobiles start 6–9. With a leading 0 it can be a landline (040…, 080…), which is fine to call.
  if (/^[6-9]/.test(ten) || (hadZero && /^[1-9]/.test(ten))) return { e164: "+91" + ten };
  return { e164: null, problem: "not_mobile" };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const DATE_RE = /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}(t.*)?|\d{1,2}[\s\-](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-,]*\d{2,4})$/i;
const STATUS_WORDS = /^(new|hot|warm|cold|follow ?-?up|interested|not interested|callback|call back|converted|joined|enrolled|lost|dnp|open|closed|pending|contacted|qualified|won|junk|fresh|rnr|busy|switched off|paid)$/i;
const NAME_RE = /^(dr\.?\s|mr\.?\s|mrs\.?\s|ms\.?\s)?[\p{L}][\p{L}.'\s-]{1,60}$/u;

function score(col: string[], test: (v: string) => boolean) {
  const vals = col.map((v) => v.trim()).filter(Boolean);
  if (!vals.length) return 0;
  return vals.filter(test).length / vals.length;
}

export type ColumnGuess = { index: number; header: string; field: FieldKey; key: string; why: string; sample: string[] };

export function variableKey(h: string) {
  return normHeader(h).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "detail";
}

/** Find the header row (it's not always row 1 — sheets often have a title above). */
export function findHeaderRow(rows: string[][]): number {
  const wide = rows.slice(0, 30).some((r) => r.filter((c) => String(c ?? "").trim()).length >= 2);
  let best = -1; let bestHits = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i].map(normHeader).filter(Boolean);
    if (!cells.length) continue;
    if (rows[i].some((c) => PHONE_CHARS.test(String(c ?? "").trim()) && checkPhone(c).e164)) break; // data starts here
    if (wide && cells.length < 2) continue; // a title line like "Leads export Sep"
    const hits = cells.filter((h) => h.length <= 40 && HEADER_RULES.some((x) => x.re.test(h))).length;
    if (hits > bestHits && (hits >= 2 || cells.length <= 3 || hits / cells.length >= 0.3)) { best = i; bestHits = hits; }
  }
  return best;
}

export function guessColumns(header: string[], body: string[][]): ColumnGuess[] {
  const width = Math.max(header.length, ...body.slice(0, 500).map((r) => r.length), 0);
  const sample = body.filter((r) => r.some((c) => c.trim())).slice(0, 300);
  const out: ColumnGuess[] = [];
  const taken = new Set<FieldKey>();
  const phoneShare = (i: number) => score(sample.map((r) => r[i] || ""), (v) => phoneCandidates(v).some((p) => !!checkPhone(p).e164));
  for (let i = 0; i < width; i++) {
    const h = header[i] ?? "";
    const nh = normHeader(h);
    const col = sample.map((r) => r[i] || "");
    const filled = col.filter((v) => v.trim()).length;
    let field: FieldKey = "extra"; let why = "";
    const rule = nh ? HEADER_RULES.find((x) => x.re.test(nh)) : undefined;
    const ph = phoneShare(i);
    if (rule) {
      field = rule.field; why = `header “${h.trim()}”`;
      // A header that says phone but holds no numbers (or says name but holds numbers) is corrected by content.
      if ((field === "phone" || field === "alt_phone") && filled && ph < 0.3) { field = "extra"; why = `“${h.trim()}” has no phone numbers in it`; }
      if (field !== "phone" && field !== "alt_phone" && ph >= 0.8) { field = "phone"; why = `“${h.trim()}” is full of phone numbers`; }
    } else if (filled) {
      if (ph >= 0.6) { field = "phone"; why = "the values are phone numbers"; }
      else if (score(col, (v) => EMAIL_RE.test(v.trim())) >= 0.6) { field = "email"; why = "the values are emails"; }
      else if (score(col, (v) => DATE_RE.test(v.trim())) >= 0.6) { field = "date"; why = "the values are dates"; }
      else if (score(col, (v) => STATUS_WORDS.test(v.trim())) >= 0.6) { field = "status"; why = "the values look like lead stages"; }
      else if (score(col, (v) => NAME_RE.test(v.trim()) && v.trim().split(/\s+/).length <= 5) >= 0.7 && new Set(col.map((v) => v.trim().toLowerCase())).size >= Math.min(filled, 5) * 0.8) { field = "name"; why = "the values look like people's names"; }
    }
    if (!filled && !nh) field = "ignore";
    out.push({ index: i, header: h.trim() || `Column ${String.fromCharCode(65 + (i % 26))}`, field, key: variableKey(h || `column_${i + 1}`), why, sample: col.filter((v) => v.trim()).slice(0, 3) });
  }
  // Only one main phone and one name: extra "phone" columns become second phone; the best-filled wins.
  const resolveSingle = (f: FieldKey, fallback: FieldKey, rank: (g: ColumnGuess) => number) => {
    const cands = out.filter((g) => g.field === f);
    if (cands.length <= 1) return;
    const best = cands.slice().sort((a, b) => rank(b) - rank(a))[0];
    for (const g of cands) if (g !== best) { g.field = fallback; g.why = g.why || "another column is the main one"; }
  };
  resolveSingle("phone", "alt_phone", (g) => phoneShare(g.index) + (/mobile|whats/.test(normHeader(g.header)) ? 0.05 : 0));
  resolveSingle("name", "extra", (g) => (/^(full ?)?name$|student|customer|candidate/.test(normHeader(g.header)) ? 2 : 0) + score(sample.map((r) => r[g.index] || ""), (v) => NAME_RE.test(v.trim())));
  for (const f of ["email", "course", "status", "owner", "city", "first_name", "last_name", "alt_phone"] as FieldKey[]) resolveSingle(f, "extra", () => 0);
  // No phone column found by header → take the column with the most phone numbers.
  if (!out.some((g) => g.field === "phone")) {
    const best = out.map((g) => ({ g, s: phoneShare(g.index) })).sort((a, b) => b.s - a.s)[0];
    if (best && best.s > 0.2) { best.g.field = "phone"; best.g.why = "most values are phone numbers"; }
  }
  // No name column → with no header, a text column next to the phone is probably the name.
  if (!out.some((g) => g.field === "name" || g.field === "first_name")) {
    const cand = out.find((g) => g.field === "extra" && score(sample.map((r) => r[g.index] || ""), (v) => NAME_RE.test(v.trim())) >= 0.7);
    if (cand && !header.some((h) => h.trim())) { cand.field = "name"; cand.why = "the values look like people's names"; }
  }
  void taken;
  return out;
}

/* ───────────── checking rows ───────────── */

export type Contact = { row: number; name: string; phone: string; variables: Record<string, string> };
export type Fix = { row: number; field: string; from: string; to: string; kind: FixKind };
export type FixKind = "phone_format" | "spaces" | "name_case" | "second_number" | "name_from_parts";
export type Problem = { row: number; kind: ProblemKind; detail: string };
export type ProblemKind = "invalid_phone" | "missing_phone" | "duplicate" | "missing_name" | "bad_email";

export type ImportResult = {
  headerRow: number; // -1 = no header
  columns: ColumnGuess[];
  totalRows: number; emptyRows: number;
  ready: Contact[];              // rows that can be called (names tidied only when tidyNames is on)
  fixes: Fix[]; problems: Problem[];
  counts: Record<FixKind | ProblemKind, number>;
};

const collapse = (s: string) => String(s ?? "").replace(/[\s ]+/g, " ").trim();
function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\bDr\b(?!\.)/g, "Dr");
}

export function analyse(rows: string[][], override?: Partial<Record<number, FieldKey>>, opts: { tidyNames?: boolean } = {}): ImportResult {
  const tidy = opts.tidyNames !== false;
  const headerRow = findHeaderRow(rows);
  const header = headerRow >= 0 ? rows[headerRow] : [];
  const body = rows.slice(headerRow + 1);
  const columns = guessColumns(header, body);
  if (override) for (const [i, f] of Object.entries(override)) { const g = columns[Number(i)]; if (g && f) { g.field = f; g.why = "chosen by you"; } }
  const col = (f: FieldKey) => columns.find((g) => g.field === f)?.index ?? -1;
  const pi = col("phone"), ai = col("alt_phone"), ni = col("name"), fi = col("first_name"), li = col("last_name"), ei = col("email");
  const varCols = columns.filter((g) => !["phone", "name", "first_name", "last_name", "ignore"].includes(g.field));
  const fixes: Fix[] = []; const problems: Problem[] = [];
  const ready: Contact[] = [];
  const seen = new Map<string, number>();
  let emptyRows = 0; let totalRows = 0;
  body.forEach((r, bi) => {
    const rowNo = headerRow + 2 + bi; // 1-based sheet row number the user sees in Excel
    if (!r.some((c) => String(c ?? "").trim())) { emptyRows++; return; }
    totalRows++;
    const fix = (field: string, from: string, to: string, kind: FixKind) => { if (from !== to) fixes.push({ row: rowNo, field, from, to, kind }); };
    // Name
    let rawName = ni >= 0 ? String(r[ni] ?? "") : "";
    if (ni < 0 && (fi >= 0 || li >= 0)) {
      const joined = collapse([fi >= 0 ? r[fi] : "", li >= 0 ? r[li] : ""].filter(Boolean).join(" "));
      if (joined) fix("name", [fi >= 0 ? r[fi] : "", li >= 0 ? r[li] : ""].filter(Boolean).join(" + "), joined, "name_from_parts");
      rawName = joined;
    }
    let name = collapse(rawName);
    if (name !== rawName && ni >= 0) fix("name", rawName, name, "spaces");
    if (name && name.length > 3 && ((name === name.toUpperCase() && /\p{Lu}/u.test(name)) || (name === name.toLowerCase() && /\p{Ll}/u.test(name)))) { const t = titleCase(name); fix("name", name, t, "name_case"); if (tidy) name = t; }
    if (!tidy && ni >= 0) name = String(rawName).trim();
    // Phone
    const rawPhone = pi >= 0 ? String(r[pi] ?? "") : "";
    const cands = phoneCandidates(rawPhone);
    const checks = cands.map((c) => ({ raw: c, ...checkPhone(c) }));
    const good = checks.filter((c) => c.e164);
    let phone = "";
    const variables: Record<string, string> = {};
    if (!rawPhone.trim()) problems.push({ row: rowNo, kind: "missing_phone", detail: "No phone number" });
    else if (!good.length) {
      const p = checks[0]?.problem;
      problems.push({ row: rowNo, kind: "invalid_phone", detail: `“${collapse(rawPhone)}” — ${p === "too_short" ? "too few digits" : p === "too_long" ? "too many digits" : p === "not_mobile" ? "not a valid Indian mobile" : "not a phone number"}` });
    } else {
      phone = good[0].e164!;
      if (collapse(rawPhone) !== phone) fix("phone", collapse(rawPhone), phone, "phone_format");
      if (good.length > 1) { variables.second_phone = good[1].e164!; fix("second phone", collapse(rawPhone), good[1].e164!, "second_number"); }
    }
    // Other details → variables for the conversation.
    for (const g of varCols) {
      const raw = String(r[g.index] ?? "");
      let v = collapse(raw);
      if (!v) continue;
      if (g.field === "alt_phone") {
        const c = checkPhone(phoneCandidates(raw)[0] || "");
        if (c.e164) { if (c.e164 !== v) fix(g.header, v, c.e164, "phone_format"); v = c.e164; }
      }
      if (g.field === "email" && !EMAIL_RE.test(v)) problems.push({ row: rowNo, kind: "bad_email", detail: `Email “${v}” looks wrong (kept as is)` });
      const key = g.field === "extra" ? g.key : g.field;
      variables[key] = v;
    }
    if (!phone) return;
    if (!name) problems.push({ row: rowNo, kind: "missing_name", detail: "No name — they'll be called without a name" });
    const firstRow = seen.get(phone);
    if (firstRow !== undefined) { problems.push({ row: rowNo, kind: "duplicate", detail: `${phone} is already on row ${firstRow}` }); return; }
    seen.set(phone, rowNo);
    const contact = { row: rowNo, name, phone, variables };
    ready.push(contact);
  });
  void ei; void ai;
  const counts = { phone_format: 0, spaces: 0, name_case: 0, second_number: 0, name_from_parts: 0, invalid_phone: 0, missing_phone: 0, duplicate: 0, missing_name: 0, bad_email: 0 } as Record<FixKind | ProblemKind, number>;
  for (const f of fixes) counts[f.kind]++;
  for (const p of problems) counts[p.kind]++;
  return { headerRow, columns, totalRows, emptyRows, ready, fixes, problems, counts };
}
