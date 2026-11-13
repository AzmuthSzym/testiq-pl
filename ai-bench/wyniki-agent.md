# Jak AI rozwiązuje nasze zadania: Claude Opus 5.5 (agent w Claude Code)

Wejście: zrzut ekranu zadania z prawdziwej strony i pełna instrukcja testu, jedno podejście na zadanie, bez dostępu do kluczy.

| Test | Poprawne | Zgadywanie | Pewność „wysoka”: trafność |
|---|---|---|---|
| kostka-v2 | 20/20 (100%) | 17% | 18/18 |
| matryce-v1 | 16/16 (100%) | 12% | 13/13 |
| ciagi-v1 | 16/16 (100%) | 0% | 16/16 |

## Według poziomu trudności

| Test | Poziom | Poprawne |
|---|---|---|
| kostka-v2 | 1 | 5/5 |
| kostka-v2 | 2 | 5/5 |
| kostka-v2 | 3 | 5/5 |
| kostka-v2 | 4 | 5/5 |
| matryce-v1 | 1 | 4/4 |
| matryce-v1 | 2 | 4/4 |
| matryce-v1 | 3 | 4/4 |
| matryce-v1 | 4 | 4/4 |
| ciagi-v1 | 1 | 4/4 |
| ciagi-v1 | 2 | 4/4 |
| ciagi-v1 | 3 | 4/4 |
| ciagi-v1 | 4 | 4/4 |

## Uwagi

- Data: 2026-11-13. Agent w Claude Code dostał tylko zrzuty i instrukcje (bez kluczy i kodu), jedno podejście na zadanie, ok. 6 minut na 52 zadania.
- Przy 5 matrycach (1, 6, 9, 15, 16) agent zmierzył piksele krótkim skryptem (wielkość figur, obecność odcinków). Ktoś ściągający przez czat tego zwykle nie zrobi, ale reszta (11/16 matryc, cała kostka i ciągi) była rozwiązana z samego obrazka z wysoką pewnością.
- Wniosek: zadania w obecnej formie nie są odporne na AI. Ochrona musi opierać się na wykrywaniu (pytanie o pomoc, wyjścia z karty, czasy) i ewentualnie limicie czasu na zadanie, a nie na trudności zadań dla AI.
