// Adres serwera API zbierającego wyniki, bez ukośnika na końcu, np.
// 'https://api.example.pl'. Pusty = wyniki zostają tylko w przeglądarce.
// Strona wysyła wyniki na <apiUrl>/api/results i pobiera statystyki z
// <apiUrl>/api/norms/<test>.
window.TESTIQ_CONFIG = {
  apiUrl: 'https://api.testyzdolnosci.pl',
};
