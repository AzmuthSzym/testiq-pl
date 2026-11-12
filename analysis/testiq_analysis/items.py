"""Statystyki zadań i rzetelność (klasyczna teoria testu).

Braki odpowiedzi (np. koniec czasu) liczymy jako błędne: w teście z limitem
czasu to część wyniku. Kto chce inaczej, może przekazać macierz z nan
zamienionymi wcześniej.
"""

import numpy as np


def _scored(x: np.ndarray) -> np.ndarray:
    return np.nan_to_num(np.asarray(x, float), nan=0.0)


def item_stats(responses: np.ndarray) -> list[dict]:
    """Dla każdego zadania: trudność p (odsetek poprawnych), korelacja
    zadania z wynikiem reszty testu (skorygowana, bez tego zadania) i alfa
    testu po usunięciu zadania."""
    x = _scored(responses)
    total = x.sum(axis=1)
    out = []
    for j in range(x.shape[1]):
        rest = total - x[:, j]
        col = x[:, j]
        r = np.nan if col.std() == 0 or rest.std() == 0 else float(np.corrcoef(col, rest)[0, 1])
        out.append({
            "zadanie": j + 1,
            "trudnosc_p": float(col.mean()),
            "korelacja_z_reszta": r,
            "alfa_bez_zadania": cronbach_alpha(np.delete(x, j, axis=1)),
        })
    return out


def cronbach_alpha(responses: np.ndarray) -> float:
    x = _scored(responses)
    k = x.shape[1]
    if k < 2 or x.shape[0] < 2:
        return float("nan")
    item_var = x.var(axis=0, ddof=1).sum()
    total_var = x.sum(axis=1).var(ddof=1)
    return float(k / (k - 1) * (1 - item_var / total_var)) if total_var > 0 else float("nan")


def one_factor_loadings(responses: np.ndarray, iterations: int = 200) -> tuple[np.ndarray, np.ndarray]:
    """Model jednoczynnikowy metodą osi głównych (iterowane zasoby
    zmienności wspólnej) na macierzy korelacji Pearsona. Zwraca ładunki
    i wariancje swoiste.

    Uwaga: przy zadaniach 0/1 korelacje Pearsona są zaniżone dla zadań
    bardzo łatwych i bardzo trudnych, więc omega z tej funkcji jest
    oszacowaniem ostrożnym (raczej zaniżonym)."""
    x = _scored(responses)
    keep = x.std(axis=0) > 0
    r = np.corrcoef(x[:, keep], rowvar=False)
    h2 = 1 - 1 / np.diag(np.linalg.pinv(r))  # start: kwadrat korelacji wielokrotnej
    h2 = np.clip(h2, 0.01, 0.99)
    for _ in range(iterations):
        rr = r.copy()
        np.fill_diagonal(rr, h2)
        vals, vecs = np.linalg.eigh(rr)
        lam = vecs[:, -1] * np.sqrt(max(vals[-1], 0))
        new = np.clip(lam ** 2, 0.001, 0.999)
        if np.max(np.abs(new - h2)) < 1e-6:
            h2 = new
            break
        h2 = new
    if lam.sum() < 0:
        lam = -lam
    loadings = np.full(x.shape[1], np.nan)
    loadings[keep] = lam
    return loadings, 1 - loadings ** 2


def mcdonald_omega(responses: np.ndarray) -> float:
    """Omega całkowita z modelu jednoczynnikowego: (Σλ)² / ((Σλ)² + Σψ)."""
    lam, psi = one_factor_loadings(responses)
    ok = ~np.isnan(lam)
    s = lam[ok].sum()
    return float(s ** 2 / (s ** 2 + psi[ok].sum()))


def sem_raw(responses: np.ndarray, reliability: float) -> float:
    """Błąd standardowy pomiaru wyniku surowego: SD · √(1 − rzetelność)."""
    total = _scored(responses).sum(axis=1)
    return float(total.std(ddof=1) * np.sqrt(max(0.0, 1 - reliability)))
