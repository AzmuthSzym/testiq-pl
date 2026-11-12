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

### 3.4 Słownictwo — zrobione silnik i kandydaci; zadania czekają na przegląd

**Lista frekwencyjna: wordfreq** (Robyn Speer), dane na **CC BY-SA 4.0**, czyli użytek komercyjny dozwolony z uznaniem autorstwa i na tych samych warunkach. Sprawdzone opcje (SOURCES.md):
- **Leipzig Corpora Collection:** CC BY-NC, odpada (niekomercyjne).
- **SUBTLEX-PL:** „do celów badawczych”, niejasne dla użytku komercyjnego.
- **Listy NKJP / KWJP:** serwer niedostępny, nie udało się sprawdzić licencji.

**Synonimy: plWordNet** w wersji Open Multilingual Wordnet 1.4 (`omw-pl`). Licencja przeczytana w pliku LICENSE z paczki: wolno używać, kopiować, modyfikować i rozpowszechniać do dowolnych celów, także komercyjnych, pod warunkiem umieszczenia informacji o prawach autorskich i zastrzeżeń na wszystkich kopiach. Dlatego `slownictwo/items.json` i stopka strony zawierają informację o źródłach.

**Kandydaci:** `vocab/build_candidates.py` uruchamiany w Dockerze. Wynik to **`vocab/kandydaci/kandydaci.tsv`**: 600 kandydatów, po 150 w 4 pasmach częstości. **Plik jest tylko na VPS-ie, poza gitem** (`vocab/.gitignore`), bo repozytorium jest publiczne.
- **Konstrukcja zadania:** słowo docelowe, jego częstszy synonim i 4 dystraktory tej samej części mowy o podobnej częstości co synonim, żeby częstość nie podpowiadała.
- **Wykluczenia:**
  - słowa wieloznaczne (więcej niż 2 znaczenia);
  - pary o wspólnym początku (zdrobnienia, ten sam rdzeń);
  - dystraktory ze znaczeniem powiązanym z odpowiedzią;
  - wulgaryzmy i słowa obraźliwe z listy.
- **Przegląd próbki:** ok. 1/3 to dobre zadania (np. „meritum → sedno”, „zagadnienie → problem”, „wszechnica → uniwersytet”). Reszta wymaga poprawek albo odrzucenia: polskie synsety są w OMW zmapowane na angielski WordNet, więc „synonimy” bywają tylko pokrewne. Zdarzają się też pary nacechowane („bolszewik → komuch”), zapożyczenia i warianty pisowni („avocado → awokado”). Instrukcja dla przeglądającego jest w `vocab/approve.py`.

**Test** (`slownictwo/`, `slownictwo-v1`):
- 20 zadań (po 5 z pasma), 5 opcji, 6 minut.
- Zadania pochodzą wyłącznie z `slownictwo/items.json`, który tworzy `vocab/approve.py` z wierszy oznaczonych „tak”.
- Dopóki zatwierdzonych zadań jest za mało, strona pokazuje „Test w przygotowaniu”.
- Strona główna nie ma jeszcze linku do testu.
- Testy: `tests/vocab.test.js` i `vocab/test_approve.py`. W przeglądarce: stan „w przygotowaniu” i przejście z bankiem sztucznych słów.

## Etap 4: analiza psychometryczna

Kod jest w `analysis/` (Python: numpy, scipy). Uruchamia się w Dockerze przez `analysis/run.sh`, a testy są częścią `./deploy.sh test`.

### 4.1 Eksport, statystyki zadań, rzetelność, wykrywanie przeklikania — zrobione
- **`data.py`:** eksport z bazy API, tylko pierwsze podejścia. Dane w formacie długim CSV bez identyfikatorów uczestników.
- **`items.py`:**
  - trudność p i korelacja zadania z resztą testu (skorygowana);
  - alfa po usunięciu zadania i alfa Cronbacha;
  - omega McDonalda z modelu jednoczynnikowego (metoda osi głównych);
  - błąd pomiaru.
  - Ograniczenie: korelacje Pearsona na zadaniach 0/1 zaniżają ładunki zadań skrajnie łatwych i trudnych, więc omega jest raczej ostrożna. Lepsze byłyby korelacje tetrachoryczne, ale to sensowne dopiero przy większym N.
- **`careless.py`:** cztery wskaźniki braku zaangażowania:
  - odsetek odpowiedzi szybszych niż próg;
  - najdłuższa seria tej samej opcji;
  - znormalizowane błędy Guttmana (łatwe źle, trudne dobrze);
  - wynik nieodróżnialny od zgadywania (test dwumianowy).

  Wykluczamy osoby z ≥ 2 flagami, a normy raportujemy z wykluczeniem i bez niego. W symulacji 10 losowo klikających osób na 200 wszystkie zostały wykryte, a fałszywych alarmów było mało.
