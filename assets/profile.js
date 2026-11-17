// Strona główna: „Twój profil” — wyniki rozwiązanych testów (zapisane w tej
// przeglądarce) i wynik łączny z marginesem błędu, który maleje z liczbą testów.
(function (root) {
  'use strict';
  const T = root.TestIQ;
  const TESTS = [
    { id: 'kostka-v2', name: 'Obracanie kostki', href: 'kostka/' },
    { id: 'matryce-v1', name: 'Matryce', href: 'matryce/' },
    { id: 'ciagi-v1', name: 'Ciągi liczbowe', href: 'ciagi/' },
    { id: 'pamiec-v1', name: 'Pamięć robocza', href: 'pamiec/' },
    { id: 'slownictwo-v1', name: 'Słownictwo', href: 'slownictwo/' },
    { id: 'zdania-v1', name: 'Zdania', href: 'zdania/' },
  ];
  // Założony ładunek czynnika ogólnego każdego testu, dopóki nie oszacujemy
  // go z danych (korelacje między testami u tych samych uczestników).
  const ASSUMED_LOADING = 0.7;

  function render(el) {
    const done = TESTS.map((t) => {
      const raw = T.store.get('testiq-last-' + t.id);
      if (!raw) return null;
      try {
        const r = JSON.parse(raw);
        return Object.assign({}, t, { score: T.scoreOf(t.id, r.responses).points, meta: r.meta || {} });
      } catch (e) { return null; }
    }).filter(Boolean);
    if (!done.length) return Promise.resolve();
    el.hidden = false;
    return Promise.all(done.map((t) => T.fetchNorms(t.id).then((norms) => {
      if (!norms || T.assisted(t.meta)) return t;  // test z pomocą: bez IQ i bez wyniku łącznego
      const norm = T.normFor(norms, t.meta.birthYear);
      return Object.assign(t, { est: T.toIQ(t.score, norm, norms.reliability), reliability: norms.reliability });
    }))).then((rows) => {
      const withIq = rows.filter((t) => t.est);
      let summary = '<p class="note">Wynik łączny pokażemy, gdy rozwiążesz co najmniej dwa testy, które mają już wystarczająco dużo danych do porównań.</p>';
      if (withIq.length >= 2) {
        const c = T.composite(withIq.map((t) => t.est), withIq.map(() => ASSUMED_LOADING));
        summary = `
          <div class="card iq">
            <div class="kicker">Wynik łączny · estymacja wstępna</div>
            <p class="iq-value">Ogólna zdolność: około <strong>${Math.round(c.iq)}</strong> <span class="note">(przedział 95%: ${Math.round(c.lo)}–${Math.round(c.hi)})</span></p>
            <p class="note">Z ${c.k} testów (rzetelność łącznie ${c.reliability.toFixed(2).replace('.', ',')}). Każdy kolejny test zawęża przedział, bo błędy pomiaru poszczególnych testów częściowo się znoszą.</p>
            <p class="note">Wynik łączny zakłada, że testy są ze sobą skorelowane w podobnym stopniu (ok. ${String(ASSUMED_LOADING ** 2).replace('.', ',')}). To założenie robocze: zastąpimy je korelacjami policzonymi z danych, gdy zbierzemy wyniki tych samych osób z kilku testów. Porównanie dotyczy ochotników rozwiązujących testy na tej stronie, a nie populacji Polski.</p>
          </div>`;
      }
      el.innerHTML = `
        <h2>Twój profil</h2>
        <p class="note">Na podstawie testów rozwiązanych w tej przeglądarce. Dane nie opuszczają twojego urządzenia, chyba że przy teście wyraziłeś zgodę.</p>
        <table class="res">
          <tr><th>Test</th><th>Wynik</th><th>Na skali IQ</th></tr>
          ${rows.map((t) => `<tr><td><a href="${t.href}">${t.name}</a></td><td>${T.fmtPoints(t.score)}</td>
            <td>${t.est ? `${t.est.iq} <span class="note">(${t.est.lo}–${t.est.hi})</span>` : `<span class="note">${T.assisted(t.meta) ? 'rozwiązany z pomocą' : 'zbieramy dane'}</span>`}</td></tr>`).join('')}
        </table>
        ${summary}`;
    });
  }

  root.TestIQProfile = { render, TESTS, ASSUMED_LOADING };
})(window);
