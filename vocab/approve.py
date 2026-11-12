"""Przegląd kandydatów -> zadania testu „Słownictwo”.

1. Otwórz vocab/kandydaci/kandydaci.tsv (np. w arkuszu kalkulacyjnym).
2. W kolumnie `ok` wpisz „tak” przy dobrych zadaniach. Możesz poprawić
   synonim i dystraktory (oddzielone przecinkami). Odrzucaj zadania, w których:
   - synonim nie jest synonimem w typowym znaczeniu słowa (mapowanie
     plWordNet -> WordNet bywa nieprecyzyjne), albo znaczenia są nacechowane
     (potoczne, obraźliwe, polityczne: np. „bolszewik -> komuch”);
   - para to wariant pisowni, zapożyczenie albo zdrobnienie („avocado -> awokado”);
   - któryś dystraktor też pasuje jako synonim albo jest inną częścią mowy;
   - słowo jest regionalne, przestarzałe albo specjalistyczne (chyba że to
     zamierzona trudność w paśmie 4).
3. Uruchom: python3 vocab/approve.py
   Wynik: slownictwo/items.json (tylko zatwierdzone zadania). Ten plik jest
   publiczny po scaleniu do main, więc zatwierdzaj tylko to, co ma się ukazać.
"""

import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "kandydaci", "kandydaci.tsv")
DEST = os.path.join(HERE, "..", "slownictwo", "items.json")

NOTICE = ("Słowa i synonimy wybrane z plWordNet (Open Multilingual Wordnet 1.4, omw-pl). "
          "plWordNet 2.3 © 2015 by Wrocław University of Technology. All rights reserved. "
          "Pasma trudności według częstości słów z wordfreq (Robyn Speer, dane CC BY-SA 4.0, "
          "https://github.com/rspeer/wordfreq). Licencje i zastrzeżenia: SOURCES.md.")


def approve(rows):
    items, problems = [], []
    for n, r in enumerate(rows, start=2):
        if r.get("ok", "").strip().lower() not in ("tak", "t", "yes", "y"):
            continue
        distractors = [d.strip() for d in r["dystraktory"].split(",") if d.strip()]
        word, synonym = r["słowo"].strip(), r["synonim"].strip()
        options = [synonym] + distractors
        if len(distractors) != 4:
            problems.append(f"wiersz {n}: potrzebne 4 dystraktory, jest {len(distractors)}")
        elif len(set(options)) != 5 or word in options:
            problems.append(f"wiersz {n}: powtórzone słowa")
        elif r["pasmo"] not in ("1", "2", "3", "4"):
            problems.append(f"wiersz {n}: pasmo {r['pasmo']}")
        else:
            items.append({"band": int(r["pasmo"]), "pos": r["część_mowy"], "word": word,
                          "synonym": synonym, "distractors": distractors})
    return items, problems


def main(src=SRC, dest=DEST):
    with open(src, encoding="utf-8") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    items, problems = approve(rows)
    for p in problems:
        print("POMINIĘTO:", p, file=sys.stderr)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump({"notice": NOTICE, "items": items}, f, ensure_ascii=False, indent=1)
    counts = {b: sum(1 for i in items if i["band"] == b) for b in (1, 2, 3, 4)}
    print(f"{dest}: {len(items)} zadań, według pasm: {counts}")
    return items


if __name__ == "__main__":
    main()
