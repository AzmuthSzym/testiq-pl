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

## Etap 2: jakość istniejącego testu

### 2.1 Testy generatora kostek — zrobione, wynik: nowa wersja `kostka-v2`

`tests/cube.test.js` (`node --test`) sprawdza na `kostka-v1`, `kostka-v2`, przykładzie i 150 losowych ziarnach, że:
- poprawna odpowiedź jest jedyna (porównanie sygnatur widoku);
- 6 opcji jest różnych i każda pokazuje symbol;
- ruchy nie znoszą się do zera;
- poprawne odpowiedzi są równo rozłożone na A–F (w każdych kolejnych 6 zadaniach każda litera raz, więc w 20 zadaniach 4/4/3/3/3/3);
- poziomy to 5 × 1, 2, 3 i 4 ruchy.

**Znaleziony problem w `kostka-v1`:** ruchy często się skracały. Zadanie 11 (3 obroty) da się zastąpić jednym obrotem, a wszystkie zadania z 4 obrotami dwoma. Na 6000 zadań z losowych ziaren skracało się 43%. Etykieta poziomu zawyżała więc trudność.

**Ograniczenie matematyczne:** ćwierćobrót kostki to nieparzysta permutacja jej czterech przekątnych (grupa obrotów kostki ≅ S4). Dlatego parzysta liczba ruchów zawsze daje obrót osiągalny w 0 albo 2 ruchach, a nieparzysta w 1 albo 3. Test `parzystość` sprawdza to wprost na wszystkich sekwencjach. Zadanie z 4 ruchami zawsze ma więc skrót do 2. Poziom „4 obroty” mierzy śledzenie dłuższej sekwencji, a nie trudniejszy obrót wypadkowy, i tak opiszemy to w metodologii.

**Decyzja: `kostka-v2`.** Generator w wersji 2 odrzuca sekwencje, których obrót wypadkowy jest krótszy, niż pozwala parzystość (`fullDistance`): 1→1, 2→2, 3→3, 4→2. To wyklucza prawdziwe znoszenie się ruchów, np. „do przodu, do tyłu”.
- Strona używa teraz `kostka-v2`.
- `kostka-v1` generuje się bez zmian; pilnuje tego test z sumą kontrolną, żeby dało się odtworzyć zadania dla zapisanych wyników.
- API przyjmuje obie wersje osobno, a ich statystyki się nie mieszają.

### 2.2 Niezależny weryfikator — zrobione

`tests/cube-verifier.js` liczy obroty na permutacjach etykiet kierunków (`+X`, `-Y`…), wyprowadzonych wprost z instrukcji dla uczestnika („ścianka ze strzałką przetacza się w kierunku strzałki”). Nie używa macierzy ani iloczynów wektorowych z generatora.
- **Dane wejściowe:** wyłącznie to, co widzi uczestnik, czyli trzy widoczne ścianki z symbolem i jego kierunkiem.
- **Wynik:** dla każdego zadania (ok. 3000 zadań) wskazuje dokładnie jedną pasującą odpowiedź, równą kluczowi generatora.
- **Dodatkowe testy:** zgodność numeracji ruchów z generatorem (żeby zgodność nie była przypadkowa) i to, że 4 takie same ruchy wracają do stanu wyjścia.

### 2.3 Dostępność i UX — zrobione

**Naprawiony błąd w teście.** Szybkie podwójne kliknięcie (w ciągu 180 ms przed pokazaniem kolejnego zadania) zapisywało drugą odpowiedź jako odpowiedź na **następne** zadanie, którego uczestnik nie widział, i je pomijało. Teraz każde zadanie przyjmuje tylko jedną odpowiedź. Sprawdza to test w przeglądarce.

**Klawiatura:**
- Klawisze A–F (lub 1–6) działają w teście i w przykładzie, ale nie w polach formularza ani ze skrótami Ctrl/Alt.
- Elementy mają widoczny fokus (`:focus-visible`).
- Licznik zadań ma `aria-live`, a zegar `role="timer"`.
- Obsługa klawiszy jest we wspólnym module (`TestIQ.onKeys`, `choiceFromKey`).

**Kontrast** (WCAG 2.1), liczony automatycznie z CSS w obu motywach (`tests/a11y.test.js`): tekst ≥ 4,5:1, elementy interfejsu ≥ 3:1. Poprawki:
- w ciemnym motywie biały tekst na przyciskach miał 2,7:1, teraz jest ciemny tekst (6,8:1);
- obramowania opcji odpowiedzi i pól formularza miały 1,4:1, teraz mają ≥ 3,2:1;
- kolor „poprawnie” w przykładzie w ciemnym motywie jest jaśniejszy (6,2:1).

