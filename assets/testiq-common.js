// Wspólne elementy wszystkich testów: zapis lokalny, identyfikator uczestnika,
// formularz danych i zgody, wysyłka wyniku, porównanie z innymi uczestnikami.
(function (root) {
  'use strict';

  // Rozkład wyników innych pokazujemy dopiero od tylu uczestników.
  const MIN_N = 30;

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
    <label class="check"><input type="checkbox" id="consent">
      <span>Zgadzam się na anonimowe wykorzystanie moich odpowiedzi do opracowania norm testu. Bez zgody wynik zostaje tylko w tej przeglądarce.</span></label>`;

  function readMeta() {
    const by = Number(document.getElementById('by').value);
    return {
      birthYear: by >= 1920 && by <= 2020 ? by : null,
      education: document.getElementById('edu').value || null,
      consent: document.getElementById('consent').checked,
    };
  }

  // ---------- wysyłka i statystyki ----------
  function sendResult(result) {
    const base = apiBase();
    if (!base || !result.meta || !result.meta.consent) return Promise.resolve(false);
    return fetch(base + '/api/results', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result),
    }).then((r) => r.ok).catch(() => false);
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
  function renderComparison(container, testId, score) {
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
    });
  }

  root.TestIQ = { MIN_N, store, onKeys, choiceFromKey, guardUnload, participantId, apiBase, META_FORM, readMeta, sendResult, fetchNorms, percentile, histogramSvg, renderComparison };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TestIQ;
})(typeof window !== 'undefined' ? window : globalThis);
