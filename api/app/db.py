"""SQLite: jedna tabela wyników. Bez adresów IP i bez danych kontaktowych."""

import json
import sqlite3
import threading
from datetime import datetime, timezone

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
            score,
            len(r.responses),
            json.dumps([x.model_dump(exclude_none=True) for x in r.responses], separators=(",", ":")),
        )
        with self._lock:
            cur = self._conn.execute(
                """INSERT OR IGNORE INTO results (test, participant, started_at, received_on,
                   duration_ms, timed_out, birth_year, education, score, n_responses, responses)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                row,
            )
            self._conn.commit()
            return cur.rowcount == 1

    def first_attempt_scores(self, test: str) -> list[int]:
        """Wyniki z pierwszego podejścia każdego uczestnika (kolejne podejścia
        są zawyżone przez efekt treningu, więc nie trafiają do norm)."""
        with self._lock:
            rows = self._conn.execute(
                """SELECT score FROM results WHERE id IN (
                       SELECT MIN(id) FROM results WHERE test = ? GROUP BY participant)""",
                (test,),
            ).fetchall()
        return [row["score"] for row in rows]

    def backup_to(self, target_path: str) -> None:
        with self._lock:
            target = sqlite3.connect(target_path)
            try:
                self._conn.backup(target)
            finally:
                target.close()

    def close(self) -> None:
        self._conn.close()
