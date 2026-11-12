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
