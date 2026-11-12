"""Codzienna kopia bazy: ``python -m app.backup`` działa w pętli (kontener
``backup`` w docker-compose). Kopie są spójne (SQLite backup API), trzymamy
ostatnie KEEP_DAYS dni.
"""

import glob
import os
import sqlite3
import time
from datetime import datetime, timezone

DB_PATH = os.environ.get("DB_PATH", "./data/results.db")
BACKUP_DIR = os.environ.get("BACKUP_DIR", "./backups")
KEEP_DAYS = int(os.environ.get("KEEP_DAYS", "14"))
INTERVAL_SECONDS = 24 * 3600


def backup_once(db_path: str = DB_PATH, backup_dir: str = BACKUP_DIR, keep: int = KEEP_DAYS) -> str | None:
    if not os.path.exists(db_path):
        return None
    os.makedirs(backup_dir, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    target = os.path.join(backup_dir, f"results-{stamp}.db")
    source = sqlite3.connect(db_path)
    dest = sqlite3.connect(target + ".tmp")
    try:
        source.backup(dest)
        # kopia ma być jednym samodzielnym plikiem (bez -wal / -shm)
        dest.execute("PRAGMA journal_mode=DELETE")
    finally:
        dest.close()
        source.close()
    os.replace(target + ".tmp", target)
    for old in sorted(glob.glob(os.path.join(backup_dir, "results-*.db")))[:-keep]:
        os.remove(old)
    return target


if __name__ == "__main__":
    while True:
        path = backup_once()
        print(f"{datetime.now(timezone.utc).isoformat()} kopia: {path}", flush=True)
        time.sleep(INTERVAL_SECONDS)
