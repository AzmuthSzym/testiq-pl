"""Zasady punktacji wspólne ze stroną (assets/testiq-common.js, scoreOf).

Odpowiedź udzielona po wyjściu z karty (dłużej niż AWAY_GRACE_MS) nie jest
liczona. Zasada jest jawna: opisana w instrukcji testu i w metodologii.
Reguła „pół punktu po bardzo długim namyśle” jest na stronie wyłączona do
pilotażu; po jej włączeniu trzeba ją dodać tutaj i zmienić kolumnę score
na liczbę niecałkowitą.
"""

AWAY_GRACE_MS = 1000


def left_tab(r: dict) -> bool:
    return bool(r.get("away")) and (r.get("awayMs") or 0) >= AWAY_GRACE_MS


def counted(r: dict) -> bool:
    """Poprawna i nieunieważniona odpowiedź."""
    return bool(r.get("correct")) and not left_tab(r)
