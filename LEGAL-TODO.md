# Sprawy prawne i licencyjne do sprawdzenia przed startem

**Zastrzeżenie: nie jestem prawnikiem.** To lista pytań i ryzyk, które
zauważyłem przy budowie projektu, a nie porada prawna. Każdy punkt oznaczony
⚖️ wymaga sprawdzenia przez prawnika (najlepiej znającego RODO i prawo
konsumenckie) przed uruchomieniem zbierania danych, a tym bardziej przed
płatnościami.

## 1. Licencje źródeł

- [ ] ⚖️ **wordfreq (CC BY-SA 4.0).** Pasma trudności w teście słownictwa
  wynikają z częstości słów z wordfreq.
  - Czy plik zadań (`slownictwo/items.json`) lub sam test jest „utworem
    zależnym” bazy, który też musi być udostępniony na CC BY-SA 4.0?
  - Jeśli tak: czy to przeszkadza (zadania byłyby wtedy na otwartej
    licencji, każdy mógłby je kopiować)?
  - Alternatywa: wyznaczać trudność z własnych danych o odpowiedziach.
  - Autor wordfreq wprost odradza przerabianie danych na pliki CSV bez
    informacji o licencji. Plik kandydatów jest tylko lokalny i nie jest
    rozpowszechniany, ale warto to potwierdzić.
- [ ] **plWordNet.** Licencja pozwala na użytek komercyjny pod warunkiem
  zachowania informacji o prawach autorskich i zastrzeżeń na wszystkich
  kopiach. Informacja jest w `slownictwo/items.json`, w stopce testu i na
  stronie Źródła.
  - Do potwierdzenia, czy to wystarcza w formie, w jakiej pokazujemy słowa.
  - Licencja zabrania używania nazwy Politechniki Wrocławskiej w reklamie,
    więc nie piszemy „test Politechniki”.
- [ ] **wordfreq zawiera dane z wielu źródeł** (Wikipedia, OpenSubtitles,
  SUBTLEX, Twitter, Reddit, OSCAR) z własnymi warunkami. Do sprawdzenia, czy
  używanie samych częstości słów nie narusza warunków któregoś z nich.
- [ ] **ICAR.** Nie używamy zadań ani parametrów: licencja to Scientific Use
  License (tylko do celów naukowych). Gdyby planowane było badanie
  walidacyjne z ICAR, trzeba przeczytać pełną licencję.
- [ ] **ETS Kit of Factor-Referenced Cognitive Tests.** Nie kopiujemy zadań.
  Typ zadania (kostka z symbolami) jest ogólną ideą stosowaną w wielu
  testach.
  - Do potwierdzenia, że idea formatu zadania nie jest chroniona.
  - Nasze zadania mają inną formę: sekwencję przetoczeń i 6 opcji.
- [ ] **Czcionki.** EB Garamond i Inter na SIL Open Font License 1.1 są
  serwowane lokalnie, a pliki licencji są w `assets/fonts/`. Licencja
  pozwala na użytek komercyjny.
- [ ] **Nazwa „Test IQ PL”.** Sprawdzić znaki towarowe (EUIPO, UPRP) i domenę.
  „IQ” w nazwie może sugerować standaryzowany test IQ, co wiąże się z
  pkt 4 (wprowadzanie w błąd).
- [ ] **Licencja własnego kodu i zadań.** Repozytorium jest publiczne, a nie
  ma pliku LICENSE, więc domyślnie „wszelkie prawa zastrzeżone”. Decyzja
  właściciela: zostawić tak czy wybrać licencję. Uwaga: publiczny kod
  generatorów oznacza, że każdy może wygenerować i poznać klucze.

## 2. RODO

- [ ] ⚖️ **Administrator danych i dane kontaktowe:** uzupełnić w szkicu
  polityki prywatności (`prywatnosc/`).
- [ ] ⚖️ **Podstawa prawna:** zgoda (art. 6 ust. 1 lit. a).
  - Czy treść zgody w formularzu jest wystarczająco konkretna i świadoma?
  - Czy wymaga osobnej zgody na każdy test, czy wystarczy jedna?
- [ ] ⚖️ **Czy wyniki testów zdolności poznawczych to dane szczególnej
  kategorii (art. 9)?** Nie są to dane o zdrowiu wprost, ale w połączeniu z
  innymi informacjami mogłyby o nim świadczyć. Od odpowiedzi zależą wymogi
  (wyraźna zgoda, ocena skutków).
- [ ] ⚖️ **Czy dane są w ogóle osobowe:**
  - losowy identyfikator, rok urodzenia, wykształcenie i data;
  - bez IP i bez danych kontaktowych;
  - prawdopodobnie tak (identyfikator w przeglądarce), więc stosujemy RODO w
    całości. Do potwierdzenia.
