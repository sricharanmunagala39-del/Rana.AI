// Reads uploaded documents in the browser so only their text is sent to the server (a 40-page PDF
// brochure becomes ~60 KB of text instead of a 10 MB upload that Vercel would reject).
// PDF → pdf.js, DOCX → JSZip + the document.xml text, TXT/MD/CSV → as is. Libraries load from
// cdnjs only when someone actually uploads a file of that type.

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

export const ACCEPT = ".pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv";
export const MAX_FILE_MB = 25;

const loaded: Record<string, Promise<void>> = {};
function loadScript(src: string): Promise<void> {
  if (!loaded[src]) {
    loaded[src] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { delete loaded[src]; reject(new Error("Couldn't load the document reader. Check your internet and try again.")); };
      document.head.appendChild(s);
    });
  }
  return loaded[src];
}

async function pdfText(buf: ArrayBuffer): Promise<string> {
  await loadScript(PDFJS);
  const lib = (window as any).pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await lib.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 200); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let line = "", out = "", lastY: number | null = null;
    for (const it of tc.items as any[]) {
      const y = it.transform?.[5];
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) { out += line.trim() + "\n"; line = ""; }
      line += it.str + (it.hasEOL ? "\n" : " ");
      lastY = y ?? lastY;
    }
    out += line.trim();
    pages.push(out.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim());
  }
  return pages.join("\n\n");
}

async function docxText(buf: ArrayBuffer): Promise<string> {
  await loadScript(JSZIP);
  const zip = await (window as any).JSZip.loadAsync(buf);
  const xml: string = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("That Word file looks empty or damaged.");
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractText(file: File): Promise<string> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`${file.name} is over ${MAX_FILE_MB} MB.`);
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const t = await pdfText(await file.arrayBuffer());
    if (t.replace(/\s/g, "").length < 20) throw new Error(`${file.name} has no selectable text (it may be a scanned image). Paste the important parts as text instead.`);
    return t;
  }
  if (name.endsWith(".docx")) return docxText(await file.arrayBuffer());
  if (name.endsWith(".doc")) throw new Error("Old .doc files can't be read — save it as .docx or PDF.");
  if (/\.(txt|md|csv)$/.test(name) || file.type.startsWith("text/")) return (await file.text()).trim();
  throw new Error(`${file.name}: use PDF, Word (.docx) or a text file.`);
}
