"""Testy, których wyniki przyjmuje API.

Każda wersja testu to osobny wpis (np. ``kostka-v1``, ``kostka-v2``): zmiana
zadań oznacza nową wersję, żeby nie mieszać danych. ``max_score`` służy do
walidacji i do budowy rozkładu punktów.
"""

TESTS: dict[str, dict] = {
    "kostka-v1": {"items": 20, "max_score": 20},
}
