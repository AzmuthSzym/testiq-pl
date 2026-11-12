"""Eksport wyników z bazy API (SQLite) do postaci do analizy.

Do analiz bierzemy tylko pierwsze podejście każdego uczestnika do danego
testu (kolejne są zawyżone przez efekt treningu), tak samo jak API.
"""

import csv
import json
import sqlite3
from dataclasses import dataclass

import numpy as np


@dataclass
class TestData:
    test: str
    participants: list          # identyfikatory (losowe UUID z przeglądarki)
    responses: np.ndarray       # osoby × zadania: 1 poprawna, 0 błędna, nan = brak odpowiedzi
    times_ms: np.ndarray        # osoby × zadania: czas reakcji, nan = brak
    choices: list               # osoby × zadania: wybrana opcja / wpisana odpowiedź (albo None)
    birth_year: np.ndarray      # nan = nie podano
    education: list
    sex: list                   # "k" / "m" / "inna" / None
    native_lang: list           # "pl" / "inny" / None
    country: list               # "pl" / "inny" / None
    timed_out: np.ndarray


def _col(row, name):
    """Kolumna, której może nie być w starszej bazie."""
    return row[name] if name in row.keys() else None


def load(db_path: str, test: str, n_items: int) -> TestData:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """SELECT * FROM results WHERE id IN (
               SELECT MIN(id) FROM results WHERE test = ? GROUP BY participant)
           ORDER BY id""",
        (test,),
    ).fetchall()
    conn.close()
    n = len(rows)
    resp = np.full((n, n_items), np.nan)
    times = np.full((n, n_items), np.nan)
    choices = [[None] * n_items for _ in range(n)]
    for i, row in enumerate(rows):
        for r in json.loads(row["responses"]):
            j = r["item"] - 1
            if 0 <= j < n_items:
                resp[i, j] = 1.0 if r["correct"] else 0.0
                times[i, j] = r["ms"]
                choices[i][j] = r.get("choice")
    return TestData(
        test=test,
        participants=[row["participant"] for row in rows],
        responses=resp,
        times_ms=times,
        choices=choices,
        birth_year=np.array([row["birth_year"] if row["birth_year"] is not None else np.nan for row in rows], float),
        education=[row["education"] for row in rows],
        sex=[_col(row, "sex") for row in rows],
        native_lang=[_col(row, "native_lang") for row in rows],
        country=[_col(row, "country") for row in rows],
        timed_out=np.array([bool(row["timed_out"]) for row in rows]),
    )


def export_csv(data: TestData, path: str) -> None:
    """Format długi: jeden wiersz = jedna odpowiedź (bez identyfikatora uczestnika
    w postaci oryginalnej: numer porządkowy wystarcza do analiz)."""
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["osoba", "zadanie", "poprawna", "czas_ms", "wybor", "rok_urodzenia", "wyksztalcenie",
                    "plec", "jezyk_ojczysty", "kraj"])
        for i in range(len(data.participants)):
            for j in range(data.responses.shape[1]):
                if np.isnan(data.responses[i, j]):
                    continue
                by = "" if np.isnan(data.birth_year[i]) else int(data.birth_year[i])
                w.writerow([i + 1, j + 1, int(data.responses[i, j]), int(data.times_ms[i, j]),
                            data.choices[i][j], by, data.education[i] or "",
                            data.sex[i] or "", data.native_lang[i] or "", data.country[i] or ""])
