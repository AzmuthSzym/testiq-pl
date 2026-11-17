(function () {
  'use strict';
  const MC = window.MemoryCore, T = window.TestIQ;

  // Pokazuje cyfry po jednej, potem pole odpowiedzi z klawiaturą ekranową.
  function renderItem(box, item, answer, ctx) {
    T.onKeys(null);
    const stage = document.createElement('div');
    stage.className = 'digit-stage';
    stage.setAttribute('aria-live', 'assertive');
    stage.textContent = 'Uwaga…';
    box.appendChild(stage);
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(() => { if (box.isConnected) fn(); }, ms));
    let t = 800;
    item.digits.forEach((d) => {
      later(t, () => { stage.textContent = d; stage.classList.add('on'); });
      later(t + MC.SHOW_MS, () => { stage.textContent = ''; stage.classList.remove('on'); });
      t += MC.SHOW_MS + MC.GAP_MS;
    });
    later(t + 200, () => showInput());

    function showInput() {
      stage.textContent = item.part === 1 ? 'Wpisz cyfry w tej samej kolejności' : 'Wpisz cyfry od końca';
      stage.classList.add('prompt');
      const form = document.createElement('form');
      form.className = 'answer-row';
      form.innerHTML = `
        <label class="sr-only" for="dig-${ctx.example ? 'ex' : 'test'}">Cyfry</label>
        <input id="dig-${ctx.example ? 'ex' : 'test'}" class="digits-input" type="text" inputmode="numeric" autocomplete="off" maxlength="12">
        <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button type="button" data-d="${d}">${d}</button>`).join('')}
          <button type="button" data-back aria-label="Usuń ostatnią cyfrę">⌫</button><button class="btn" type="submit">OK</button></div>
        <span class="note err" aria-live="polite"></span>`;
      box.appendChild(form);
      const input = form.querySelector('input');
      const err = form.querySelector('.err');
      form.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { input.value += b.dataset.d; }));
      form.querySelector('[data-back]').addEventListener('click', () => { input.value = input.value.slice(0, -1); });
      let done = false;
      const submit = (text, timedOut) => {
        if (done) return;
        if (!timedOut && !MC.normalize(text)) { err.textContent = 'Wpisz cyfry.'; return; }
        done = true;
        clearTimeout(limit);
        input.disabled = true;
        answer(MC.normalize(text), MC.isCorrect(text, item), { span: item.length });
        if (ctx.example) stage.textContent = 'Poprawnie: ' + item.answer.split('').join(' ');
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); submit(input.value, false); });
      // limit czasu na odpowiedź
      const limit = setTimeout(() => { if (box.isConnected) submit(input.value, true); }, MC.RESPONSE_LIMIT_S * 1000);
      if (ctx.restartClock) ctx.restartClock();
      input.focus({ preventScroll: true });
    }
  }

  TestRunner.start({
    id: 'pamiec-v1',
    version: 1,
    kicker: 'Pamięć robocza · ok. 10 minut',
    title: 'Pamięć robocza',
    lead: 'Test pamięci roboczej: trzeba zapamiętać krótki ciąg cyfr i odtworzyć go w tej samej kolejności albo od końca.',
    instructions: `
      <p>Na ekranie pojawiają się cyfry, jedna na sekundę. Po ostatniej cyfrze wpisz je z klawiatury albo przyciskami na ekranie i zatwierdź (Enter albo „OK”).</p>
      <p>W pierwszej części wpisujesz cyfry w tej samej kolejności, a w drugiej od końca: po ciągu 4 7 2 wpiszesz 2 7 4. Ciągi stopniowo się wydłużają. Każda część kończy się, gdy dwa ciągi tej samej długości zostaną odtworzone błędnie.</p>
      <p>Nie zapisuj cyfr i nie powtarzaj ich na głos, bo wynik straci sens. Masz 30 sekund na każdą odpowiedź. Nie odświeżaj strony w trakcie testu: odpowiedzi przepadną.</p>`,
    timeLimit: null,
    items: () => MC.generateItems('pamiec-v1'),
    question: (item) => (item.part === 1 ? 'Część 1: w tej samej kolejności' : 'Część 2: od końca'),
    renderItem,
    example: () => MC.generateItems('pamiec-przyklad')[0],
    exampleFeedback: (choice, correct) => (correct ? 'Dobrze.' : 'Nie tym razem.'),
    levelOf: (item) => item.part,
    levelLabel: (part) => 'Część ' + part + ' (' + MC.PARTS[part].name + ')',
    nextIndex: MC.nextIndex,
    fastMs: 0,
    summary: (r, items) => `<p>Najdłuższy odtworzony ciąg: w przód <strong>${MC.span(r.responses, items, 1) || '—'}</strong>, wspak <strong>${MC.span(r.responses, items, 2) || '—'}</strong> cyfr.</p>`,
    chanceNote: 'Wynik to liczba poprawnie odtworzonych ciągów (maksymalnie 28).',
    meaning: `<p>Wynik na skali IQ liczymy względem innych uczestników. Wystarczy 30 osób, żeby podać estymację wstępną z przedziałem błędu, który zawęża się z każdą kolejną osobą. Jeśli podasz rok urodzenia, a w twojej grupie wieku jest dość osób, porównujemy cię z rówieśnikami.</p>
      <p class="note">Powtarzanie cyfr w przód mierzy głównie krótkotrwałe przechowywanie informacji, a wspak także jej przetwarzanie (pamięć roboczą). Wynik zależy od skupienia i warunków, np. hałasu czy zmęczenia.</p>`,
  });
})();
