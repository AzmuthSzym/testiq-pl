"""Testy approve.py: python3 vocab/test_approve.py"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))
from approve import approve, main  # noqa: E402

ROW = {"pasmo": "2", "część_mowy": "rzeczownik", "słowo": "meritum", "synonim": "sedno",
       "dystraktory": "korporacja, kompozycja, spalanie, kawaler", "ok": "tak"}

items, problems = approve([ROW, dict(ROW, ok=""), dict(ROW, ok="nie")])
assert len(items) == 1 and not problems, (items, problems)
assert items[0]["distractors"] == ["korporacja", "kompozycja", "spalanie", "kawaler"]
_, problems = approve([dict(ROW, dystraktory="a, b, c")])
assert problems and "4 dystraktory" in problems[0]
_, problems = approve([dict(ROW, dystraktory="sedno, b, c, d")])
assert problems and "powtórzone" in problems[0]

with tempfile.TemporaryDirectory() as d:
    src, dest = os.path.join(d, "k.tsv"), os.path.join(d, "out", "items.json")
    with open(src, "w", encoding="utf-8") as f:
        f.write("\t".join(ROW) + "\n" + "\t".join(ROW.values()) + "\n")
    main(src, dest)
    data = json.load(open(dest, encoding="utf-8"))
    assert "plWordNet" in data["notice"] and "CC BY-SA" in data["notice"] and len(data["items"]) == 1
print("approve.py: ok")
