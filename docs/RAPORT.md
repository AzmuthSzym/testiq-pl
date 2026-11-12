# Projekt płatnego raportu szczegółowego

Status: **projekt**. Płatności nie są uruchomione i nic w kodzie ich nie
obsługuje. Dokument opisuje, co raport miałby zawierać, kiedy ma sens go
sprzedawać i czego uczciwie nie obiecujemy.

## Warunek wstępny: kiedy raport w ogóle ma sens

Raport ma wartość dopiero wtedy, gdy liczby w nim coś znaczą. Proponowane
progi (do decyzji właściciela):

1. **Normy.** Każdy test w raporcie ma co najmniej 400 osób w próbie (status
   „normy”, PROGRESS.md 4.3), a grupy wieku, z którymi porównujemy, co
   najmniej 100 osób.
2. **Jakość zadań.** Analiza zadań (etap 4) jest zrobiona na prawdziwych
   danych, a słabe zadania wymienione w nowej wersji testu. Rzetelność każdego
   testu to co najmniej 0,80 (alfa lub omega).
3. **Korelacje między testami** są oszacowane z danych (osoby, które
   rozwiązały kilka testów), a nie założone, bo od nich zależy wynik łączny.
4. **Darmowy wynik pozostaje darmowy.** Wynik, rozkład, estymacja IQ z
   przedziałem i wynik łączny są bezpłatne. Raport dodaje szczegóły i
   wyjaśnienia, a nie „odblokowuje” liczby schowane za płatnością. Inaczej
   zachęcalibyśmy do płacenia za samą liczbę IQ, czego nie chcemy.

## Zawartość raportu

1. **Podsumowanie na jednej stronie**
   - wynik łączny na skali IQ z przedziałem 95% i opisem słownym, który nie
     przesadza (np. „wynik w przedziale typowym dla połowy uczestników”);
   - liczba testów, z których powstał, i ich łączna rzetelność;
   - jedno zdanie o grupie porównawczej (wiek, liczebność, że to ochotnicy).
2. **Profil zdolności**
   - wykres wyników z każdego testu z przedziałami ufności;
   - **różnice między testami tylko wtedy, gdy są statystycznie wiarygodne.**
     Różnica dwóch wyników musi przekraczać krytyczną różnicę wyliczoną z
     rzetelności obu testów. W przeciwnym razie raport mówi wprost, że profil
     jest „płaski w granicach błędu pomiaru”.
3. **Szczegóły każdego testu**
   - wynik w poziomach trudności (np. matryce poziomy 1–4, kostka 1–4 obroty);
   - czasy odpowiedzi na tle innych (szybkość a dokładność);
   - w pamięci roboczej zakres w przód i wspak;
   - jakie typy zadań sprawiły trudność (np. „działania na odcinkach” w
     matrycach). To opis wyniku, a nie diagnoza przyczyn.
4. **Jakość pomiaru**
   - ostrzeżenia, jeśli wynik może być niewiarygodny: bardzo szybkie
     odpowiedzi, wzór odpowiedzi typowy dla zgadywania, przerwany test,
     powtórne podejście;
   - wtedy raport zaleca ponowne rozwiązanie testu w lepszych warunkach
     zamiast podawać pewne liczby.
5. **Jak czytać wynik**
   - czym jest przedział ufności, krótko i z przykładem;
   - co mierzy każdy test i czego nie mierzy (z Metodologii);
   - informacja, gdzie szukać profesjonalnej diagnozy (poradnie
     psychologiczno-pedagogiczne, psycholog), jeśli ktoś ma konkretną potrzebę.
6. **Aneks techniczny**
   - wersje testów, liczebność prób, rzetelności, data wygenerowania norm.

## Czego uczciwie nie obiecujemy

- **Diagnozy.** Raport nie stwierdza niepełnosprawności intelektualnej,
  wybitnych uzdolnień, ADHD, dysleksji ani żadnych zaburzeń. Nie nadaje się do
  orzecznictwa, rekrutacji, edukacji ani leczenia.
- **„Prawdziwego IQ”.** Wynik to pozycja względem ochotników rozwiązujących
  testy online, a nie wynik standaryzowanego testu na reprezentatywnej próbie
  Polaków. Mówimy to w raporcie wprost.
- **Dokładności lepszej niż przedział.** Nie podajemy pojedynczej liczby bez
  przedziału ani centyli z dokładnością do 1%.
- **Rad typu „jak podnieść IQ”** ani „treningu mózgu”. Nie mamy dowodów, że
  ćwiczenie podobnych zadań podnosi ogólne zdolności, a nie tylko wynik w
  tych zadaniach.
- **Porównań z celebrytami** ani tabel „IQ zawodów”.
- **Opisów osobowości** ani przewidywań sukcesu życiowego na podstawie wyniku.

## Kwestie do decyzji przed uruchomieniem

- Format: PDF generowany na serwerze albo strona dostępna pod jednorazowym
  linkiem. Link wymaga przechowywania wyników przypisanych do zakupu, więc
  zmienia zakres danych osobowych (dane płatności, e-mail) i politykę
  prywatności.
- Powiązanie raportu z wynikami: dziś wyniki są anonimowe (losowy
  identyfikator). Raport oznacza powiązanie identyfikatora z kupującym.
- Prawo konsumenckie (odstąpienie od umowy przy treściach cyfrowych),
  regulamin i faktury: patrz LEGAL-TODO.md.