**Telefon:**
- Na 360 px kostka startowa i 4 ruchy mieszczą się w jednym rzędzie (wcześniej się zawijały).
- Strona nie przewija się w poziomie (sprawdzane na 360 i 390 px).
- Pole zgody jest większe.

**Opuszczenie strony:**
- W trakcie testu przeglądarka ostrzega przed odświeżeniem lub zamknięciem karty (`beforeunload`), a po teście już nie.
- Instrukcja mówi wprost, że odświeżenie kasuje odpowiedzi i że nie da się wrócić do poprzedniego zadania.

**Inne:** w ostatniej minucie zegar zmienia kolor, a przy `prefers-reduced-motion` pasek postępu nie jest animowany.

**Sprawdzenie, czy odpowiedź da się zgadnąć z samych opcji (bez rozwiązywania):**

| Strategia | Trafność |
|---|---|
| Opcja najbardziej podobna do pozostałych | 20,8% |
| Najwięcej symboli | 10,5% |
| Taka jak kostka startowa | 10,2% |
| Losowo | 16,7% |

Przewaga pierwszej strategii jest niewielka, ok. 0,8 pkt na 20 zadań, i wynika z budowy dystraktorów: drobne zmiany sekwencji ruchów „otaczają” poprawną odpowiedź. Na razie zostawiam, a test pilnuje progu 25%. Jeśli analiza danych pokaże, że to istotne, w `kostka-v3` dystraktory będą dobierane tak, żeby wyrównać podobieństwo (tak jak w matrycach, etap 3.1).

## Etap 3: kolejne testy

**Wspólny silnik `assets/test-runner.js`.** Nowe testy korzystają z jednego przebiegu:
- opis z przykładem, formularz i zgoda;
- zegar, jedna odpowiedź na zadanie, klawiatura, ostrzeżenie przed odświeżeniem;
- zapis odpowiedzi z czasem reakcji i poziomem;
- ekran wyniku z tabelą poziomów i porównaniem z innymi.

Test kostki zostaje na swoim kodzie, bo jest sprawdzony i nie ma powodu go ruszać.

### 3.1 Matryce — zrobione (`matryce/`, `matryce-v1`)

**Generator** (`assets/matrix-core.js`), rysowanie w SVG (`assets/matrix-render.js`):
- **Cechy:** kształt, liczba figur, wielkość, wypełnienie, obrót strzałki i odcinki w tle.
- **Reguły** (typy z Carpenter, Just i Shell, 1990): stała w wierszu, stała w kolumnie, progresja, rozkład trzech wartości oraz dodawanie, różnica symetryczna i odejmowanie odcinków.
- **Format:** 16 zadań, po 4 na poziom, 8 opcji (A–H), 15 minut.

**Poziomy:**

| Poziom | Reguły |
|---|---|
| 1 | 4 cechy, same reguły „stała w wierszu/kolumnie” |
| 2 | progresja + 2 reguły proste |
| 3 | progresja + rozkład trzech + reguła prosta |
| 4 | działanie na odcinkach + 2 reguły trudne (każde z trzech działań co najmniej raz) |

**Klucz:** generator odrzuca zadania, w których więcej niż jedna reguła pasuje do 8 komórek, a różne reguły dają różne odpowiedzi. Niezależny weryfikator w `tests/matrix.test.js` sprawdza to inaczej niż generator: zamiast przewidywać brakującą komórkę, wstawia w nią każdą możliwą wartość i sprawdza, które dają matrycę zgodną z jakimkolwiek typem reguły. Na ok. 2400 zadaniach (150 ziaren) każda cecha ma dokładnie jedną poprawną wartość i dokładnie jedna opcja pasuje.

**Pułapka „najczęstszej cechy” i jak jej unikamy.** W źle zbudowanych matrycach (Mittring i Rost, 2008; SOURCES.md) poprawną odpowiedź da się wskazać bez patrzenia na matrycę, np. wybierając opcję, której cechy najczęściej powtarzają się wśród opcji. Nasze rozwiązanie:
1. **8 opcji to wszystkie kombinacje** (poprawna / błędna wartość) trzech zmieniających się cech. Każda wartość każdej cechy występuje w 4 z 8 opcji, a opcje tworzą symetryczny sześcian, więc ani „najczęstsza cecha”, ani „najbardziej (albo najmniej) podobna do pozostałych” nie wyróżnia odpowiedzi.
2. **Błędne wartości to typowe pomyłki wzięte z matrycy** (przepisanie sąsiedniej komórki, pomylenie działania), więc nie da się ich odrzucić tylko dlatego, że nigdzie nie występują.
3. **Żaden dystraktor nie jest kopią komórki matrycy.** Poprawna odpowiedź nigdy nią nie jest, więc kopie dałoby się odrzucić bez rozwiązywania. To wymusiło 4 cechy na poziomie 1: przy jednej cesze w danym kierunku kopia jest nieunikniona.
4. **Liczenie wartości w matrycy.** Reguły stałości i rozkładu trzech można zastosować przez liczenie, bo każda wartość występuje w pełnej matrycy 3 razy, a brakująca tylko 2 razy wśród 8 widocznych pól. Na poziomie 1 to po prostu zastosowanie reguły. Od poziomu 2 każde zadanie ma cechę, której liczenie nie rozwiązuje (progresja albo odcinki), a jej błędną wartość dobieramy tak, by w matrycy nie była częstsza od poprawnej.

