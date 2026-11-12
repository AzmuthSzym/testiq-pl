# Test IQ PL

Polskie testy zdolności poznawczych. Statyczna strona (GitHub Pages), wyniki zbierane opcjonalnie przez API na VPS.

## Struktura

- `index.html` — strona główna
- `kostka/` — test „Obracanie kostki” (20 zadań, 8 min)
- `assets/cube-core.js` — generator zadań (z ziarnem, te same zadania dla wszystkich; działa też w Node)
- `assets/cube-render.js` — rysowanie kostek w SVG
- `assets/config.js` — `apiUrl` serwera zbierającego wyniki (pusty = brak wysyłki)

## Uruchomienie lokalnie

```
python3 -m http.server 8000
```

i otwórz http://localhost:8000

## Format wyniku

Każde podejście zapisywane jest w `localStorage`. Jeśli ustawiono `apiUrl` i uczestnik wyraził zgodę, wynik trafia na serwer (POST JSON):

```json
{
  "test": "kostka-v1", "participant": "uuid", "durationMs": 312000, "timedOut": false,
  "meta": { "birthYear": 1999, "education": "wyzsze", "consent": true },
  "responses": [{ "item": 1, "moves": 1, "choice": 3, "correct": true, "ms": 5400 }]
}
```

Zmiana zadań = nowe ziarno (`kostka-v2`), żeby nie mieszać danych z różnych wersji.
