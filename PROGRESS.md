# Postęp prac

Dziennik rozbudowy projektu: co zrobione, co dalej, decyzje i ich uzasadnienie.
Pytania do właściciela projektu są w sekcji **Pytania i decyzje do podjęcia** na dole.

Praca toczy się na gałęzi `rozbudowa`. Gałąź `main` publikuje stronę na
GitHub Pages, więc scalenie do `main` = publikacja (patrz pytania).

## Stan środowiska (VPS, 2026-11-12)

- Python 3.12 jest, ale bez `pip` i `venv` (brak pakietu `python3-venv`), Node nie ma.
- `sudo` wymaga hasła, więc nie instaluję pakietów systemowych (nginx, certbot, systemd).
- Jest Docker 29 z Compose v5, a użytkownik należy do grupy `docker`.
- `crontab` jest niedostępny dla użytkownika (brak uprawnień).
- **Decyzja:** wszystko (API, nginx, kopie zapasowe, testy JS w Node) działa w kontenerach Dockera. Szczegóły w etapie 1.2.

## Etap 1: backend do zbierania wyników

### 1.1 API — zrobione

**Decyzja: Python + FastAPI + SQLite.** Powody:
- Analiza psychometryczna (etap 4) i tak będzie w Pythonie, więc jeden język po stronie serwera to mniej kodu i jedna wspólna baza.
- Python jest na serwerze, a Node nie.
- SQLite wystarczy przy spodziewanym ruchu (zapisy rzędu setek dziennie, jeden proces API). Kopię robi się jednym wywołaniem `backup()`. Postgres to dodatkowa usługa do utrzymania, a nic tu nie zyskuje. Przejście na Postgres będzie proste, bo cały dostęp do bazy jest w `api/app/db.py`.

**Pliki:**
- `api/app/main.py`: endpointy.
- `models.py`: schemat.
- `db.py`
- `ratelimit.py`
- `norms.py`
- `backup.py`
- `tests_registry.py`: lista przyjmowanych testów i wersji.

**`POST /api/results`:**
- **Walidacja:** ścisły schemat (pydantic, `extra="forbid"`). Nadmiarowe pola, np. e-mail, są odrzucane, więc nie zapiszemy przypadkiem danych, których nie chcemy.
- **Zgoda:** wynik bez `meta.consent = true` jest odrzucany (422) i nic nie trafia do bazy.
- **Limit rozmiaru:** 64 KB w API, dodatkowo w nginx.
- **Limit zgłoszeń:** 20 na godzinę na adres. Kluczem jest HMAC-SHA256 adresu IP z solą losowaną co dobę (UTC). Sól jest tylko w pamięci, więc adresów nie da się odtworzyć ani powiązać między dniami. Adres IP nie trafia do bazy ani do logów API.
- **Duplikaty:** ten sam uczestnik z tym samym czasem startu zapisuje się tylko raz.
- **Data odbioru:** zapisywana tylko jako dzień, bez godziny (minimalizacja danych).
- **Znane ograniczenie:** poprawność odpowiedzi liczy przeglądarka, więc da się przysłać sfałszowany wynik. Przy anonimowym teście to akceptowalne, a analiza (etap 4) i tak odsiewa podejrzane wyniki. Później serwer może sam sprawdzać klucz, bo generator jest deterministyczny.

**`GET /api/norms/:test`:**
- Zwraca N, średnią, SD, błąd standardowy średniej i rozkład punktów.
- Liczy tylko **pierwsze podejście** każdego uczestnika, bo kolejne są zawyżone przez efekt treningu.
- Opis próby jest w odpowiedzi.
- Wynik jest cache'owany przez 60 s.

**CORS:** tylko `https://azmuthszym.github.io`.

**Testy:** `api/tests/test_api.py` (27 testów) sprawdza walidację, zgodę, rozmiar, limit, sól, CORS, normy i kopię zapasową. Uruchomienie: `./deploy.sh test`.