**Zmierzona trafność strategii zgadywania** (2400 zadań; losowo 12,5%):

| Strategia | Trafność |
|---|---|
| Najczęstsze cechy wśród opcji (pułapka z literatury) | 12,5% |
| Najbardziej / najmniej podobna do pozostałych opcji | 12,5% / 12,5% |
| Odrzuć wartości spoza matrycy | 10,1% |
| Odrzuć kopie komórek | 12,5% |
| Podobna / niepodobna do komórki obok pustego pola | 4,9% / 17,4% |
| Liczenie wartości w matrycy, poziom 1 / 2 / 3 / 4 | 100% / 65% / 54% / 51% |

Liczenie zawęża wybór na poziomach 2–4 mniej więcej do dwóch opcji, ale ostatni krok wymaga zrozumienia progresji albo działania na odcinkach. Testy pilnują progów (strategie z samych opcji < 20%, liczenie na poziomach 2–4 ≤ 70%). Wynik z poziomu 1 trzeba będzie uwzględnić przy kalibracji: te zadania są z założenia łatwe.

**Testy:**
- 20 testów w `tests/matrix.test.js`.
- W przeglądarce (`tests/e2e`): przejście całego testu klawiaturą, przykład, telefon 360 px w ciemnym motywie bez przewijania w poziomie.
- Naprawiony błąd rysowania: kreskowanie skalowało się razem z figurą i wyglądało jak figura zamalowana do połowy.

### 3.2 Ciągi liczbowe — zrobione (`ciagi/`, `ciagi-v1`)

**Format:** odpowiedź wpisywana (pole liczbowe, Enter albo „Dalej”), do tego przycisk „Nie wiem”. Odpowiedź z przycisku zapisujemy jako pustą, bez wymuszania zgadywania. 16 zadań, 12 minut. Wpisane wartości są normalizowane: spacje, minus typograficzny, a niepoprawny format daje komunikat zamiast oceny.

**Poziomy** (po 4 zadania, każda reguła poziomu występuje):

| Poziom | Reguły |
|---|---|
| 1 | arytmetyczny, geometryczny (×2, ×3, :2) |
| 2 | różnice drugiego rzędu, dwa działania na zmianę (+a, ×b) |
| 3 | dwa ciągi przeplatane (8 wyrazów), każdy wyraz sumą dwóch poprzednich |
| 4 | różnice tworzą ciąg geometryczny, przeplatany ciąg ×2 z ciągiem arytmetycznym |

**Jednoznaczność.** Każdy ciąg da się formalnie przedłużyć na wiele sposobów, więc wymagamy, by wszystkie proste reguły pasujące do pokazanych wyrazów dawały tę samą odpowiedź:
- **Generator** sprawdza to katalogiem reguł: wielomiany do 3. stopnia, iloraz, rekurencja liniowa, Fibonacci, różnice geometryczne, działania na zmianę, przeplatanie.
- **Niezależny weryfikator** (`tests/series.test.js`) robi to inaczej: przeszukuje ogólne rodziny rekurencji z małymi całkowitymi współczynnikami, t(k+1) = a·t(k) + c + d·k i t(k+1) = a·t(k) + b·t(k−1) + c, oraz działania na zmianę i przeplatanie z jednym parametrem na podciąg (+c albo ×a).
- **Lekcja z budowy weryfikatora:** rodzina z 4 parametrami pasuje do niemal każdych 6 liczb (tyle niewiadomych, ile równań), więc „znajdowała” bezsensowne alternatywy. Rodziny muszą zostawiać nadmiarowe równania.
- **Wynik:** na 3200 zadaniach weryfikator zawsze znajduje regułę generatora i żadnej innej odpowiedzi.

**Inne decyzje:**
- **Bez znanego ciągu Fibonacciego.** Ciągi „suma dwóch poprzednich” nie zaczynają się od prawdziwego ciągu Fibonacciego (np. 3, 5, 8, 13…), bo ten wiele osób zna na pamięć i mierzyłby wiedzę, a nie rozumowanie. Problem wyłapał przegląd zrzutu ekranu.
- **Naiwne przedłużenie** („powtórz ostatnią różnicę”) działa poza ciągami arytmetycznymi w mniej niż 1% zadań.
- **Wszystkie liczby są całkowite, |x| ≤ 999.** Ciąg ma co najmniej 4 różne wartości.

