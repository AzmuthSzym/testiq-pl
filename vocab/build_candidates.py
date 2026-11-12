"""Kandydaci na zadania „Słownictwo” (wybierz synonim) do ręcznego przeglądu.

Źródła (licencje: SOURCES.md):
  - synonimy: plWordNet w wersji Open Multilingual Wordnet 1.4 (omw-pl),
  - częstość słów: wordfreq (dane CC BY-SA 4.0).

Wynik: vocab/kandydaci/kandydaci.tsv — plik NIE trafia do repozytorium
(.gitignore) i nie jest publikowany. Do testu trafiają tylko zadania
zatwierdzone przez człowieka (kolumna `ok` = tak), patrz approve.py.

Zadanie: słowo docelowe (rzadsze) + 5 opcji: jego synonim i 4 dystraktory
tej samej części mowy, o podobnej częstości co synonim (żeby częstość nie
podpowiadała), bez wspólnego znaczenia ze słowem docelowym ani synonimem.
Trudność (pasmo 1–4) zależy od częstości słowa docelowego: im rzadsze, tym trudniejsze.

Uruchomienie (w Dockerze, bez instalowania niczego na serwerze):
  docker run --rm -v "$PWD/vocab:/vocab" python:3.12-slim sh -c \\
    "pip install -q wordfreq==3.1.1 && python /vocab/build_candidates.py && chown -R $(id -u):$(id -g) /vocab"
"""

import csv
import os
import random
import re
import xml.etree.ElementTree as ET
from collections import defaultdict

from wordfreq import zipf_frequency

HERE = os.path.dirname(os.path.abspath(__file__))
OMW = os.path.join(HERE, ".cache", "omw", "omw-pl", "omw-pl.xml")
OUT_DIR = os.path.join(HERE, "kandydaci")

WORD = re.compile(r"^[a-ząćęłńóśźż]{3,}$")
# pasma trudności według częstości słowa docelowego (skala Zipfa)
BANDS = [(1, 3.5, 4.2), (2, 3.0, 3.5), (3, 2.5, 3.0), (4, 1.8, 2.5)]
# Słowa wulgarne i obraźliwe (rdzenie) - nie mogą trafić do testu ani jako
# słowo, ani jako opcja. Lista nie jest pełna: dlatego i tak potrzebny jest przegląd.
BLOCKED_STEMS = ("kurw", "chuj", "huj", "pierd", "jeb", "pizd", "cip", "fiut", "dziwk", "szmat", "suk",
                 "ciot", "pedał", "cwel", "dup", "gówn", "sra", "rucha", "kutas", "debil", "kretyn", "idiot",
                 "murzyn", "żyd", "cygan", "pedofil", "zboczeń")
POS_NAMES = {"n": "rzeczownik", "v": "czasownik", "a": "przymiotnik", "s": "przymiotnik", "r": "przysłówek"}


def load_wordnet(path):
    root = ET.parse(path).getroot()
    lex = root.find("Lexicon")
    synset_words = defaultdict(set)
    word_synsets = defaultdict(set)
    pos_of = {}
    for entry in lex.iter("LexicalEntry"):
        lemma = entry.find("Lemma")
        word = lemma.get("writtenForm")
        pos = lemma.get("partOfSpeech")
        if not WORD.match(word) or blocked(word):
            continue
        pos = "a" if pos == "s" else pos
        for sense in entry.iter("Sense"):
            synset_words[sense.get("synset")].add(word)
            word_synsets[(word, pos)].add(sense.get("synset"))
            pos_of[sense.get("synset")] = pos
    related = defaultdict(set)
    for syn in lex.iter("Synset"):
        for rel in syn.iter("SynsetRelation"):
            related[syn.get("id")].add(rel.get("target"))
            related[rel.get("target")].add(syn.get("id"))
    return synset_words, word_synsets, pos_of, related


def similar_stem(a, b):
    """Słowa z tym samym rdzeniem (piękny / piękność) albo zdrobnienia
    (kózka / koza) nie są dobrą parą: wystarczy podobieństwo zapisu."""
    n = min(len(a), len(b))
    prefix = 0
    while prefix < n and a[prefix] == b[prefix]:
        prefix += 1
    return prefix >= 3 or a in b or b in a


def blocked(word):
    return any(word.startswith(stem) for stem in BLOCKED_STEMS)


def main(seed=2026, per_band=150):
    rnd = random.Random(seed)
    synset_words, word_synsets, pos_of, related = load_wordnet(OMW)
    freq = {}
    for (word, pos) in word_synsets:
        freq[word] = zipf_frequency(word, "pl")

    # pule dystraktorów: część mowy -> lista (zipf, słowo)
    by_pos = defaultdict(list)
    for (word, pos), syns in word_synsets.items():
        if freq[word] >= 2.5:
            by_pos[pos].append((freq[word], word))
    for pos in by_pos:
        by_pos[pos].sort()

    rows = []
    for (target, pos), syns in word_synsets.items():
        zt = freq[target]
        band = next((b for b, lo, hi in BANDS if lo <= zt < hi), None)
        if band is None or len(syns) > 2:  # słowa wieloznaczne pomijamy
            continue
        for syn in syns:
            for synonym in synset_words[syn]:
                if synonym == target or similar_stem(target, synonym):
                    continue
                zs = freq.get(synonym, 0)
                if zs < max(zt + 0.3, 3.0):  # synonim wyraźnie częstszy (łatwiejszy) od słowa docelowego
                    continue
                # wykluczone znaczenia: synsety słowa docelowego i synonimu oraz bezpośrednio powiązane
                banned_syn = set(syns) | word_synsets[(synonym, pos)]
                for s in list(banned_syn):
                    banned_syn |= related[s]
                banned_words = {w for s in banned_syn for w in synset_words[s]}
                pool = [w for z, w in by_pos[pos] if abs(z - zs) <= 0.35 and w not in banned_words
                        and not similar_stem(w, target) and not similar_stem(w, synonym)]
                if len(pool) < 4:
                    continue
                distractors = rnd.sample(pool, 4)
                rows.append({
                    "pasmo": band, "część_mowy": POS_NAMES[pos], "słowo": target, "zipf_słowa": round(zt, 2),
                    "synonim": synonym, "zipf_synonimu": round(zs, 2), "dystraktory": ", ".join(distractors),
                    "synset": syn, "ok": "",
                })
    # po jednym kandydacie na słowo docelowe, ograniczona liczba na pasmo
    rnd.shuffle(rows)
    seen, chosen = set(), defaultdict(list)
    for r in rows:
        if r["słowo"] in seen or len(chosen[r["pasmo"]]) >= per_band:
            continue
        seen.add(r["słowo"])
        chosen[r["pasmo"]].append(r)
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, "kandydaci.tsv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), delimiter="\t")
        w.writeheader()
        for band in sorted(chosen):
            for r in sorted(chosen[band], key=lambda r: r["słowo"]):
                w.writerow(r)
    print(out, {b: len(v) for b, v in sorted(chosen.items())})


if __name__ == "__main__":
    main()
