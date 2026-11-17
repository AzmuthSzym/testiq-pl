"""Buduje zdania/items.json (test „Zdania”) z kandydatów.

Kandydaci leżą w vocab/kandydaci/zdania_kandydaci.py (poza repozytorium).
Do testu trafiają tylko zadania wymienione w SELECTED, w kolejności poziomów.
Zmiana listy albo treści zadania = nowa wersja testu (zdania-v2 itd.).

  python3 vocab/zdania_publish.py
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "kandydaci"))
from zdania_kandydaci import ITEMS  # noqa: E402

DEST = os.path.join(HERE, "..", "zdania", "items.json")

# zdania-v1: 6 łatwych, 10 średnich, 9 trudnych (po poprawnej odpowiedzi).
# Pominięte pary, w których jedno zadanie podpowiada drugie
# (np. kwiecisty/lapidarnym, oględny/obcesowo, kunktator/malkontent).
SELECTED = [
    "wyczerpany", "mdła", "upadłość", "wahał", "przejrzysta", "sprzeczne",
    "zawiła", "skrupulatna", "lakoniczna", "prowizoryczną", "bagatelizował",
    "pochopna", "pobłażliwi", "ostentacyjnie", "wymijająco", "uszczypliwe",
    "niefrasobliwie", "kwiecisty", "niewzruszony", "sybarytą", "nepotyzm",
    "kunktatorem", "miałkie", "oględny", "krnąbrne",
]


def main():
    by_answer = {answer: (level, sentence, answer, distractors)
                 for level, sentence, answer, distractors in ITEMS}
    missing = [a for a in SELECTED if a not in by_answer]
    if missing:
        sys.exit(f"Brak w kandydatach: {missing}")
    items = [{"level": lv, "sentence": s, "answer": a, "distractors": d}
             for lv, s, a, d in (by_answer[a] for a in SELECTED)]
    with open(DEST, "w", encoding="utf-8") as f:
        json.dump({"version": 1, "items": items}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    levels = [it["level"] for it in items]
    print(f"{len(items)} zadań: " + ", ".join(f"poziom {lv}: {levels.count(lv)}" for lv in sorted(set(levels))))


if __name__ == "__main__":
    main()