- **`report.py`:** raport jednego testu z bazy produkcyjnej, np. `analysis/run.sh report matryce-v1 16 0.125`. Czyta kopię bazy, więc nie przeszkadza działającemu API.

### 4.2 Model 2PL — zrobione, sprawdzone na danych symulowanych
- **`irt.py`:**
  - estymacja metodą marginalnej największej wiarygodności, EM Bocka–Aitkina, 41 węzłów kwadratury;
  - łagodne rozkłady a priori na parametry, które stabilizują estymację przy małym N;
  - obsługa braków odpowiedzi;
  - θ metodą EAP z błędem standardowym oraz informacja testu.
- **Od jakiego N to ma sens:** nie podaję reguły z literatury z pamięci, tylko wynik własnej symulacji (`analysis/wyniki/odtwarzanie_2pl.md`, test 16 zadań, 8 powtórzeń):

  | N | r(â, a) | r(b̂, b) | RMSE b | r(θ̂, θ) |
  |---|---|---|---|---|
  | 100 | 0,69 | 0,95 | 0,30 | 0,87 |
  | 250 | 0,71 | 0,97 | 0,24 | 0,86 |
  | 500 | 0,86 | 0,99 | 0,13 | 0,86 |
  | 1000 | 0,95 | 0,99 | 0,13 | 0,86 |
  | 2000 | 0,97 | 1,00 | 0,08 | 0,87 |

  **Wniosek:** trudności zadań da się sensownie oszacować od ok. 250 osób na wersję testu. Dyskryminacje od ok. 500, a stabilnie od ok. 1000. Do tego czasu wystarczają wyniki surowe i klasyczne statystyki zadań: IRT nie poprawia wyniku osoby (r(θ̂, θ) jest stałe, ograniczone rzetelnością testu), a przydaje się do oceny i wymiany zadań. `report.py` uruchamia 2PL od N ≥ 500.
- **Uwaga:** w testach z wyborem odpowiedzi (kostka 1/6, matryce 1/8) jest zgadywanie. 2PL go nie modeluje (model 3PL tak, ale potrzebuje znacznie więcej danych), co zaniża dyskryminacje łatwych zadań. Przy N > 2000 warto porównać 2PL z 3PL.

### 4.3 Skala IQ i normy według wieku — zrobione (`scoring.py`, strona)
- **Normy:** grupy wieku 16–19, 20–29, …, 70+.
- **IQ:** 100 + 15·z względem normy grupy, jeśli grupa ma ≥ 30 osób; w przeciwnym razie względem całej próby, co strona mówi wprost.
- **Przedział 95%:** łączy błąd pomiaru (SD·√(1−rzetelność)) z niepewnością samej normy, bo średnią i SD znamy tylko z próby (metoda delta). Symulacja w testach sprawdza pokrycie (ok. 95%).
- **Progi:**
  - **< 30 osób:** IQ nie podajemy wcale.
  - **30–399 osób:** „Estymacja wstępna” z wyraźnym ostrzeżeniem, że to nie są polskie normy, a próba składa się z ochotników.
  - **Decyzja (2026-11-12, na prośbę właściciela):** próg estymacji obniżony ze 100 do 30. Użytkownicy oczekują wyniku IQ, a przedział i tak uwzględnia niepewność norm (przy N=30 i rzetelności 0,8: ok. ±15 pkt zamiast ±13 przy N=100), więc mała próba daje szerszy, uczciwy przedział zamiast braku wyniku.
  - **≥ 400 osób:** „Wynik na skali IQ” z informacją, że próba nie jest reprezentatywna.
- **API (`GET /api/norms`):** zwraca teraz rzetelność KR-20 (od 30 osób) i statystyki grup wieku (tylko grupy z ≥ 30 osobami). Strona liczy IQ tym samym wzorem co analiza w Pythonie, co sprawdza test na wartościach wzorcowych.

### 4.4 Wynik łączny — zrobione (strona główna, „Twój profil”)
- **Metoda:** znormalizowana suma wyników z rozwiązanych testów. Rzetelność sumy jest liczona z rzetelności testów i ich korelacji, a do błędu dochodzi niepewność norm.
- **Właściwości:** dla jednego testu wynik jest taki sam jak wynik tego testu, a każdy kolejny test zawęża przedział (sprawdzone testami i symulacją).
- **Pierwsza wersja była błędna:** szacowała ukryty czynnik g i była ściągana ku średniej, więc jej przedział wychodził szerszy niż przedziały pojedynczych testów (wyłapane na zrzucie ekranu). Wersja z sumą jest spójna z wynikami pojedynczych testów.
- **Założenie robocze:** korelacje między testami to ok. 0,49 (ładunek 0,7), dopóki nie zbierzemy wyników tych samych osób z kilku testów. Strona to mówi.
- **Kiedy się pokazuje:** od 2 testów z normami (≥ 100 osób). Wyniki są brane z przeglądarki uczestnika (`localStorage`), więc nic nie trzeba łączyć po stronie serwera.

