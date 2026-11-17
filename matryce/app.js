(function () {
  'use strict';
  const M = window.MatrixCore, MR = window.MatrixRender, T = window.TestIQ;
  const LETTERS = 'ABCDEFGH';
  const N_ITEMS = 16;

  function renderItem(box, item, answer) {
    box.appendChild(MR.drawMatrix(item.cells));
    const grid = document.createElement('div');
    grid.className = 'options moptions';
    item.options.forEach((cell, i) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.type = 'button';
      b.setAttribute('aria-label', 'Odpowiedź ' + LETTERS[i] + ': ' + MR.describe(cell));
      const l = document.createElement('div');
      l.className = 'lbl';
      l.textContent = LETTERS[i];
      b.appendChild(l);
      b.appendChild(MR.drawCell(cell));
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

  TestRunner.start({
    id: 'matryce-v1',
    version: 1,
    kicker: 'Rozumowanie abstrakcyjne · 16 zadań · 15 minut',
    title: 'Matryce',
    lead: 'Test rozumowania: trzeba znaleźć reguły, według których zmieniają się figury, i zastosować je do brakującego pola.',
    instructions: `
      <p>Każde zadanie to siatka 3 × 3 z jednym pustym polem. W każdym wierszu figury zmieniają się według tych samych reguł: na przykład zmienia się liczba figur, kształt, wielkość, wypełnienie, obrót albo odcinki w tle. Znajdź reguły i wybierz figurę, która pasuje do pustego pola.</p>
      <p>Reguł bywa kilka naraz. W trudniejszych zadaniach odcinki w trzecim polu wiersza powstają z dwóch pierwszych, na przykład przez dodanie albo odjęcie.</p>
      <p>Odpowiadasz kliknięciem albo klawiszem A–H. Nie da się wrócić do poprzedniego zadania. Nie odświeżaj strony w trakcie testu: odpowiedzi przepadną.</p>`,
    timeLimit: 15 * 60,
    items: () => M.generateItems('matryce-v1', N_ITEMS),
    question: 'Która figura pasuje do pustego pola?',
    renderItem,
    example: () => M.generateItems('matryce-przyklad', 4)[0],
    exampleFeedback: (choice, correct, item) => (correct ? 'Dobrze.' : 'Poprawna odpowiedź to ' + LETTERS[item.answer] + '.'),
    levelOf: (item) => item.level,
    levelLabel: (lv) => ['', 'Poziom 1 (reguły stałe)', 'Poziom 2', 'Poziom 3', 'Poziom 4 (z odcinkami)'][lv],
    chanceNote: 'Losowe zgadywanie daje średnio 2 punkty.',
    meaning: `<p>Wynik na skali IQ liczymy względem innych uczestników. Wystarczy 30 osób, żeby podać estymację wstępną z przedziałem błędu, który zawęża się z każdą kolejną osobą. Jeśli podasz rok urodzenia, a w twojej grupie wieku jest dość osób, porównujemy cię z rówieśnikami.</p>
      <p class="note">Matryce mierzą rozumowanie na nowym materiale (tzw. inteligencję płynną). To jeden z wielu aspektów zdolności poznawczych, a nie pełna ocena inteligencji.</p>`,
  });
})();