- [ ] ⚖️ **Wiek zgody:**
  - Strona i serwer odrzucają wyniki osób poniżej 16 lat, jeśli podały rok
    urodzenia. Jeśli nie podały, polegamy na oświadczeniu w treści zgody.
  - Czy to wystarcza?
- [ ] ⚖️ **Przechowywanie w przeglądarce (`localStorage`) bez zgody:** losowy
  identyfikator i wyniki uczestnika na jego urządzeniu.
  - Prawo telekomunikacyjne (dawniej art. 173 Pt, teraz Prawo komunikacji
    elektronicznej) wymaga zgody na przechowywanie informacji na urządzeniu,
    chyba że jest to niezbędne do usługi, której użytkownik żąda.
  - Czy wynik i profil to taka usługa?
- [ ] ⚖️ **Prawa osób** (dostęp, usunięcie, wycofanie zgody):
  - potrzebny sposób na pokazanie uczestnikowi jego identyfikatora i adres do
    wysyłania żądań;
  - w kodzie: endpoint lub narzędzie administracyjne do usunięcia wyników po
    identyfikatorze (do zrobienia).
- [ ] ⚖️ **Okres przechowywania:**
  - wpisać konkretny okres;
  - kopie zapasowe są przechowywane 14 dni;
  - czy usunięcie na żądanie musi obejmować kopie?
- [ ] ⚖️ **Rejestr czynności przetwarzania** i ewentualna ocena skutków
  (DPIA), zależnie od odpowiedzi na pytanie o art. 9.
- [ ] ⚖️ **Podmioty przetwarzające i przekazywanie poza EOG:**
  - dostawca VPS (umowa powierzenia);
  - GitHub Pages: GitHub, USA, widzi adresy IP odwiedzających. Czy
    wystarczy EU-US Data Privacy Framework i wzmianka w polityce?
  - Jeśli API stanie za Cloudflare (pytanie 1 w PROGRESS.md), to kolejny
    podmiot, także z USA.
- [ ] **Limit zgłoszeń:** skrót IP z dzienną solą tylko w pamięci, nie na
  dysku, a dzienniki nginx i uvicorn nie zapisują IP. Do opisania w rejestrze
  jako środek minimalizacji.
- [ ] **Publikacja zbiorcza:** statystyki grup wieku pokazujemy od 30 osób.
  Czy raport lub ewentualne udostępnienie danych badaczom wymaga dodatkowej
  anonimizacji?

## 3. Regulamin i prawo konsumenckie (dopiero przy płatnym raporcie)

- [ ] ⚖️ **Regulamin świadczenia usług drogą elektroniczną** (ustawa o
  świadczeniu usług drogą elektroniczną) jest wymagany już dla darmowej
  usługi. Do przygotowania przed startem.
- [ ] ⚖️ **Raport jako treść cyfrowa:**
  - prawo odstąpienia od umowy (14 dni) i jego wygaśnięcie po dostarczeniu
    treści za wyraźną zgodą konsumenta (ustawa o prawach konsumenta);
  - obowiązki informacyjne przed zakupem.
- [ ] ⚖️ **Niezgodność treści cyfrowej z umową:** czym jest raport „zgodny z
  umową”? Opis w regulaminie musi odpowiadać temu, co raport naprawdę
  zawiera (docs/RAPORT.md).
- [ ] ⚖️ **Ceny i promocje** (dyrektywa Omnibus, informacja o najniższej cenie
  z 30 dni przed obniżką).
- [ ] ⚖️ **Płatności:**
  - operator płatności;
  - faktury lub paragony (kasa fiskalna online przy sprzedaży konsumentom?);
  - VAT od usług elektronicznych dla konsumentów z innych krajów UE (OSS).
- [ ] ⚖️ **Forma działalności** (działalność nierejestrowana, JDG, spółka) i
  związane z nią limity.

## 4. Ryzyko wprowadzania w błąd i odpowiedzialność

- [ ] ⚖️ **Nieuczciwe praktyki rynkowe:** czy nazwa „Test IQ” i przeliczanie na
  skalę IQ przy próbie ochotniczej nie wprowadzają w błąd? Obecnie strona
  wszędzie pisze „estymacja wstępna” i opisuje próbę. Należy to utrzymać
  także w materiałach marketingowych.
- [ ] ⚖️ **Wyłączenie odpowiedzialności** za decyzje podjęte na podstawie
  wyniku, w regulaminie.
- [ ] ⚖️ **Testy psychologiczne a ustawa o zawodzie psychologa:** czy
  udostępnianie testów zdolności online i interpretacja wyników (zwłaszcza w
  płatnym raporcie) nie wchodzi w zakres czynności zastrzeżonych dla
  psychologów? Raport nie stawia diagnoz (docs/RAPORT.md), ale granicę
  powinien ocenić prawnik.
