"""Score speech-to-text output against the corrected Telugu answer key.

    python3 score.py answers.json hyp_modelA.jsonl [hyp_modelB.jsonl ...]

answers.json   : corrections exported from the review page (list of {clip, status, text, blind, ...})
hyp_*.jsonl    : one line per clip: {"id": "<clip id>", "text": "<model output>"}; first line may be {"model": "..."}

Reported per model, on clips whose answer is usable (status ok/fixed):
  WER  word error rate        (lower is better)
  CER  character error rate   (fairer for Telugu, where words join together)
  NUM  number recall          share of spoken numbers (prices, counts, dates) the model got right
Each is shown for all clips and for listen-only ("blind") clips separately: blind answers were typed
without seeing the draft, so they are the unbiased check.
"""
import json, re, sys, unicodedata
from collections import Counter

UNCLEAR = "[అస్పష్టం]"

# Strip punctuation but keep the whole Telugu block (U+0C00-0C7F): Python's \w misses Telugu vowel signs,
# which would otherwise split words like "కాలేదు" apart.
_PUNCT = re.compile(r"[^\w\sఀ-౿]")
_ZERO_WIDTH = re.compile(r"[​‌‍﻿]")   # joiners differ between keyboards

def normalize(text: str) -> list[str]:
    t = unicodedata.normalize("NFC", str(text or ""))
    t = t.replace(UNCLEAR, " ")
    t = _ZERO_WIDTH.sub("", t)
    t = _PUNCT.sub(" ", t).lower()
    return t.split()

def edit_distance(a: list, b: list) -> int:
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]

# Number words as they occur in Tenglish calls: Telugu words, English words in Telugu script, digits.
_NUM_WORDS = {
    # Telugu
    "ఒకటి", "ఒక", "రెండు", "మూడు", "నాలుగు", "ఐదు", "అయిదు", "ఆరు", "ఏడు", "ఎనిమిది", "తొమ్మిది", "పది",
    "పదకొండు", "పన్నెండు", "పదమూడు", "పద్నాలుగు", "పదిహేను", "పదహారు", "పదిహేడు", "పద్దెనిమిది", "పంతొమ్మిది",
    "ఇరవై", "ముప్పై", "నలభై", "యాభై", "అరవై", "డెబ్బై", "డెబ్భై", "ఎనభై", "తొంభై",
    "వంద", "వందలు", "వందల", "నూరు", "వెయ్యి", "వేలు", "వేల", "లక్ష", "లక్షలు", "లక్షల", "కోటి", "కోట్లు", "సగం", "అర",
    # English spoken, written in Telugu script
    "వన్", "టూ", "త్రీ", "ఫోర్", "ఫైవ్", "సిక్స్", "సెవెన్", "ఎయిట్", "నైన్", "టెన్", "ట్వెల్వ్", "ట్వంటీ", "థర్టీ",
    "ఫార్టీ", "ఫిఫ్టీ", "సిక్స్టీ", "హండ్రెడ్", "థౌజండ్", "లాక్", "లాక్స్",
}
def numbers(tokens: list[str]) -> Counter:
    return Counter(t for t in tokens if t in _NUM_WORDS or re.fullmatch(r"\d+([.,]\d+)?", t))

def load_answers(path):
    rows = json.load(open(path))
    if isinstance(rows, dict):
        rows = list(rows.values())
    return {r["clip"]: r for r in rows if r.get("status") in ("ok", "fixed") and str(r.get("text", "")).strip()}

def load_hyp(path):
    name, hyp = path, {}
    for line in open(path):
        if not line.strip():
            continue
        r = json.loads(line)
        if "model" in r and "id" not in r:
            name = r["model"]
            continue
        hyp[r["id"]] = r.get("text") or r.get("draft") or ""
    return name, hyp

def score(answers: dict, hyp: dict, only_blind=False) -> dict:
    w_err = w_tot = c_err = c_tot = n_hit = n_tot = clips = 0
    for cid, ans in answers.items():
        if only_blind and not ans.get("blind"):
            continue
        ref, out = normalize(ans["text"]), normalize(hyp.get(cid, ""))
        if not ref:
            continue
        clips += 1
        w_err += edit_distance(ref, out); w_tot += len(ref)
        rc, oc = list("".join(ref)), list("".join(out))
        c_err += edit_distance(rc, oc); c_tot += len(rc)
        rn, on = numbers(ref), numbers(out)
        n_tot += sum(rn.values()); n_hit += sum((rn & on).values())
    pct = lambda a, b: round(100 * a / b, 1) if b else None
    return {"clips": clips, "WER": pct(w_err, w_tot), "CER": pct(c_err, c_tot), "NUM": pct(n_hit, n_tot), "numbers_in_key": n_tot}

def main(argv):
    if len(argv) < 3:
        print(__doc__); return 1
    answers = load_answers(argv[1])
    print(f"Answer key: {len(answers)} usable clips ({sum(1 for a in answers.values() if a.get('blind'))} listen-only)\n")
    print(f"{'model':48} {'clips':>5} {'WER%':>6} {'CER%':>6} {'NUM%':>6} | blind: {'WER%':>6} {'CER%':>6}")
    for path in argv[2:]:
        name, hyp = load_hyp(path)
        a, b = score(answers, hyp), score(answers, hyp, only_blind=True)
        f = lambda v: "  —" if v is None else f"{v:6.1f}"
        print(f"{name[:48]:48} {a['clips']:5} {f(a['WER'])} {f(a['CER'])} {f(a['NUM'])} | blind: {f(b['WER'])} {f(b['CER'])}")
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv))
