// Wspólny przebieg testu: opis z przykładem, formularz i zgoda, zadania
// z limitem czasu, zapis odpowiedzi i czasów reakcji, ekran wyniku.
// Każdy test podaje konfigurację (patrz opis TestRunner.start niżej).
// Wymaga assets/testiq-common.js.
(function (root) {
  'use strict';
  const T = root.TestIQ;

  // config:
  //   id, version            identyfikator wersji testu (np. 'matryce-v1') i wersja generatora
  //   kicker, title, lead    nagłówek ekranu startowego
  //   instructions           HTML instrukcji
  //   timeLimit              sekundy na cały test albo null (bez zegara)
  //   items                  () => tablica zadań (generowana z ziarnem)
  //   question               tekst nad zadaniem (albo funkcja item => tekst)
  //   renderItem(box, item, answer, ctx)
  //                          rysuje zadanie; answer(choice, correct, extra) zapisuje
  //                          odpowiedź (tylko pierwsze wywołanie się liczy).
  //                          ctx.example = true w przykładzie.
  //   example                () => zadanie przykładowe (albo null)
  //   exampleFeedback(choice, correct, item) => tekst po odpowiedzi w przykładzie
  //   levelOf(item)          poziom trudności (do tabeli wyników)
  //   levelLabel(level)      opis poziomu w tabeli
  //   shouldStop(responses, items, next)  true = koniec testu przed `next`
  //                          (np. reguła przerwania w teście pamięci)
  //   chanceNote             zdanie o wyniku przy zgadywaniu (albo '')
  //   meaning                HTML sekcji „Co ten wynik znaczy”
  //   maxScore               maksymalna liczba punktów (domyślnie liczba zadań)
  function start(config) {
    const app = document.getElementById('app');
    const h = (html) => { app.innerHTML = html; root.scrollTo(0, 0); };
    const questionFor = (item) => (typeof config.question === 'function' ? config.question(item) : config.question);

    function intro() {
      h(`
        <div class="kicker">${config.kicker}</div>
        <h1>${config.title}</h1>
        <p class="lead">${config.lead}</p>
        ${config.instructions}
        ${config.example ? `<h2>Przykład</h2>
          <p class="question" id="exq"></p>
          <div id="example"></div>
          <p class="note" id="exnote" aria-live="polite">Odpowiedz, żeby zobaczyć, czy odpowiedź jest poprawna.</p>` : ''}
        ${T.META_FORM}
        <p><button class="btn" id="start">Rozpocznij test</button></p>
      `);
      if (config.example) {
        const ex = config.example();
        document.getElementById('exq').textContent = questionFor(ex);
        let done = false;
        config.renderItem(document.getElementById('example'), ex, (choice, correct) => {
          if (done) return false;
          done = true;
          document.getElementById('exnote').textContent = config.exampleFeedback(choice, correct, ex)
            + ' W prawdziwym teście nie zobaczysz, czy odpowiedź jest poprawna.';
          return true;
        }, { example: true });
      }
      document.getElementById('start').addEventListener('click', () => run(T.readMeta()));
    }

    function run(meta) {
      const items = config.items();
      const responses = [];
      const t0 = Date.now();
      let idx = 0, finished = false, timer = null;
      h(`
        <div class="testbar"><span class="kicker" id="count" aria-live="polite"></span>
          <span class="timer" id="timer" ${config.timeLimit ? 'role="timer" aria-label="Pozostały czas"' : ''}></span></div>
        <div class="progress"><div id="bar"></div></div>
        <p class="question" id="question"></p>
        <div id="item"></div>
      `);
      if (config.timeLimit) {
        const timerEl = document.getElementById('timer');
        const tick = () => {
          const left = Math.max(0, config.timeLimit - Math.floor((Date.now() - t0) / 1000));
          timerEl.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
          timerEl.classList.toggle('low', left <= 60);
          if (left === 0) finish(true);
        };
        timer = setInterval(tick, 250);
        tick();
      }
      T.guardUnload(true);

      function show() {
        if (finished) return;
        if (idx >= items.length || (config.shouldStop && config.shouldStop(responses, items, idx))) {
          finish(false);
          return;
        }
        document.getElementById('count').textContent = 'Zadanie ' + (idx + 1) + ' z ' + items.length;
        document.getElementById('bar').style.width = (idx / items.length * 100) + '%';
        document.getElementById('question').textContent = questionFor(items[idx]);
        const box = document.getElementById('item');
        box.innerHTML = '';
        const item = items[idx];
        let tShown = Date.now();
        let answered = false;
        config.renderItem(box, item, (choice, correct, extra) => {
          // jedna odpowiedź na zadanie; drugie kliknięcie nie trafia do następnego
          if (answered || finished) return false;
          answered = true;
          responses.push(Object.assign({
            item: idx + 1, level: config.levelOf(item), choice, correct, ms: Date.now() - tShown,
          }, extra || {}));
          idx++;
          setTimeout(show, 180);
          return true;
        }, { example: false, restartClock: () => { tShown = Date.now(); } });
      }

      function finish(timedOut) {
        if (finished) return;
        finished = true;
        if (timer) clearInterval(timer);
        T.guardUnload(false);
        T.onKeys(null);
        const result = {
          test: config.id, version: config.version, participant: T.participantId(),
          startedAt: new Date(t0).toISOString(), durationMs: Date.now() - t0, timedOut,
          meta, responses,
        };
        T.store.set('testiq-last-' + config.id, JSON.stringify(result));
        // statystyki pobieramy dopiero po zapisie, żeby obejmowały ten wynik
        results(result, items, T.sendResult(result));
      }
      show();
    }

    function results(r, items, sent) {
      const score = r.responses.filter((x) => x.correct).length;
      const maxScore = config.maxScore || items.length;
      const levels = [...new Set(items.map(config.levelOf))];
      const rows = levels.map((lv) => {
        const total = items.filter((it) => config.levelOf(it) === lv).length;
        const sub = r.responses.filter((x) => x.level === lv);
        const ok = sub.filter((x) => x.correct).length;
        const ms = sub.length ? Math.round(sub.reduce((a, x) => a + x.ms, 0) / sub.length / 100) / 10 : null;
        return `<tr><td>${config.levelLabel(lv)}</td><td>${ok} / ${total}</td><td>${ms === null ? '—' : ms.toString().replace('.', ',') + ' s'}</td></tr>`;
      }).join('');
      const answered = r.responses.length;
      const fast = r.responses.filter((x) => x.ms < 1500).length;
      h(`
        <div class="kicker">Wynik</div>
        <h1>${config.title}</h1>
        <div class="card">
          <div class="score">${score} <span class="note">/ ${maxScore}</span></div>
          <p class="note">${config.chanceNote || ''}${r.timedOut ? ` Skończył się czas (odpowiedzi: ${answered} z ${items.length}).` : ''}</p>
          ${fast >= 5 ? `<p class="note">${fast} odpowiedzi padło w mniej niż 1,5 sekundy. Taki wynik może nie odzwierciedlać twoich możliwości.</p>` : ''}
        </div>
        <table class="res">
          <tr><th>Poziom</th><th>Poprawne</th><th>Średni czas</th></tr>
          ${rows}
        </table>
        <h2>Na tle innych uczestników</h2>
        <div id="compare"></div>
        <h2>Co ten wynik znaczy</h2>
        ${config.meaning}
        <p><button class="btn ghost" id="dl">Pobierz dane (JSON)</button> <a class="btn ghost" href="../">Wróć</a></p>
      `);
      Promise.resolve(sent).then(() => T.renderComparison(document.getElementById('compare'), config.id, score));
      document.getElementById('dl').addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }));
        a.download = config.id + '-' + r.startedAt.slice(0, 10) + '.json';
        a.click();
      });
    }

    intro();
  }

  root.TestRunner = { start };
})(window);
