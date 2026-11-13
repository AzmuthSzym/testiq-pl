// Wspólne elementy wszystkich testów: zapis lokalny, identyfikator uczestnika,
// formularz danych i zgody, wysyłka wyniku, porównanie z innymi uczestnikami.
(function (root) {
  'use strict';

  // Rozkład wyników innych pokazujemy dopiero od tylu uczestników.
  const MIN_N = 30;
  // Przeliczenie na skalę IQ: od MIN_N_IQ osób jako „estymacja wstępna”,
  // od MIN_N_NORMS jako wynik względem norm (nadal: próba ochotnicza).
  // Te same progi i wzory co w analysis/testiq_analysis/scoring.py.
  const MIN_N_IQ = 30, MIN_N_NORMS = 400;
  const AGE_NOW = new Date().getFullYear();

  // IQ (średnia 100, SD 15) względem normy { n, mean, sd } i przedział 95%.
  // Niepewność: błąd pomiaru (SD·√(1−rzetelność)) i błąd samej normy
  // (średnia i SD znane tylko z próby N osób, metoda delta).
  function toIQ(score, norm, reliability) {
    if (!norm || norm.n < MIN_N_IQ || !norm.sd || reliability === null || reliability === undefined) return null;
    const rel = Math.min(Math.max(reliability, 0), 0.99);
    const seScore = norm.sd * Math.sqrt(1 - rel);
    const z = (score - norm.mean) / norm.sd;
    const seMean = norm.sd / Math.sqrt(norm.n), seSd = norm.sd / Math.sqrt(2 * (norm.n - 1));
    const varZ = (seScore ** 2 + seMean ** 2) / norm.sd ** 2 + (z * seSd / norm.sd) ** 2;
    const se = 15 * Math.sqrt(varZ);
    const iq = 100 + 15 * z;
    // część niepewności z wynikająca z samej normy (do wyniku łącznego)
    const normSe = Math.sqrt((seMean ** 2) / norm.sd ** 2 + (z * seSd / norm.sd) ** 2);
    return { iq: Math.round(iq), lo: Math.round(iq - 1.96 * se), hi: Math.round(iq + 1.96 * se), se, z, normSe, reliability: rel,
      status: norm.n < MIN_N_NORMS ? 'wstepna' : 'normy', n: norm.n };
  }

  // Wynik łączny z kilku testów: pozycja na znormalizowanej sumie wyników z
  // (jak composite() w analysis/testiq_analysis/scoring.py). tests: [{ z,
  // reliability, normSe }]. Korelacje testów z założonych ładunków (R_ij = λ_iλ_j).
  // Rzetelność sumy rośnie z liczbą testów, więc przedział się zawęża; dla
  // jednego testu wynik jest taki sam jak wynik tego testu.
  function composite(tests, loadings) {
    const k = tests.length;
    let varC = 0;
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) varC += i === j ? 1 : loadings[i] * loadings[j];
    const errVar = tests.reduce((a, t) => a + (1 - Math.min(Math.max(t.reliability, 0), 0.99)), 0);
    const normVar = tests.reduce((a, t) => a + (t.normSe || 0) ** 2, 0) / varC;
    const z = tests.reduce((a, t) => a + t.z, 0) / Math.sqrt(varC);
    const reliability = 1 - errVar / varC;
    const se = Math.sqrt(Math.max(0, 1 - reliability) + normVar);
    return { z, se, reliability, iq: 100 + 15 * z, lo: 100 + 15 * (z - 1.96 * se), hi: 100 + 15 * (z + 1.96 * se), k };
  }

  // Norma dla uczestnika: grupa wieku (jeśli podał rok urodzenia i grupa ma
  // dość osób), w przeciwnym razie cała próba.
  function normFor(norms, birthYear) {
    if (birthYear) {
      const age = AGE_NOW - birthYear;
      const band = (norms.byAge || []).find((g) => age >= g.from && age <= g.to && g.n >= MIN_N_IQ);
      if (band) return Object.assign({ label: `osoby w wieku ${band.from}–${band.to} lat` }, band);
    }
    return { n: norms.n, mean: norms.mean, sd: norms.sd, label: 'wszyscy uczestnicy (bez podziału na wiek)' };
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* tryb prywatny itp. */ } },
  };

  function participantId() {
    let id = store.get('testiq-pid');
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID()
        : 'p-' + Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      store.set('testiq-pid', id);
    }
    return id;
  }

  function apiBase() {
    const url = root.TESTIQ_CONFIG && root.TESTIQ_CONFIG.apiUrl;
    return url ? String(url).replace(/\/+$/, '') : '';
  }

  // ---------- klawiatura i ochrona przed opuszczeniem strony ----------
  // Jeden aktywny obsługujący klawisze (bieżące zadanie). Klawisze wpisywane
  // w pola formularza i skróty z Ctrl/Alt/Cmd są pomijane.
  let keyHandler = null;
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', (e) => {
      if (!keyHandler || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      keyHandler(e);
    });
  }
  function onKeys(fn) { keyHandler = fn || null; }

  // Indeks odpowiedzi z klawisza: A–F (lub dalsze litery) albo 1–9; -1 = inny klawisz.
  function choiceFromKey(e, n) {
    const k = String(e.key || '').toUpperCase();
    let i = k.length === 1 ? 'ABCDEFGHI'.indexOf(k) : -1;
    if (i < 0 && /^[1-9]$/.test(k)) i = Number(k) - 1;
    return i >= 0 && i < n ? i : -1;
  }

  // Ostrzeżenie przeglądarki przy odświeżeniu lub zamknięciu karty w trakcie testu.
  let unloadGuard = null;
  function guardUnload(on) {
    if (on && !unloadGuard) {
      unloadGuard = (e) => { e.preventDefault(); e.returnValue = ''; };
      root.addEventListener('beforeunload', unloadGuard);
    } else if (!on && unloadGuard) {
      root.removeEventListener('beforeunload', unloadGuard);
      unloadGuard = null;
    }
  }

  // ---------- formularz przed testem ----------
  const META_FORM = `
    <h2>Zanim zaczniesz</h2>
    <p class="note">Te dane pomogą zbudować polskie normy. Są dobrowolne. Nie pytamy o imię, e-mail ani inne dane, które pozwalają cię zidentyfikować.</p>
    <label class="field">Rok urodzenia
      <input type="number" id="by" min="1920" max="2020" inputmode="numeric" placeholder="np. 1999">
    </label>
    <label class="field">Wykształcenie
      <select id="edu">
        <option value="">— wolę nie podawać —</option>
        <option value="podstawowe">podstawowe / gimnazjalne</option>
        <option value="zawodowe">zasadnicze zawodowe</option>
        <option value="srednie">średnie</option>
        <option value="wyzsze-w-trakcie">studia w trakcie</option>
        <option value="wyzsze">wyższe</option>
      </select>
    </label>
    <label class="field">Płeć
      <select id="sex">
        <option value="">— wolę nie podawać —</option>
        <option value="k">kobieta</option>
        <option value="m">mężczyzna</option>
        <option value="inna">inna</option>
      </select>
    </label>
    <label class="field">Czy polski jest twoim językiem ojczystym?
      <select id="lang">
        <option value="">— wolę nie podawać —</option>
        <option value="pl">tak</option>
        <option value="inny">nie</option>
      </select>
    </label>
    <label class="field">Kraj zamieszkania
      <select id="country">
        <option value="">— wolę nie podawać —</option>
        <option value="pl">Polska</option>
        <option value="inny">inny</option>
      </select>
    </label>
    <label class="check"><input type="checkbox" id="consent">
      <span>Mam ukończone 16 lat i zgadzam się na anonimowe wykorzystanie moich odpowiedzi do opracowania norm testu (<a href="../prywatnosc/">zasady prywatności</a>). Bez zgody wynik zostaje tylko w tej przeglądarce.</span></label>`;

  function readMeta() {
    const by = Number(document.getElementById('by').value);
    return {
      birthYear: by >= 1920 && by <= 2020 ? by : null,
      education: document.getElementById('edu').value || null,
      sex: document.getElementById('sex').value || null,
      nativeLang: document.getElementById('lang').value || null,
      country: document.getElementById('country').value || null,
      consent: document.getElementById('consent').checked,
    };
  }

  // ---------- wysyłka i statystyki ----------
  // Zgody na przetwarzanie danych w RODO (w Polsce) może udzielić osoba,
  // która ukończyła 16 lat; wyników osób deklarujących młodszy wiek nie wysyłamy.
  const MIN_AGE = 16;
  function tooYoung(meta) {
    return !!(meta && meta.birthYear && new Date().getFullYear() - meta.birthYear < MIN_AGE);
  }
  function sendResult(result) {
    const base = apiBase();
    if (!base || !result.meta || !result.meta.consent || tooYoung(result.meta)) return Promise.resolve(false);
    return fetch(base + '/api/results', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result),
    }).then((r) => r.ok).catch(() => false);
  }

  function willSend(meta) {
    return !!(apiBase() && meta && meta.consent && !tooYoung(meta));
  }

  // ---------- uczciwość pomiaru ----------
  // Ktoś może zrobić zdjęcie zadania albo skopiować je do czatu z AI. Nie da
  // się tego całkiem zablokować, ale można to zauważyć i nie wliczać takich
  // wyników do norm:
  //  - wyjścia z karty lub okna w trakcie zadania (liczba i łączny czas),
  //  - blokada kopiowania treści zadań (najprostsza droga do czatu),
  //  - pytanie po teście, czy była używana pomoc (patrz askAssist).
  // Wynik osoby, którą widzi na ekranie, się od tego nie zmienia.
  function focusWatch() {
    let away = 0, awayMs = 0, since = null;
    const leave = () => { if (since === null) { since = Date.now(); away++; } };
    const back = () => { if (since !== null) { awayMs += Date.now() - since; since = null; } };
    const onVis = () => (document.hidden ? leave() : back());
    const noCopy = (e) => e.preventDefault();
    root.addEventListener('blur', leave);
    root.addEventListener('focus', back);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('copy', noCopy);
    document.addEventListener('cut', noCopy);
    return {
      // nieobecność od poprzedniego wywołania (do zapisania przy odpowiedzi)
      mark() {
        if (since !== null) { awayMs += Date.now() - since; since = Date.now(); }
        const out = away || awayMs ? { away: Math.min(away, 1000), awayMs: Math.min(awayMs, 3600000) } : {};
        away = 0; awayMs = 0;
        return out;
      },
      stop() {
        root.removeEventListener('blur', leave);
        root.removeEventListener('focus', back);
        document.removeEventListener('visibilitychange', onVis);
        document.removeEventListener('copy', noCopy);
        document.removeEventListener('cut', noCopy);
      },
    };
  }

  // ---------- punktacja: jawne zasady uczciwości ----------
  // Zasady są opisane w instrukcji każdego testu (RULES_NOTE) i w metodologii,
  // a ekran wyniku pokazuje, ile odpowiedzi nie zostało policzonych i dlaczego.
  //  1. Odpowiedź po wyjściu z karty (dłużej niż AWAY_GRACE_MS) nie jest liczona.
  //  2. (wyłączone do pilotażu) Odpowiedź po bardzo długim namyśle, powyżej
  //     progu SLOW_RULE.limits[test][poziom], jest liczona za pół punktu.
  // Te same zasady co w api/app/scoring.py.
  const AWAY_GRACE_MS = 1000;
  const SLOW_RULE = {
    enabled: false,
    points: 0.5,
    // test -> poziom -> ms; uzupełnimy z danych pilotażu (np. czas, w którym
    // mieści się 99% uczciwych odpowiedzi na zadania danego poziomu)
    limits: {},
  };
  const RULES_NOTE = '<p class="rules"><strong>Ważne:</strong> nie wychodź z tej karty ani z przeglądarki w trakcie zadania. Odpowiedzi udzielone po wyjściu z karty nie są liczone do wyniku.</p>';

  function leftTab(r) { return !!(r.away && (r.awayMs || 0) >= AWAY_GRACE_MS); }
  function slowLimit(testId, r, rule) {
    const lim = rule.enabled && rule.limits[testId];
    return lim ? (lim[r.level !== undefined ? r.level : r.moves] || null) : null;
  }
  // Punkty za jedną odpowiedź (0, SLOW_RULE.points albo 1).
  function pointsFor(testId, r, rule) {
    rule = rule || SLOW_RULE;
    if (!r.correct || leftTab(r)) return 0;
    const lim = slowLimit(testId, r, rule);
    return lim && r.ms > lim ? rule.points : 1;
  }
  // Wynik testu: punkty po zasadach + ile poprawnych odpowiedzi nie policzono.
  function scoreOf(testId, responses, rule) {
    rule = rule || SLOW_RULE;
    let points = 0, raw = 0, voided = 0, slow = 0;
    for (const r of responses) {
      const p = pointsFor(testId, r, rule);
      points += p;
      if (r.correct) raw++;
      if (r.correct && leftTab(r)) voided++;
      else if (r.correct && p < 1) slow++;
    }
    return { points, raw, voided, slow };
  }
  const fmtPoints = (p) => String(Math.round(p * 10) / 10).replace('.', ',');
  // Zdanie pod wynikiem, jeśli zasady coś zmieniły.
  function scoreNote(s) {
    const parts = [];
    if (s.voided) parts.push(`${s.voided} ${s.voided === 1 ? 'poprawna odpowiedź padła' : 'poprawne odpowiedzi padły'} po wyjściu z karty, więc ich nie liczymy`);
    if (s.slow) parts.push(`${s.slow} ${s.slow === 1 ? 'odpowiedź' : 'odpowiedzi'} po bardzo długim namyśle liczymy za pół punktu`);
    return parts.length ? `<p class="note">${parts.join('; ')}. Bez tych zasad: ${s.raw}.</p>` : '';
  }
  const ASSISTED = ['ai', 'inna'];
  function assisted(meta) { return !!(meta && ASSISTED.includes(meta.assist)); }
  const ASSISTED_NOTE = '<p>Ten test był rozwiązany z pomocą, więc wynik nie mówi o twoich zdolnościach i nie porównujemy go z innymi uczestnikami. Rozwiąż test jeszcze raz samodzielnie, żeby zobaczyć porównanie.</p>';

  const ASSIST_OPTIONS = [
    ['nie', 'Nie, wszystko samodzielnie'],
    ['ai', 'Tak, z AI (np. czat albo zdjęcie zadania wysłane do AI)'],
    ['inna', 'Tak, z innej pomocy (wyszukiwarka, kalkulator, notatki, druga osoba)'],
    ['', 'Wolę nie odpowiadać'],
  ];
  // Ekran po teście, przed wynikiem. Pytamy przed pokazaniem wyniku, żeby
  // odpowiedź nie zależała od tego, jak poszło.
  function askAssist(container, done) {
    container.innerHTML = `
      <div class="kicker">Ostatnie pytanie</div>
      <h1>Czy podczas testu korzystano z jakiejś pomocy?</h1>
      <p class="lead">Twoja odpowiedź nie zmieni wyniku, który za chwilę zobaczysz. Testy rozwiązane z pomocą pomijamy przy liczeniu norm, żeby porównanie było uczciwe dla wszystkich. Szczera odpowiedź „tak” bardzo nam pomaga.</p>
      <fieldset class="assist">
        <legend class="sr-only">Pomoc podczas testu</legend>
        ${ASSIST_OPTIONS.map(([v, label]) => `<label class="check"><input type="radio" name="assist" value="${v}"> <span>${label}</span></label>`).join('')}
      </fieldset>
      <p><button class="btn" id="assist-ok">Pokaż wynik</button></p>`;
    root.scrollTo(0, 0);
    document.getElementById('assist-ok').addEventListener('click', () => {
      const picked = container.querySelector('input[name="assist"]:checked');
      done(picked && picked.value ? picked.value : null);
    });
  }

  function fetchNorms(testId) {
    const base = apiBase();
    if (!base) return Promise.resolve(null);
    return fetch(base + '/api/norms/' + encodeURIComponent(testId))
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }

  // Ranga centylowa w próbie (połowa remisów liczona jako „poniżej”) i jej
  // przybliżony 95% margines błędu (rozkład dwumianowy).
  function percentile(distribution, score) {
    let below = 0, equal = 0, n = 0;
    distribution.forEach((count, s) => {
      n += count;
      if (s < score) below += count;
      else if (s === score) equal += count;
    });
    const p = n ? (below + equal / 2) / n : 0;
    return { p, margin: n ? 1.96 * Math.sqrt(p * (1 - p) / n) : 1, n };
  }

  const NS = 'http://www.w3.org/2000/svg';
  function histogramSvg(distribution, score) {
    const W = 600, H = 180, pad = 24;
    const max = Math.max(1, ...distribution);
    const bw = (W - 2 * pad) / distribution.length;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H + 24}`);
    svg.setAttribute('class', 'hist');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Rozkład wyników innych uczestników; twój wynik jest wyróżniony.');
    distribution.forEach((count, s) => {
      const h = (count / max) * (H - pad);
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', pad + s * bw + 1);
      r.setAttribute('y', H - h);
      r.setAttribute('width', Math.max(1, bw - 2));
      r.setAttribute('height', h);
      r.setAttribute('class', s === score ? 'bar mine' : 'bar');
      svg.appendChild(r);
      if (distribution.length <= 31 || s % 5 === 0) {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', pad + (s + 0.5) * bw);
        t.setAttribute('y', H + 18);
        t.setAttribute('class', 'axis');
        t.textContent = String(s);
        svg.appendChild(t);
      }
    });
    return svg;
  }

  // Na ekranie wyniku: rozkład wyników innych (od MIN_N osób) albo
  // informacja, że zbieramy dane.
  function renderComparison(container, testId, score, meta) {
    container.innerHTML = '<p class="note">Wczytywanie wyników innych uczestników…</p>';
    return fetchNorms(testId).then((norms) => {
      if (!norms || !norms.n || norms.n < MIN_N) {
        const n = norms && norms.n ? norms.n : 0;
        container.innerHTML = `<p>Zbieramy dane. Porównanie z innymi uczestnikami pokażemy, gdy test rozwiąże co najmniej ${MIN_N} osób, które zgodziły się na wykorzystanie wyników${n ? ` (na razie: ${n})` : ''}.</p>`;
        return;
      }
      const pc = percentile(norms.distribution, score);
      const pct = Math.round(pc.p * 100);
      const margin = Math.max(1, Math.round(pc.margin * 100));
      container.innerHTML = `
        <p>Twój wynik jest wyższy niż u około <strong>${pct}%</strong> uczestników (±${margin} pkt proc., przedział 95%).</p>
        <div class="hist-wrap"></div>
        <p class="note">Próba: ${norms.n} osób, każda liczona raz (pierwsze podejście). Średnia ${norms.mean.toFixed(1)}, odchylenie standardowe ${norms.sd.toFixed(1)}.
        To ochotnicy, którzy trafili na stronę, a nie próba reprezentatywna dla Polski, więc to porównanie nie jest jeszcze normą.</p>`;
      container.querySelector('.hist-wrap').appendChild(histogramSvg(norms.distribution, score));
      const norm = normFor(norms, meta && meta.birthYear);
      const est = toIQ(score, norm, norms.reliability);
      if (est) {
        const box = document.createElement('div');
        box.className = 'card iq';
        box.innerHTML = `
          <div class="kicker">${est.status === 'wstepna' ? 'Estymacja wstępna' : 'Wynik na skali IQ'}</div>
          <p class="iq-value">IQ około <strong>${est.iq}</strong> <span class="note">(przedział 95%: ${est.lo}–${est.hi})</span></p>
          <p class="note">Porównanie: ${norm.label}, ${norm.n} osób. Rzetelność testu w tej próbie: ${String(norms.reliability).replace('.', ',')}.
          Przedział uwzględnia błąd pomiaru i to, że średnią i rozrzut wyników znamy tylko z tej próby.</p>
          <p class="note">${est.status === 'wstepna'
            ? '<strong>To nie jest wynik testu z polskimi normami.</strong> Próba jest mała i składa się z ochotników, którzy sami trafili na stronę. Zwykle radzą sobie lepiej niż przeciętna, więc ta liczba może zaniżać lub zawyżać twój wynik względem populacji Polski. Traktuj ją jako orientacyjną.'
            : 'Próba jest duża, ale nadal ochotnicza, a nie reprezentatywna dla Polski. Wynik mówi, jak wypadasz na tle osób rozwiązujących ten test.'}</p>`;
        container.appendChild(box);
      }
    });
  }

  root.TestIQ = { MIN_AGE, tooYoung, willSend, focusWatch, askAssist, AWAY_GRACE_MS, SLOW_RULE, RULES_NOTE, leftTab, pointsFor, scoreOf, fmtPoints, scoreNote, assisted, ASSISTED_NOTE, MIN_N, MIN_N_IQ, MIN_N_NORMS, toIQ, composite, normFor, store, onKeys, choiceFromKey, guardUnload, participantId, apiBase, META_FORM, readMeta, sendResult, fetchNorms, percentile, histogramSvg, renderComparison };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TestIQ;
})(typeof window !== 'undefined' ? window : globalThis);
