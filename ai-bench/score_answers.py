"""Porównanie odpowiedzi AI zebranych poza API (np. agent w Claude Code,
który dostał tylko zrzuty i instrukcje, bez kluczy) z kluczem z render.py.

  python3 score_answers.py <odpowiedzi.json> <opis modelu> > wyniki-<nazwa>.md

odpowiedzi.json: {"kostka-v2-01": {"answer": "C", "confidence": "wysoka"}, ...}
"""

import json
import sys
from collections import defaultdict

CHANCE = {"kostka-v2": 1 / 6, "matryce-v1": 1 / 8, "ciagi-v1": 0.0}


def norm(a, kind):
    if a is None:
        return None
    if kind == "choice":
        return str(a).strip().upper()[:1]
    try:
        return int(str(a).replace("−", "-").strip())
    except ValueError:
        return None


def main(path, label):
    with open("out/items.json", encoding="utf-8") as f:
        items = json.load(f)
    with open(path, encoding="utf-8") as f:
        given = json.load(f)
    rows = []
    for it in items:
        g = given.get(it["id"], {})
        ans = norm(g.get("answer"), it["kind"])
        rows.append({**it, "given": ans, "conf": g.get("confidence", "?"), "correct": ans == it["answer"]})

    out = [f"# Jak AI rozwiązuje nasze zadania: {label}", "",
           "Wejście: zrzut ekranu zadania z prawdziwej strony i pełna instrukcja testu, "
           "jedno podejście na zadanie, bez dostępu do kluczy.", "",
           "| Test | Poprawne | Zgadywanie | Pewność „wysoka”: trafność |", "|---|---|---|---|"]
    by_test = defaultdict(list)
    for r in rows:
        by_test[r["test"]].append(r)
    for test, rs in by_test.items():
        ok = sum(r["correct"] for r in rs)
        hi = [r for r in rs if r["conf"] == "wysoka"]
        hi_txt = f"{sum(r['correct'] for r in hi)}/{len(hi)}" if hi else "—"
        out.append(f"| {test} | {ok}/{len(rs)} ({ok / len(rs):.0%}) | {CHANCE[test]:.0%} | {hi_txt} |")
    out += ["", "## Według poziomu trudności", "", "| Test | Poziom | Poprawne |", "|---|---|---|"]
    for test, rs in by_test.items():
        levels = defaultdict(list)
        for r in rs:
            levels[r["level"]].append(r["correct"])
        for lv in sorted(levels):
            v = levels[lv]
            out.append(f"| {test} | {lv} | {sum(v)}/{len(v)} |")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "AI")
