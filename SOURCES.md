# Źródła

Prace i zasoby, z których projekt korzysta (metody, a nie gotowe zadania), oraz
zasoby sprawdzone i odrzucone. Każdy wpis zweryfikowałem w sieci w dniu
podanym przy wpisie: dane bibliograficzne, a przy zasobach także licencję.
Przy pracach, których pełnego tekstu nie czytałem, piszę wprost, na podstawie
czego je opisuję.

Żadne zadanie w projekcie nie pochodzi z cudzego testu. Wszystkie zadania
generuje program, który też wylicza poprawną odpowiedź.

## Metody

### Rotacja umysłowa (test „Obracanie kostki”)
- **Shepard, R. N., & Metzler, J. (1971). Mental rotation of three-dimensional objects.** *Science, 171*(3972), 701–703. https://doi.org/10.1126/science.171.3972.701 (zweryfikowano 2026-11-12; PubMed).
  - Klasyczny wynik: czas porównania dwóch obrazów rośnie liniowo z kątem obrotu. U nas jest to uzasadnienie, żeby zapisywać czasy reakcji i analizować je według liczby obrotów.
- **Ekstrom, R. B., French, J. W., Harman, H. H., & Dermen, D. (1976). Kit of Factor-Referenced Cognitive Tests.** Educational Testing Service. https://www.ets.org/research/policy_research_reports/publications/report/1979/impn.html (zweryfikowano 2026-11-12).
  - Zestaw zawiera m.in. test porównywania kostek (Cube Comparisons). ETS udostępnia go **wyłącznie do badań**, na podstawie umowy.
  - Korzystamy tylko z ogólnej idei typu zadania (kostka z symbolami na ściankach). Zadań nie kopiujemy; nasze są generowane i mają inną formę (sekwencja przetoczeń, 6 opcji).

### Matryce (test „Matryce”)
- **Carpenter, P. A., Just, M. A., & Shell, P. (1990). What one intelligence test measures: A theoretical account of the processing in the Raven Progressive Matrices Test.** *Psychological Review, 97*, 404–431. Raport techniczny: https://apps.dtic.mil/sti/pdfs/ADA221448.pdf (zweryfikowano 2026-11-12).
  - Taksonomia typów reguł w matrycach (m.in. stała w wierszu, progresja, rozkład trzech wartości, dodawanie i odejmowanie figur) i wynik, że liczba reguł w zadaniu wyjaśnia dużą część trudności. Na tym opieramy reguły generatora i poziomy trudności.