**Ograniczenia całego etapu:**
- Wszystkie progi (100 / 400 osób) i założenia są do weryfikacji na prawdziwych danych.
- Normy z próby ochotniczej nie są normami populacyjnymi i strona tego nie ukrywa.
- KR-20 dla testu pamięci liczy próby pominięte przez regułę przerwania jako błędne, co zawyża rzetelność. Dla tego testu lepsza będzie rzetelność z podziału (np. próby 1 i 2 każdej długości), do zrobienia przy analizie danych.

## Etap 5: przygotowanie pod wersję płatną (bez płatności)

### 5.1 Projekt raportu — zrobione (`docs/RAPORT.md`)
**Warunki sensowności:**
- normy z ≥ 400 osób na test;
- rzetelność ≥ 0,80;
- korelacje między testami z danych;
- darmowy wynik pozostaje darmowy.

**Zawartość:**
- podsumowanie;
- profil zdolności, w którym różnice między testami pokazujemy tylko powyżej krytycznej różnicy;
- szczegóły testów, ostrzeżenia o jakości pomiaru, jak czytać wynik, aneks techniczny.

**Czego nie obiecujemy:** diagnozy, „prawdziwego IQ”, dokładności lepszej niż przedział, treningu mózgu, porównań z celebrytami i opisów osobowości.

### 5.2 Strony — zrobione
- **`metodologia/`:**
  - co mierzy każdy test i jak powstają i są sprawdzane zadania;
  - normy i progi 30/100/400;
  - skala IQ i źródła niepewności, wynik łączny;
  - czego testy nie mówią.
- **`prywatnosc/`:** **szkic do Twojej weryfikacji**, z wyraźnym oznaczeniem na stronie i polami w [nawiasach] do uzupełnienia. Opisuje faktyczne działanie kodu:
  - co zostaje tylko w przeglądarce;
  - co idzie na serwer po zgodzie;
  - brak IP w bazie i dziennikach (skrót z dzienną solą tylko w pamięci);
  - brak cookies i analityki, wiek 16+.
- **`zrodla/`:** bibliografia, licencje zasobów i czcionek, zasoby odrzucone.
- **Stopka:** linki w stopce na wszystkich stronach. Formularz zgody linkuje do zasad prywatności.

**Zmiany w kodzie wynikające z prywatności:**
- **Czcionki z własnego serwera** zamiast z Google Fonts (`assets/fonts/`, licencje OFL w repozytorium). Wcześniej każde wejście na stronę wysyłało adres IP użytkownika do Google. Test w przeglądarce sprawdza, że wszystkie zapytania idą tylko do własnych serwerów.
- **Osoby poniżej 16 lat** (wiek zgody w RODO w Polsce):
  - strona nie wysyła ich wyników, a API je odrzuca;
  - treść zgody zawiera oświadczenie o ukończeniu 16 lat.
- **`slownictwo/items.json`:** pusty plik z informacją o licencjach, bez listy zadań. Bez niego strona testu dostawała błąd 404.

### 5.3 Sprawy prawne — zrobione (`LEGAL-TODO.md`)
Lista pytań do prawnika z wyraźnym zastrzeżeniem, że to nie porada prawna:
- **Licencje:** share-alike wordfreq, informacja plWordNet, ICAR, ETS, nazwa i znak towarowy, brak licencji repozytorium.
- **RODO:**
  - administrator, podstawa i treść zgody;
  - czy wyniki to dane z art. 9, `localStorage` bez zgody;
  - prawa osób (brakuje narzędzia do usuwania wyników po identyfikatorze);
  - retencja kopii, rejestr i DPIA;
  - przekazywanie do USA: GitHub, ewentualnie Cloudflare.
- **Regulamin i prawo konsumenckie:** odstąpienie przy treściach cyfrowych, Omnibus, płatności, VAT OSS, forma działalności.
- **Ryzyko wprowadzania w błąd** (nazwa „Test IQ”) i granica czynności zastrzeżonych dla psychologów.

## Podsumowanie i co dalej

**Stan:** wszystkie etapy 1–5 są zrobione w zakresie, który da się zrobić bez Twoich decyzji. Gałąź `rozbudowa` (lokalnie na VPS-ie) zawiera:
- 5 testów: kostka-v2, matryce, ciągi, pamięć oraz słownictwo czekające na przegląd zadań;
- API, wdrożenie, analizę i dokumentację.

