(function () {
  'use strict';
  const T = window.TestIQ;
  const box = document.getElementById('mine');
  const MAIL = 'support@testyzdolnosci.pl';

  function keys() {
    try { return Object.keys(localStorage).filter((k) => k.startsWith('testiq-')); } catch (e) { return []; }
  }

  function render(message) {
    const id = T.store.get('testiq-pid');
    const local = keys().filter((k) => k.startsWith('testiq-last-')).length;
    if (!id && !local) {
      box.innerHTML = '<p>W tej przeglądarce nie ma żadnych danych z naszej strony.</p>' + (message || '');
      return;
    }
    const server = T.apiBase()
      ? `<p><button class="btn" type="button" id="del-server">Usuń moje wyniki z serwera</button></p>
         <p class="note">Usuwa wszystkie wyniki przesłane z tej przeglądarki. Jeśli nie wysyłano żadnych, nic się nie stanie.</p>`
      : '<p class="note">Serwer nie zbiera jeszcze wyników, więc nic z tej przeglądarki do nas nie trafiło.</p>';
    box.innerHTML = `
      <p>Twój identyfikator: <code id="pid"></code></p>
      <p>Wyniki zapisane w tej przeglądarce: ${local}.</p>
      ${server}
      <p><button class="btn ghost" type="button" id="del-local">Usuń dane z tej przeglądarki</button></p>
      <p class="note">Najpierw usuń wyniki z serwera: bez identyfikatora nie będziemy mogli ich odnaleźć.</p>
      <div id="del-msg" role="status">${message || ''}</div>`;
    document.getElementById('pid').textContent = id || '(brak)';
    const ds = document.getElementById('del-server');
    if (ds) ds.addEventListener('click', () => {
      if (!confirm('Usunąć wszystkie twoje wyniki z serwera? Tego nie da się cofnąć.')) return;
      ds.disabled = true;
      T.deleteMine().then((n) => {
        const msg = n === null
          ? `<p>Nie udało się połączyć z serwerem. Spróbuj później albo napisz na <a href="mailto:${MAIL}">${MAIL}</a> i podaj swój identyfikator.</p>`
          : `<p><strong>Gotowe.</strong> Usunięte wyniki: ${n}. Z kopii zapasowych znikną najpóźniej po 14 dniach.</p>`;
        render(msg);
      });
    });
    document.getElementById('del-local').addEventListener('click', () => {
      if (!confirm('Usunąć wyniki i identyfikator z tej przeglądarki?')) return;
      keys().forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* brak dostępu */ } });
      render('<p><strong>Gotowe.</strong> Dane z tej przeglądarki zostały usunięte.</p>');
    });
  }
  render();
})();
