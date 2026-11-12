# Test IQ PL

Polskie testy zdolności poznawczych. Statyczna strona (GitHub Pages), wyniki zbierane opcjonalnie przez API na VPS.

## Struktura

- `index.html` — strona główna
- `kostka/` — test „Obracanie kostki” (20 zadań, 8 min)
- `assets/cube-core.js` — generator zadań (z ziarnem, te same zadania dla wszystkich; działa też w Node)
- `assets/cube-render.js` — rysowanie kostek w SVG
- `assets/testiq-common.js` — wspólne elementy testów (zgoda, wysyłka, porównanie z innymi)
- `assets/config.js` — `apiUrl`: adres serwera API (pusty = brak wysyłki)
- `api/` — serwer API (FastAPI + SQLite), `deploy/` i `deploy.sh` — wdrożenie w Dockerze
- `PROGRESS.md` — dziennik prac i otwarte pytania

## Uruchomienie lokalnie

```
python3 -m http.server 8000
```

i otwórz http://localhost:8000

## Format wyniku

Każde podejście zapisywane jest w `localStorage`. Jeśli ustawiono `apiUrl` i uczestnik wyraził zgodę, wynik trafia na serwer (`POST <apiUrl>/api/results`, JSON):

```json
{
  "test": "kostka-v2", "version": 2, "participant": "uuid", "durationMs": 312000, "timedOut": false,
  "meta": { "birthYear": 1999, "education": "wyzsze", "consent": true },
  "responses": [{ "item": 1, "moves": 1, "choice": 3, "correct": true, "ms": 5400 }]
}
```

Statystyki do ekranu wyniku: `GET <apiUrl>/api/norms/<test>` zwraca `n`, `mean`, `sd`, `sem` i `distribution` (liczba osób z każdym wynikiem). Strona pokazuje rozkład od 30 osób.

Zmiana zadań = nowe ziarno (`kostka-v2`), żeby nie mieszać danych z różnych wersji.