- **Matzen, L. E., Benz, Z. O., Dixon, K. R., Posey, J., Kroger, J. K., & Speed, A. E. (2010). Recreating Raven's: Software for systematically generating large numbers of Raven-like matrix problems with normed properties.** *Behavior Research Methods, 42*(2), 525–541. https://doi.org/10.3758/BRM.42.2.525 (zweryfikowano 2026-11-12).
  - Przykład, że generowane matryce mogą działać podobnie jak oryginalne. Ich kodu (https://github.com/sandialabs/Matrices) **nie używamy**.
- **Mittring, G., & Rost, D. H. (2008). Die verflixten Distraktoren.** *Diagnostica, 54*(4), 193–201. https://doi.org/10.1026/0012-1924.54.4.193 (zweryfikowano dane bibliograficzne 2026-11-12; pełnego tekstu nie czytałem).
  - Wiem tylko tyle, ile podają późniejsze prace: w źle zbudowanych matrycach poprawną odpowiedź da się wskazać bez patrzenia na matrycę, eliminując dystraktory albo licząc powtarzające się cechy w opcjach. Na tej podstawie zbudowaliśmy i przetestowaliśmy dystraktory (PROGRESS.md, 3.1).
- **Praca walidacyjna testu HeiQ** (*Journal of Intelligence*, 11(4), 73), https://www.mdpi.com/2079-3200/11/4/73 (zweryfikowano 2026-11-12).
  - Źródło informacji o pracy Mittringa i Rosta: dystraktory i poprawna odpowiedź mają być zbudowane tak, by poprawnej nie dało się wskazać strategią liczenia.

### Adaptacja testów
- **International Test Commission (2017). The ITC Guidelines for Translating and Adapting Tests (Second Edition).** *International Journal of Testing, 18*(2), 101–134. https://doi.org/10.1080/15305058.2017.1398166 (zweryfikowano dane bibliograficzne 2026-11-12; pełnego tekstu nie czytałem).
  - Nie tłumaczymy cudzych testów, tylko tworzymy własne po polsku. Przy test słownictwa trzeba jednak zastosować wytyczne dotyczące równoważności językowej (do zrobienia razem z tym testem).

## Zasoby sprawdzone

### ICAR (International Cognitive Ability Resource): nie używamy
- Condon, D. M., & Revelle, W. (2014). The international cognitive ability resource: Development and initial validation of a public-domain measure. *Intelligence, 43*, 52–64. https://personality-project.org/revelle/publications/condon.icar.14.pdf (zweryfikowano 2026-11-12).
- **Licencja (stan na 2026-11-12):** ICAR był wcześniej opisywany jako zasób w domenie publicznej. Obecnie zadania i klucze są udostępniane w PsychArchives na licencji **Scientific Use License**, a strona projektu (TU Dortmund) podaje, że ICAR jest przeznaczony **wyłącznie do użytku akademickiego**. Źródła: https://sms.statistik.tu-dortmund.de/en/research/projects/completed-research-projects/international-cognitive-ability-resource-icar/ i https://psycharchives.org/en/item/be35b8b4-2bc7-4691-964d-52cfc1cf17a9
- **Wniosek:** na stronie, która może kiedyś mieć płatny raport, **nie używamy zadań ICAR** ani jego parametrów. Ewentualne użycie do badań walidacyjnych (np. porównanie naszych wyników z ICAR w osobnym badaniu akademickim) wymaga lektury pełnej licencji i jest pytaniem do właściciela projektu.

### Listy frekwencyjne polszczyzny (do testu słownictwa)
| Zasób | Licencja (sprawdzona 2026-11-12) | Użytek komercyjny |
|---|---|---|
| **wordfreq** (Robyn Speer), https://github.com/rspeer/wordfreq | kod: Apache 2.0; dane: **CC BY-SA 4.0**, część danych z SUBTLEX za zgodą autorów „do dowolnego celu” z uznaniem autorstwa | **Tak**, z uznaniem autorstwa i na tych samych warunkach (share-alike). Polski: 6 źródeł (Wikipedia, napisy filmowe, wiadomości, OSCAR, Twitter, Reddit). Dane zamrożone na stanie ok. 2021. |
| Leipzig Corpora Collection, https://wortschatz.uni-leipzig.de/en/usage | CC BY-NC | **Nie** (NC = niekomercyjnie) |
| SUBTLEX-PL (Mandera i in.), https://research.tilburguniversity.edu/en/publications/subtlex-pl-subtitle-based-word-frequency-estimates-for-polish/ | „swobodnie dostępne do celów badawczych” | **Niejasne**, nie używamy bez zgody autorów |
| Listy NKJP / KWJP (IPI PAN), https://kwjp.ipipan.waw.pl/lists/doc/about/en | nie udało się sprawdzić (serwer niedostępny 2026-11-12) | do sprawdzenia |

Szczegóły decyzji: PROGRESS.md, etap 3.4.

### Synonimy
- **plWordNet (Słowosieć)**, Politechnika Wrocławska, https://clarin-pl.eu/dspace/handle/11321/273 (zweryfikowano 2026-11-12). Według CLARIN-PL jest udostępniany bezpłatnie do wszelkich zastosowań, także komercyjnych, na licencji wzorowanej na licencji Princeton WordNet. Pełny tekst licencji jest w pliku LICENSE pobranej wersji (szczegóły: PROGRESS.md, 3.4).
