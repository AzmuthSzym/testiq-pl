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

### 1.2 Wdrożenie — zrobione lokalnie, czeka na domenę

**Decyzja: Docker Compose zamiast systemd i nginx z pakietów.** Bez `sudo` nie zainstaluję nginx ani usług systemd, a Docker daje to samo:
- **Autostart i restarty:** `restart: unless-stopped`. Demon Dockera startuje z systemem, więc usługi wstają po restarcie VPS-a. To odpowiednik systemd.
- **nginx jako reverse proxy:** obraz `nginx:1.27-alpine`, `deploy/nginx/`.
- **Prywatność w nginx:** dziennik dostępu jest wyłączony, a dziennik błędów ograniczony do poziomu `crit`, bo komunikaty błędów zawierają adres IP klienta. Uvicorn też działa bez dziennika dostępu.
- **Limity w nginx:** dodatkowy limit `limit_req` (30/min na adres, tylko w pamięci nginx) i `client_max_body_size 64k`.
- **Kopia zapasowa:** kontener `backup` robi kopię raz na dobę (SQLite backup API, spójna mimo trwających zapisów) do `deploy/backups/` i trzyma 14 ostatnich dni. Kopia na tym samym dysku nie chroni przed awarią serwera, patrz pytania.
- **HTTPS:** dwa tryby w `deploy/env.example`:
  - `https`: własna domena + Let's Encrypt. Certyfikat pobiera `./deploy.sh cert`, a odnawia kontener `certbot`. Rejestracja jest bez adresu e-mail.
  - `http`: HTTPS kończy się na zewnętrznym proxy (subdomena dostawcy VPS, Cloudflare), a nginx bierze prawdziwy adres klienta tylko od zaufanego proxy (`REAL_IP_FROM`).

**Stan:** usługi działają na VPS-ie, ale nasłuchują tylko na `127.0.0.1:8080`, więc z internetu nic nie widać. Sprawdzone przez nginx:
- zapis zwraca 201;
- preflight CORS dla `azmuthszym.github.io` przechodzi;
- 100 KB zwraca 413;
- statystyki działają;
- kopia się tworzy.

Testowy wpis i jego kopię usunąłem.

**Brakuje domeny i dostępu do portów (pytanie 1).**

### 1.3 Testy i `deploy.sh` — zrobione

Polecenia `./deploy.sh test|up|cert|status|backup|down`. Polecenie `up` najpierw uruchamia testy API i JS, a przy błędzie przerywa wdrożenie. Testy JS uruchamia `node --test` w kontenerze `node:22-alpine`.

### 1.4 Frontend — zrobione (`apiUrl` celowo pusty)

- **Wspólny moduł `assets/testiq-common.js`:** zgoda i formularz, identyfikator uczestnika, wysyłka, pobieranie statystyk i wykres rozkładu. Kolejne testy będą z niego korzystać.
- **`apiUrl` to adres bazowy serwera:** strona dokleja `/api/results` i `/api/norms/<test>`. README jest zaktualizowane.
- **Ekran wyniku:** przy N ≥ 30 pokazuje rozkład wyników innych z wyróżnionym wynikiem uczestnika i rangę centylową z 95% marginesem błędu. Do tego dochodzi opis próby: ochotnicy, pierwsze podejście, to jeszcze nie norma. Przy N < 30 pokazuje komunikat, że zbieramy dane, i bieżące N.
- **Kolejność:** statystyki są pobierane dopiero po zapisie wyniku, żeby obejmowały też ten wynik. Wcześniej był tu wyścig, który wykrył test w przeglądarce.
- **`apiUrl` zostaje pusty**, dopóki nie ma domeny (pytanie 1) i decyzji o starcie zbierania (pytanie 3).
- **Test w przeglądarce `tests/e2e/run.sh`:** Chromium (Playwright) w Dockerze, strona i API w osobnej sieci. Przechodzi cały test i sprawdza:
  - wysyłkę;
  - brak wysyłki bez zgody;
  - rozkład po 35 sztucznych wynikach;
  - brak przewijania w poziomie na telefonie.

  Zrzuty ekranu trafiają do `tests/e2e/out/`.

## Pytania i decyzje do podjęcia

1. **Domena dla API (blokuje uruchomienie zbierania danych).** Odwrotny DNS serwera to `srv71.mikr.us`, więc to najpewniej VPS z mikr.us. Tam adres IPv4 jest zwykle współdzielony między serwerami i dostępne są tylko wybrane porty, a własny jest adres IPv6. Porty 80 i 443 na IPv4, potrzebne do zwykłego Let's Encrypt, raczej nie są Twoje. Sprawdź to w panelu. Opcje:
   - **a) Subdomena z panelu mikr.us** (o ile jest w Twoim pakiecie), skierowana na port przydzielony temu serwerowi. HTTPS zapewnia wtedy mikr.us. U nas: `NGINX_MODE=http`, `HTTP_BIND=0.0.0.0:<port>`, `REAL_IP_FROM=<adresy proxy mikr.us>`. Najtańsze, bo darmowe.
   - **b) Własna domena (ok. 10–60 zł/rok) przez Cloudflare** (darmowy plan, proxy w trybie „Full”). Cloudflare przyjmuje ruch na IPv4 i łączy się z serwerem przez IPv6. Pozwala też ukryć adres serwera.
   - **c) Własna domena, rekord AAAA i Let's Encrypt** bezpośrednio (tryb `https`). Prosta, ale użytkownicy bez IPv6 nie połączą się z API, a to wciąż spory odsetek, więc odradzam.

   Polecam b), jeśli i tak planujesz własną domenę dla strony, a w przeciwnym razie a). Każda opcja to koszt albo publikacja, więc decyzja należy do Ciebie.
2. **Kopia poza serwerem.** Kopie leżą na tym samym dysku co baza. Warto je co jakiś czas wysyłać gdzie indziej (np. szyfrowane do chmury), ale wybór miejsca to decyzja o przekazaniu danych osobom trzecim.
3. **Uruchomienie zbierania danych.** Ustawienie `apiUrl` na gałęzi `main` (GitHub Pages) oznacza start zbierania danych osobowych (rok urodzenia, wykształcenie). Wcześniej potrzebna jest opublikowana polityka prywatności (szkic powstanie w etapie 5, do Twojej weryfikacji). Dlatego zmiany frontendu trzymam na gałęzi `rozbudowa` i nie scalam ich do `main`.
