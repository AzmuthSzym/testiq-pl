"""Wykrywanie odpowiedzi bez zaangażowania (losowe klikanie, „przeklikanie”).

Każdy wskaźnik zwraca wartość dla osoby; flagi są ostrożne, bo każda ma
fałszywe alarmy. W analizie norm wykluczamy osoby z co najmniej dwiema
flagami, a wyniki raportujemy z wykluczeniem i bez niego.

Wskaźniki:
  szybkie       odsetek odpowiedzi szybszych niż próg (np. 1,5 s w zadaniach,
                których nie da się rozwiązać tak szybko)
  ta_sama_opcja najdłuższa seria tej samej wybranej opcji (A, A, A, ...)
  bledy_guttmana  znormalizowana liczba błędów Guttmana: osoba myli łatwe
                zadania, a trudne rozwiązuje (typowe dla zgadywania)
  wynik_losowy  wynik nie odbiega od poziomu zgadywania (dwumianowy test
                jednostronny, p > 0,05)
"""

import math

import numpy as np


def fast_share(times_ms: np.ndarray, threshold_ms: float) -> np.ndarray:
    t = np.asarray(times_ms, float)
    answered = ~np.isnan(t)
    fast = (t < threshold_ms) & answered
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(answered.sum(axis=1) > 0, fast.sum(axis=1) / answered.sum(axis=1), np.nan)


def longest_same_choice(choices: list) -> np.ndarray:
    out = []
    for row in choices:
        best = run = 0
        prev = object()
        for c in row:
            if c is None:
                prev = object()
                run = 0
                continue
            run = run + 1 if c == prev else 1
            prev = c
            best = max(best, run)
        out.append(best)
    return np.array(out)


def guttman_errors(responses: np.ndarray) -> np.ndarray:
    """Znormalizowane błędy Guttmana G* (0 = idealny wzór, 1 = odwrotny):
    pary (łatwiejsze źle, trudniejsze dobrze) / maksymalna możliwa liczba."""
    x = np.nan_to_num(np.asarray(responses, float), nan=0.0)
    p = x.mean(axis=0)
    order = np.argsort(-p, kind="stable")  # od najłatwiejszego
    xs = x[:, order]
    k = xs.shape[1]
    out = []
    for row in xs:
        r = int(row.sum())
        if r == 0 or r == k:
            out.append(0.0)
            continue
        errors = 0
        correct_after = np.cumsum(row[::-1])[::-1]  # poprawne od pozycji j do końca
        for j in range(k - 1):
            if row[j] == 0:
                errors += correct_after[j + 1]
        out.append(errors / (r * (k - r)))
    return np.array(out)


def chance_level(responses: np.ndarray, p_guess: float, alpha: float = 0.05) -> np.ndarray:
    """True, jeśli wynik nie jest istotnie wyższy od zgadywania."""
    x = np.nan_to_num(np.asarray(responses, float), nan=0.0)
    k = x.shape[1]
    out = []
    for score in x.sum(axis=1).astype(int):
        tail = sum(math.comb(k, s) * p_guess ** s * (1 - p_guess) ** (k - s) for s in range(score, k + 1))
        out.append(tail > alpha)
    return np.array(out)


# Te same progi co w api/app/norms.py (assisted).
MAX_AWAY_EVENTS = 2
MAX_AWAY_MS = 20_000


def assisted(assist, away, away_ms) -> np.ndarray:
    """Pomoc z zewnątrz: przyznanie się (AI, inna) albo wielokrotne lub dłuższe
    wyjścia z karty w trakcie zadań. Takie testy nie wchodzą do norm."""
    a = np.array([x in ("ai", "inna") for x in assist], bool)
    return a | (np.asarray(away) > MAX_AWAY_EVENTS) | (np.asarray(away_ms) > MAX_AWAY_MS)


def slow_and_accurate(responses, times_ms, time_z=2.0, score_quantile=0.9) -> np.ndarray:
    """Wzór typowy dla rozwiązywania z AI na drugim urządzeniu (zdjęcie zadania,
    czekanie na odpowiedź): bardzo długi typowy czas odpowiedzi (mediana
    log-czasu ponad time_z SD powyżej średniej próby) przy wyniku w górnych
    10%. Ten sam wzór daje bardzo staranna, wolna osoba, więc to tylko flaga
    do przeglądu i do porównań (np. czy wykluczenie zmienia normy), a nie
    powód wykluczenia."""
    t = np.asarray(times_ms, float)
    with np.errstate(invalid="ignore", divide="ignore"):
        med = np.nanmedian(np.log(np.where(t > 0, t, np.nan)), axis=1)
    z = (med - np.nanmean(med)) / np.nanstd(med)
    score = np.nan_to_num(np.asarray(responses, float)).sum(axis=1)
    return (z > time_z) & (score >= np.quantile(score, score_quantile))


def flags(responses, times_ms, choices, p_guess, fast_ms=1500, fast_limit=0.3, run_limit=6, guttman_limit=0.4):
    """Tabela flag dla każdej osoby i decyzja o wykluczeniu (≥ 2 flagi)."""
    fs = fast_share(times_ms, fast_ms)
    ls = longest_same_choice(choices)
    ge = guttman_errors(responses)
    cl = chance_level(responses, p_guess)
    table = []
    for i in range(len(fs)):
        f = {
            "szybkie": bool(fs[i] > fast_limit),
            "ta_sama_opcja": bool(ls[i] >= run_limit),
            "bledy_guttmana": bool(ge[i] > guttman_limit),
            "wynik_losowy": bool(cl[i]),
        }
        f["wyklucz"] = sum(f.values()) >= 2
        table.append(f)
    return table
