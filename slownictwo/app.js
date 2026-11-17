(function () {
  'use strict';
  const V = window.VocabCore, T = window.TestIQ;
  const LETTERS = 'ABCDE';
  const TEST_ID = 'slownictwo-v1';

  function renderItem(box, item, answer) {
    const word = document.createElement('div');
    word.className = 'vocab-word';
    word.textContent = item.word;
    box.appendChild(word);
    const grid = document.createElement('div');
    grid.className = 'vocab-options';
    item.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'opt vocab-opt';
      b.type = 'button';
      b.innerHTML = `<span class="lbl">${LETTERS[i]}</span> `;
      b.appendChild(document.createTextNode(opt));
      b.addEventListener('click', () => {
        if (answer(i, i === item.answer) !== false) {
          b.classList.add('picked');
          if (box.closest('#example')) grid.children[item.answer].classList.add('right');
        }
      });
      grid.appendChild(b);
    });
    box.appendChild(grid);
    T.onKeys((e) => {
      const i = T.choiceFromKey(e, item.options.length);
      if (i >= 0) { e.preventDefault(); grid.children[i].click(); }
    });
  }

  function unavailable() {
    document.getElementById('app').innerHTML = `
      <div class="kicker">Słownictwo</div>
      <h1>Test w przygotowaniu</h1>
      <p>Zadania tego testu są jeszcze sprawdzane ręcznie. Każde musi przejść przegląd, zanim trafi do testu.</p>
      <p><a class="btn ghost" href="../">Wróć</a></p>`;
  }

  fetch('items.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((data) => {
    const bank = data && Array.isArray(data.items) ? data.items : [];
    const items = V.buildItems(bank, TEST_ID);
    if (!items) { unavailable(); return; }
    const example = { level: 0, word: 'auto', options: ['samochód', 'droga', 'zegar', 'okno', 'pociąg'], answer: 0 };
    TestRunner.start({
      id: TEST_ID,
      version: 1,
      kicker: 'Rozumienie słów · ' + items.length + ' zadań · 6 minut',
      title: 'Słownictwo',
      lead: 'Test znajomości słów: trzeba wskazać słowo o tym samym albo bardzo podobnym znaczeniu.',
      instructions: `
        <p>Zobaczysz słowo i pięć innych słów. Wybierz to, które znaczy to samo albo prawie to samo. Słowa są coraz rzadsze.</p>
        <p>Odpowiadasz kliknięciem albo klawiszem A–E. Jeśli nie znasz słowa, wybierz najbardziej prawdopodobną odpowiedź. Nie korzystaj ze słownika ani z wyszukiwarki, bo wynik straci sens.</p>`,
      timeLimit: 6 * 60,
      items: () => items,
      question: 'Które słowo znaczy to samo?',
      renderItem,
      example: () => example,
      exampleFeedback: (choice, correct) => (correct ? 'Dobrze.' : 'Poprawna odpowiedź to A (samochód).'),
      levelOf: (item) => item.level,
      levelLabel: (lv) => 'Pasmo ' + lv + (lv === 1 ? ' (słowa częste)' : lv === 4 ? ' (słowa rzadkie)' : ''),
      chanceNote: 'Losowe zgadywanie daje średnio 4 punkty.',
      meaning: `<p>Wynik na skali IQ liczymy względem innych uczestników, od 30 osób jako estymację wstępną z przedziałem błędu.</p>
        <p class="note">Słownictwo mierzy wiedzę językową (tzw. inteligencję skrystalizowaną). Zależy od wykształcenia, czytania i tego, czy polski jest twoim pierwszym językiem, więc nie należy go porównywać z wynikami osób z innym doświadczeniem językowym.</p>`,
    });
  });
})();