### 3.3 Pamięć robocza — zrobione (`pamiec/`, `pamiec-v1`)

**Wybór materiału: cyfry, a nie pozycje na siatce.**
- Cyfry są prostsze w obsłudze na telefonie: wpisuje się je, a nie odtwarza dotykiem z wyczuciem czasu.
- Mają dobrze opisaną procedurę (powtarzanie w przód i wspak).
- Test pozycji na siatce (typu bloków Corsiego) to dobry kandydat na osobny test przestrzennej pamięci roboczej później.

**Procedura:**
- **Część 1:** odtworzenie cyfr w tej samej kolejności, długości 3–9.
- **Część 2:** odtworzenie cyfr od końca, długości 2–8.
- **Próby:** po 2 na długość, łącznie 28 możliwych.
- **Reguła przerwania:** dwie błędne próby na jednej długości kończą część (`nextIndex` w silniku testów).
- **Pokazywanie cyfr:** 1 cyfra na sekundę (800 ms widoczna, 200 ms przerwy).
- **Odpowiedź:** wpisywana z klawiatury albo klawiatury ekranowej, limit 30 s na odpowiedź. Czas reakcji liczony od końca pokazywania.

**Ciągi:**
- cyfry 1–9 bez powtórzeń;
- bez trzech kolejnych rosnących lub malejących o 1 (np. 3-4-5), bo takie łatwo zapamiętać jako całość;
- żaden ciąg się w teście nie powtarza.

**Wynik:** liczba poprawnych prób oraz zakres pamięci w każdej części (najdłuższy poprawnie odtworzony ciąg). Ostrzeżenie o „podejrzanie szybkich odpowiedziach” jest tu wyłączone, bo krótkie ciągi wpisuje się szybko.

**Ograniczenie:** procedura odbywa się w przeglądarce bez kontroli warunków. Nie wiemy, czy ktoś nie zapisuje cyfr. Instrukcja o to prosi, a analiza (etap 4) powinna szukać nieprawdopodobnych wzorców, np. bezbłędnych 9 cyfr wspak przy słabej części 1.

**Testy:**
- `tests/memory.test.js`: układ, cyfry, klucz, reguła przerwania, zakres.
- W przeglądarce: przykład z klawiatury ekranowej, przejście z przerwaniem obu części, zapis w API.
- API przyjmuje nowe pole `span` (długość ciągu).

## Pytania i decyzje do podjęcia

1. **Domena dla API (blokuje uruchomienie zbierania danych).** Odwrotny DNS serwera to `srv71.mikr.us`, więc to najpewniej VPS z mikr.us. Tam adres IPv4 jest zwykle współdzielony między serwerami i dostępne są tylko wybrane porty, a własny jest adres IPv6. Porty 80 i 443 na IPv4, potrzebne do zwykłego Let's Encrypt, raczej nie są Twoje. Sprawdź to w panelu. Opcje:
   - **a) Subdomena z panelu mikr.us** (o ile jest w Twoim pakiecie), skierowana na port przydzielony temu serwerowi. HTTPS zapewnia wtedy mikr.us. U nas: `NGINX_MODE=http`, `HTTP_BIND=0.0.0.0:<port>`, `REAL_IP_FROM=<adresy proxy mikr.us>`. Najtańsze, bo darmowe.
   - **b) Własna domena (ok. 10–60 zł/rok) przez Cloudflare** (darmowy plan, proxy w trybie „Full”). Cloudflare przyjmuje ruch na IPv4 i łączy się z serwerem przez IPv6. Pozwala też ukryć adres serwera.
   - **c) Własna domena, rekord AAAA i Let's Encrypt** bezpośrednio (tryb `https`). Prosta, ale użytkownicy bez IPv6 nie połączą się z API, a to wciąż spory odsetek, więc odradzam.

   Polecam b), jeśli i tak planujesz własną domenę dla strony, a w przeciwnym razie a). Każda opcja to koszt albo publikacja, więc decyzja należy do Ciebie.
2. **Kopia poza serwerem.** Kopie leżą na tym samym dysku co baza. Warto je co jakiś czas wysyłać gdzie indziej (np. szyfrowane do chmury), ale wybór miejsca to decyzja o przekazaniu danych osobom trzecim.
3. **Uruchomienie zbierania danych.** Ustawienie `apiUrl` na gałęzi `main` (GitHub Pages) oznacza start zbierania danych osobowych (rok urodzenia, wykształcenie). Wcześniej potrzebna jest opublikowana polityka prywatności (szkic powstanie w etapie 5, do Twojej weryfikacji). Dlatego zmiany frontendu trzymam na gałęzi `rozbudowa` i nie scalam ich do `main`.
