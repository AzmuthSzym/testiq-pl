"""Limit zapytań na adres IP bez przechowywania adresów.

Klucz to HMAC-SHA256(adres IP) z solą losowaną co dobę (UTC). Sól jest tylko
w pamięci procesu i nigdy nie trafia na dysk, więc po zmianie doby (albo po
restarcie) nie da się powiązać nowych kluczy ze starymi ani odtworzyć adresu.
"""

import hashlib
import hmac
import secrets
import threading
import time
from collections import deque
from datetime import datetime, timezone


class RateLimiter:
    def __init__(self, limit: int, window_seconds: float, clock=time.monotonic, today=None):
        self.limit = limit
        self.window = window_seconds
        self._clock = clock
        self._today = today or (lambda: datetime.now(timezone.utc).date().isoformat())
        self._lock = threading.Lock()
        self._day = None
        self._salt = b""
        self._hits: dict[str, deque] = {}

    def _rotate_if_needed(self) -> None:
        day = self._today()
        if day != self._day:
            self._day = day
            self._salt = secrets.token_bytes(32)
            self._hits.clear()

    def key_for(self, ip: str) -> str:
        with self._lock:
            self._rotate_if_needed()
            return hmac.new(self._salt, ip.encode(), hashlib.sha256).hexdigest()

    def allow(self, ip: str) -> bool:
        with self._lock:
            self._rotate_if_needed()
            key = hmac.new(self._salt, ip.encode(), hashlib.sha256).hexdigest()
            now = self._clock()
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            # sprzątanie, żeby słownik nie rósł bez końca
            if len(self._hits) > 50_000:
                for k in [k for k, v in self._hits.items() if not v or now - v[-1] >= self.window]:
                    del self._hits[k]
            return True
