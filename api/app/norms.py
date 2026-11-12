"""Statystyki wyników do wyświetlenia na stronie."""

import math


def summarize(scores: list[int], max_score: int) -> dict:
    n = len(scores)
    distribution = [0] * (max_score + 1)
    for s in scores:
        distribution[min(max(s, 0), max_score)] += 1
    if n == 0:
        return {"n": 0, "mean": None, "sd": None, "sem": None, "distribution": distribution}
    mean = sum(scores) / n
    # odchylenie standardowe z próby (n - 1)
    sd = math.sqrt(sum((s - mean) ** 2 for s in scores) / (n - 1)) if n > 1 else None
    return {
        "n": n,
        "mean": round(mean, 3),
        "sd": round(sd, 3) if sd is not None else None,
        # błąd standardowy średniej: jak dokładnie znamy średnią populacji
        "sem": round(sd / math.sqrt(n), 3) if sd is not None else None,
        "distribution": distribution,
    }


# Grupy wieku do norm (takie same jak w analysis/testiq_analysis/scoring.py).
AGE_BANDS = [(16, 19), (20, 29), (30, 39), (40, 49), (50, 59), (60, 69), (70, 99)]
# Rzetelność i grupy wieku liczymy od tylu osób (mniej = zbyt niestabilne).
MIN_N_STATS = 30


def kr20(attempts: list[dict], n_items: int):
    """Rzetelność KR-20 (alfa Cronbacha dla zadań 0/1); brak odpowiedzi = 0."""
    n = len(attempts)
    if n < MIN_N_STATS or n_items < 2:
        return None
    matrix = [[a["items"].get(j, 0) for j in range(1, n_items + 1)] for a in attempts]
    totals = [sum(row) for row in matrix]
    mean_t = sum(totals) / n
    var_t = sum((t - mean_t) ** 2 for t in totals) / (n - 1)
    if var_t <= 0:
        return None
    item_var = 0.0
    for j in range(n_items):
        p = sum(row[j] for row in matrix) / n
        item_var += p * (1 - p) * n / (n - 1)
    return round(n_items / (n_items - 1) * (1 - item_var / var_t), 3)


def by_age(attempts: list[dict], max_score: int) -> list[dict]:
    """Statystyki w grupach wieku (tylko grupy z co najmniej MIN_N_STATS osobami,
    żeby małe grupy nie były identyfikujące ani mylące)."""
    out = []
    for lo, hi in AGE_BANDS:
        scores = [a["score"] for a in attempts if a["age"] is not None and lo <= a["age"] <= hi]
        if len(scores) >= MIN_N_STATS:
            s = summarize(scores, max_score)
            out.append({"from": lo, "to": hi, "n": s["n"], "mean": s["mean"], "sd": s["sd"]})
    return out
