"""Przeliczanie wyników na skalę IQ (średnia 100, SD 15) i wynik łączny.

Normy według wieku: grupy wiekowe (np. 16–19, 20–29, …). W każdej grupie
średnia i SD wyniku (θ z modelu 2PL albo wyniku surowego). Przedział
ufności IQ łączy dwa źródła niepewności:
  1. błąd pomiaru: SE(θ) z modelu IRT (albo SD·√(1−rzetelność)),
  2. błąd norm: średnią i SD grupy znamy tylko z próby N osób.
Dopóki próba w grupie jest mała (< MIN_N_FINAL), wynik ma status
„estymacja wstępna”, a poniżej MIN_N_PRELIM nie podajemy IQ wcale.
"""

import math

import numpy as np

AGE_BANDS = [(16, 19), (20, 29), (30, 39), (40, 49), (50, 59), (60, 69), (70, 99)]
MIN_N_PRELIM = 30    # od tylu osób w grupie: estymacja wstępna (szeroki przedział)
MIN_N_FINAL = 400    # od tylu: normy (nadal z zastrzeżeniem, że próba nie jest reprezentatywna)


def age_band(age):
    for lo, hi in AGE_BANDS:
        if lo <= age <= hi:
            return (lo, hi)
    return None


def build_norms(scores, ages):
    """Normy dla każdej grupy wieku: N, średnia, SD."""
    scores, ages = np.asarray(scores, float), np.asarray(ages, float)
    norms = {}
    for band in AGE_BANDS:
        sel = (ages >= band[0]) & (ages <= band[1]) & ~np.isnan(scores)
        s = scores[sel]
        norms[band] = {"n": int(sel.sum()), "mean": float(s.mean()) if len(s) else math.nan,
                       "sd": float(s.std(ddof=1)) if len(s) > 1 else math.nan}
    return norms


def to_iq(score, se_score, norm, z=1.96):
    """IQ z wyniku i jego SE względem normy grupy (N, średnia, SD).

    Niepewność normy: SE średniej = SD/√N, SE odchylenia ≈ SD/√(2(N−1)).
    Wariancja błędu z (metoda delta): (se_score² + SE_mean²)/SD² + z²·SE_sd²/SD²."""
    n, mean, sd = norm["n"], norm["mean"], norm["sd"]
    if n < MIN_N_PRELIM or not sd or math.isnan(sd):
        return {"status": "brak", "iq": None, "ci": None, "n": n}
    zval = (score - mean) / sd
    se_mean = sd / math.sqrt(n)
    se_sd = sd / math.sqrt(2 * (n - 1))
    var_z = (se_score ** 2 + se_mean ** 2) / sd ** 2 + (zval * se_sd / sd) ** 2
    se_iq = 15 * math.sqrt(var_z)
    iq = 100 + 15 * zval
    return {
        "status": "wstepna" if n < MIN_N_FINAL else "normy",
        "iq": round(iq), "ci": (round(iq - z * se_iq), round(iq + z * se_iq)), "se": se_iq, "n": n,
    }


def composite(z_scores, reliabilities, loadings, norm_se=None):
    """Wynik łączny z kilku testów: pozycja na znormalizowanej sumie wyników.

    Każdy test daje z_i (wynik w jednostkach odchylenia od średniej normy).
    Suma C = Σ z_i ma wariancję Var(C) = Σ_ij R_ij, gdzie R to korelacje
    testów (R_ii = 1; dopóki nie mamy danych: R_ij = λ_i·λ_j z założonych
    ładunków czynnika ogólnego). Wynik łączny Z = C / √Var(C).

    Rzetelność sumy: r_C = 1 − Σ(1 − r_i) / Var(C) (błędy testów niezależne),
    więc SE(Z) = √(1 − r_C). Do tego niepewność norm każdego testu
    (norm_se[i] = SE z_i wynikająca z tego, że średnią i SD znamy z próby):
    SE² += Σ norm_se_i² / Var(C).

    Dla jednego testu Z = z_1 i SE = √(1 − r_1): to samo co wynik testu.
    Każdy kolejny test zwiększa rzetelność sumy, więc przedział się zawęża."""
    z = np.asarray(z_scores, float)
    rel = np.clip(np.asarray(reliabilities, float), 0, 0.99)
    lam = np.asarray(loadings, float)
    corr = np.outer(lam, lam)
    np.fill_diagonal(corr, 1.0)
    var_c = float(corr.sum())
    r_c = 1 - float((1 - rel).sum()) / var_c
    norm_var = float(np.sum(np.square(norm_se))) / var_c if norm_se is not None else 0.0
    zc = float(z.sum() / math.sqrt(var_c))
    se = math.sqrt(max(0.0, 1 - r_c) + norm_var)
    return {"z": zc, "se": se, "reliability": r_c, "iq": 100 + 15 * zc,
            "ci": (100 + 15 * (zc - 1.96 * se), 100 + 15 * (zc + 1.96 * se))}