**Testy:** `./deploy.sh test` uruchamia API (31), analizę (16), narzędzia słownictwa i JS (65). Do tego `tests/e2e/run.sh`, czyli Chromium: przejście każdego testu, telefon, ciemny motyw, prywatność.

**Kolejność dalszych kroków:**
1. Decyzje z pytań 1, 3 i 4 poniżej (domena, start zbierania, przegląd słownictwa) oraz uzupełnienie polityki prywatności.
2. Wdrożenie API z domeną, `apiUrl` na `main`, scalenie `rozbudowa` → `main`.
3. Narzędzie do usuwania wyników na żądanie (LEGAL-TODO, RODO) przed szerszym ogłoszeniem.
4. Po pierwszych ~250 osobach na test: `analysis/run.sh report …`, przegląd zadań, ewentualnie nowe wersje testów.

## Pytania i decyzje do podjęcia

1. **Domena dla API (blokuje uruchomienie zbierania danych).** Odwrotny DNS serwera to `srv71.mikr.us`, więc to najpewniej VPS z mikr.us. Tam adres IPv4 jest zwykle współdzielony między serwerami i dostępne są tylko wybrane porty, a własny jest adres IPv6. Porty 80 i 443 na IPv4, potrzebne do zwykłego Let's Encrypt, raczej nie są Twoje. Sprawdź to w panelu. Opcje:
   - **a) Subdomena z panelu mikr.us** (o ile jest w Twoim pakiecie), skierowana na port przydzielony temu serwerowi. HTTPS zapewnia wtedy mikr.us. U nas: `NGINX_MODE=http`, `HTTP_BIND=0.0.0.0:<port>`, `REAL_IP_FROM=<adresy proxy mikr.us>`. Najtańsze, bo darmowe.
   - **b) Własna domena (ok. 10–60 zł/rok) przez Cloudflare** (darmowy plan, proxy w trybie „Full”). Cloudflare przyjmuje ruch na IPv4 i łączy się z serwerem przez IPv6. Pozwala też ukryć adres serwera.
   - **c) Własna domena, rekord AAAA i Let's Encrypt** bezpośrednio (tryb `https`). Prosta, ale użytkownicy bez IPv6 nie połączą się z API, a to wciąż spory odsetek, więc odradzam.

   Polecam b), jeśli i tak planujesz własną domenę dla strony, a w przeciwnym razie a). Każda opcja to koszt albo publikacja, więc decyzja należy do Ciebie.
2. **Kopia poza serwerem.** Kopie leżą na tym samym dysku co baza. Warto je co jakiś czas wysyłać gdzie indziej (np. szyfrowane do chmury), ale wybór miejsca to decyzja o przekazaniu danych osobom trzecim.
3. **Uruchomienie zbierania danych.** Ustawienie `apiUrl` na gałęzi `main` (GitHub Pages) oznacza start zbierania danych osobowych (rok urodzenia, wykształcenie). Wcześniej potrzebna jest opublikowana polityka prywatności (szkic powstanie w etapie 5, do Twojej weryfikacji). Dlatego zmiany frontendu trzymam na gałęzi `rozbudowa` i nie scalam ich do `main`.
4. **Przegląd kandydatów do testu słownictwa.** Plik `vocab/kandydaci/kandydaci.tsv` jest na VPS-ie (`~/projects/testiq-pl/vocab/kandydaci/`). Potrzeba co najmniej 5 zatwierdzonych zadań na pasmo, a najlepiej po 10–15, żeby mieć zapas na wymianę słabych zadań po analizie. Po przeglądzie: `python3 vocab/approve.py`. Zatwierdzone zadania staną się publiczne przy scaleniu do `main`.
5. **Licencja share-alike (wordfreq, CC BY-SA 4.0).** Pasma trudności wyliczamy z danych wordfreq. Czy lista zadań z pasmami jest „utworem zależnym” bazy, który też musi być na CC BY-SA? To pytanie prawne (LEGAL-TODO.md). Bezpieczna alternatywa: publikować zadania bez informacji o częstości (pasmo tylko jako kolejność), albo wyznaczać pasma z własnych danych o trudności (etap 4), gdy je zbierzemy.
6. **Wypchnięcie gałęzi na GitHub.** Commity są tylko lokalnie. Wypchnięcie gałęzi `rozbudowa` (bez scalania do `main`) nie zmienia strony, ale repozytorium jest publiczne, więc kod i dokumentacja (w tym LEGAL-TODO.md i szkic polityki) staną się widoczne.
