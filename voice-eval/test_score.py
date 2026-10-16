import json, tempfile, os
from score import normalize, edit_distance, numbers, score

def test_normalize_keeps_telugu_words_whole():
    assert normalize("అర్ధం కాలేదు!") == ["అర్ధం", "కాలేదు"]
    assert normalize("ఓకే‌ సర్, [అస్పష్టం] ప్లాన్.") == ["ఓకే", "సర్", "ప్లాన్"]

def test_edit_distance():
    assert edit_distance(list("abc"), list("abc")) == 0
    assert edit_distance(["a","b","c"], ["a","x","c","d"]) == 2

def test_numbers_counts_telugu_english_and_digits():
    n = numbers(normalize("రెండు వేల ఐదు వందలు, ప్లస్ టూ మంత్స్, 2500"))
    assert n == {"రెండు":1, "వేల":1, "ఐదు":1, "వందలు":1, "టూ":1, "2500":1}

def test_score_perfect_and_blind_split():
    ans = {"c1": {"clip":"c1","status":"fixed","text":"రెండు వేల రూపాయలు","blind":True},
           "c2": {"clip":"c2","status":"ok","text":"ఓకే సర్","blind":False}}
    s = score(ans, {"c1":"రెండు వేల రూపాయలు","c2":"ఓకే సర్"})
    assert s["WER"] == 0.0 and s["CER"] == 0.0 and s["NUM"] == 100.0 and s["clips"] == 2
    s = score(ans, {"c1":"మూడు వేల రూపాయలు","c2":""})
    assert s["NUM"] == 50.0          # got "వేల", missed "రెండు"
    assert s["WER"] == round(100*3/5,1)   # 1 sub + 2 deletions over 5 words
    b = score(ans, {"c1":"రెండు వేల రూపాయలు"}, only_blind=True)
    assert b["clips"] == 1 and b["WER"] == 0.0
