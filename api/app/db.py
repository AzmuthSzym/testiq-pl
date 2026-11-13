"""SQLite: jedna tabela wyników. Bez adresów IP i bez danych kontaktowych."""

import json
import sqlite3
import threading
from datetime import datetime, timezone

from .scoring import counted

SCHEMA = """
CREATE TABLE IF NOT EXISTS results (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    test          TEXT    NOT NULL,
    participant   TEXT    NOT NULL,
    started_at    TEXT    NOT NULL,
    received_on   TEXT    NOT NULL,          -- tylko data (UTC), bez godziny
    duration_ms   INTEGER NOT NULL,
    timed_out     INTEGER NOT NULL,
    birth_year    INTEGER,
    education     TEXT,
    sex           TEXT,
    native_lang   TEXT,
    country       TEXT,
    assist        TEXT,
    score         INTEGER NOT NULL,
    n_responses   INTEGER NOT NULL,
    responses     TEXT    NOT NULL,          -- JSON
    UNIQUE (test, participant, started_at)
);
CREATE INDEX IF NOT EXISTS results_test ON results (test, participant, id);
"""


class Database:
    def __init__(self, path: str):
        self.path = path
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        if path != ":memory:":
            self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.executescript(SCHEMA)
        # Baza sprzed dodania płci, języka i kraju: dopisz brakujące kolumny.
        cols = {r[1] for r in self._conn.execute("PRAGMA table_info(results)")}
        for col in ("sex", "native_lang", "country", "assist"):
            if col not in cols:
                self._conn.execute(f"ALTER TABLE results ADD COLUMN {col} TEXT")
        self._conn.commit()

    def insert_result(self, r, score: int) -> bool:
        """Zapisuje wynik. False, jeśli to duplikat (ten sam uczestnik i start)."""
        row = (
            r.test,
            r.participant,
            r.startedAt.astimezone(timezone.utc).isoformat(timespec="seconds"),
            datetime.now(timezone.utc).date().isoformat(),
            r.durationMs,
            int(r.timedOut),
            r.meta.birthYear,
            r.meta.education,
            r.meta.sex,
            r.meta.nativeLang,
            r.meta.country,
            r.meta.assist,
            score,
            len(r.responses),
            json.dumps([x.model_dump(exclude_none=True) for x in r.responses], separators=(",", ":")),
        )
        with self._lock:
            cur = self._conn.execute(
                """INSERT OR IGNORE INTO results (test, participant, started_at, received_on,
                   duration_ms, timed_out, birth_year, education, sex, native_lang, country,
                   assist, score, n_responses, responses)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                row,
            )
            self._conn.commit()
            return cur.rowcount == 1

    def first_attempts(self, test: str, native_only: bool = False) -> list[dict]:
        """Pierwsze podejście każdego uczestnika (kolejne podejścia są zawyżone
        przez efekt treningu, więc nie trafiają do norm): wynik, wiek w chwili
        zgłoszenia (jeśli podano rok urodzenia) i odpowiedzi 0/1 na zadania.

        native_only: pomija osoby, które podały inny język ojczysty niż polski
        (dla testów językowych; brak odpowiedzi traktujemy jak polski)."""
        lang = "AND (native_lang IS NULL OR native_lang = 'pl')" if native_only else ""
        with self._lock:
            rows = self._conn.execute(
                f"""SELECT score, birth_year, received_on, assist, responses FROM results WHERE id IN (
                       SELECT MIN(id) FROM results WHERE test = ? GROUP BY participant) {lang}""",
                (test,),
            ).fetchall()
        out = []
        for row in rows:
            age = None
            if row["birth_year"]:
                age = int(row["received_on"][:4]) - row["birth_year"]
            responses = json.loads(row["responses"])
            correct = {r["item"]: 1 if counted(r) else 0 for r in responses}
            out.append({
                "score": row["score"], "age": age, "items": correct, "assist": row["assist"],
                "away": sum(r.get("away", 0) for r in responses),
                "awayMs": sum(r.get("awayMs", 0) for r in responses),
            })
        return out

    def first_attempt_scores(self, test: str) -> list[int]:
        return [r["score"] for r in self.first_attempts(test)]

    def backup_to(self, target_path: str) -> None:
        with self._lock:
            target = sqlite3.connect(target_path)
            try:
                self._conn.backup(target)
            finally:
                target.close()

    def close(self) -> None:
        self._conn.close()
