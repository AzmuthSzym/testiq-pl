"""Testy, których wyniki przyjmuje API.

Każda wersja testu to osobny wpis (np. ``kostka-v1``, ``kostka-v2``): zmiana
zadań oznacza nową wersję, żeby nie mieszać danych. ``max_score`` służy do
walidacji i do budowy rozkładu punktów.
"""

TESTS: dict[str, dict] = {
    # v1: część zadań skracała się do mniejszej liczby ruchów (PROGRESS.md, 2.1)
    "kostka-v1": {"items": 20, "max_score": 20},
    "kostka-v2": {"items": 20, "max_score": 20},
    "matryce-v1": {"items": 16, "max_score": 16},
    "ciagi-v1": {"items": 16, "max_score": 16},
    "pamiec-v1": {"items": 28, "max_score": 28},
    # language: test językowy; do norm wchodzą tylko osoby z polskim jako językiem ojczystym
    "slownictwo-v1": {"items": 20, "max_score": 20, "language": True},
    "zdania-v1": {"items": 25, "max_score": 25, "language": True},
}
