"""Dwuparametryczny model logistyczny (2PL) i jego kalibracja.

P(poprawna | θ) = 1 / (1 + exp(−a·(θ − b)))
  a  dyskryminacja (jak dobrze zadanie odróżnia słabszych od mocniejszych)
  b  trudność (poziom θ, przy którym szansa poprawnej odpowiedzi to 50%)

Estymacja: marginalna największa wiarygodność algorytmem EM (Bock i
Aitkin), θ ~ N(0, 1), kwadratura Gaussa–Hermite'a. Dla stabilności małe
łagodne rozkłady a priori na parametry (log a ~ N(0, 0.5²), b ~ N(0, 2²)),
czyli w praktyce estymacja MAP; przy dużym N ich wpływ znika.
Braki odpowiedzi (nan) pomijamy w wiarygodności.

Wynik osoby: θ metodą EAP (średnia a posteriori) z błędem standardowym
(odchylenie a posteriori).
"""

import numpy as np
from scipy.optimize import minimize

N_QUAD = 41


def quadrature(n=N_QUAD):
    x, w = np.polynomial.hermite_e.hermegauss(n)  # wagi dla N(0, 1) (nieznormalizowane)
    return x, w / w.sum()


def prob(theta, a, b):
    return 1.0 / (1.0 + np.exp(-a * (np.asarray(theta)[..., None] - b)))


def simulate(n_persons, a, b, rng, theta=None):
    theta = rng.standard_normal(n_persons) if theta is None else theta
    p = prob(theta, np.asarray(a), np.asarray(b))
    return (rng.random(p.shape) < p).astype(float), theta


def _loglik_nodes(x, mask, a, b, nodes):
    """log P(odpowiedzi osoby | θ = węzeł) dla wszystkich osób i węzłów."""
    p = np.clip(prob(nodes, a, b), 1e-9, 1 - 1e-9)        # węzły × zadania
    lp, lq = np.log(p), np.log(1 - p)
    xm = np.where(mask, x, 0.0)
    return xm @ lp.T + (mask & (x == 0)) @ lq.T            # osoby × węzły


def fit_2pl(responses, max_iter=500, tol=1e-4, prior_sd_loga=0.5, prior_sd_b=2.0):
    """Zwraca dict: a, b (wektory), iteracje, zbieżność, log-wiarygodność."""
    x = np.asarray(responses, float)
    mask = ~np.isnan(x)
    x = np.nan_to_num(x)
    n, k = x.shape
    nodes, weights = quadrature()
    # start: trudność z odsetka poprawnych, dyskryminacja 1
    pj = np.clip((x * mask).sum(0) / np.maximum(mask.sum(0), 1), 0.02, 0.98)
    a = np.ones(k)
    b = -np.log(pj / (1 - pj)) / 1.7
    last = -np.inf
    for it in range(1, max_iter + 1):
        # krok E: rozkład a posteriori θ dla każdej osoby na węzłach
        ll = _loglik_nodes(x, mask, a, b, nodes) + np.log(weights)
        m = ll.max(axis=1, keepdims=True)
        post = np.exp(ll - m)
        marg = post.sum(axis=1, keepdims=True)
        post /= marg
        loglik = float((np.log(marg) + m).sum())
        # oczekiwane liczności na węzłach dla każdego zadania
        nq = post.T @ mask              # węzły × zadania: ile osób z odpowiedzią
        rq = post.T @ (x * mask)        # węzły × zadania: ile poprawnych
        # krok M: osobno dla każdego zadania
        for j in range(k):
            def neg(par, j=j):
                la, bj = par
                aj = np.exp(la)
                p = np.clip(1 / (1 + np.exp(-aj * (nodes - bj))), 1e-9, 1 - 1e-9)
                val = -(rq[:, j] * np.log(p) + (nq[:, j] - rq[:, j]) * np.log(1 - p)).sum()
                val += 0.5 * (la / prior_sd_loga) ** 2 + 0.5 * (bj / prior_sd_b) ** 2
                return val
            res = minimize(neg, [np.log(a[j]), b[j]], method="L-BFGS-B",
                           bounds=[(np.log(0.1), np.log(6.0)), (-6.0, 6.0)])
            a[j], b[j] = np.exp(res.x[0]), res.x[1]
        if abs(loglik - last) < tol * max(1.0, abs(loglik)) * 1e-3:
            return {"a": a, "b": b, "iterations": it, "converged": True, "loglik": loglik}
        last = loglik
    return {"a": a, "b": b, "iterations": max_iter, "converged": False, "loglik": last}


def eap(responses, a, b):
    """θ (EAP) i jego błąd standardowy dla każdej osoby."""
    x = np.atleast_2d(np.asarray(responses, float))
    mask = ~np.isnan(x)
    x = np.nan_to_num(x)
    nodes, weights = quadrature()
    ll = _loglik_nodes(x, mask, np.asarray(a), np.asarray(b), nodes) + np.log(weights)
    post = np.exp(ll - ll.max(axis=1, keepdims=True))
    post /= post.sum(axis=1, keepdims=True)
    theta = post @ nodes
    se = np.sqrt(post @ nodes ** 2 - theta ** 2)
    return theta, se


def test_information(theta, a, b):
    """Informacja testu w punkcie θ; SE(θ) ≈ 1/√I."""
    p = prob(theta, np.asarray(a), np.asarray(b))
    return (np.asarray(a) ** 2 * p * (1 - p)).sum(axis=-1)


def recovery_study(n_values, k_items, replications, seed=1):
    """Symulacja odtwarzania parametrów 2PL przy różnych N: zwraca dla
    każdego N średnie RMSE i korelację oszacowań a i b z prawdziwymi oraz
    korelację θ (EAP) z prawdziwym θ."""
    rng = np.random.default_rng(seed)
    rows = []
    for n in n_values:
        stats = []
        for _ in range(replications):
            a = np.exp(rng.normal(0.0, 0.3, k_items))      # dyskryminacje ok. 0,5–2
            b = rng.normal(0.0, 1.0, k_items)
            x, theta = simulate(n, a, b, rng)
            fit = fit_2pl(x)
            th, _ = eap(x, fit["a"], fit["b"])
            stats.append([
                np.sqrt(np.mean((fit["a"] - a) ** 2)), np.sqrt(np.mean((fit["b"] - b) ** 2)),
                np.corrcoef(fit["a"], a)[0, 1], np.corrcoef(fit["b"], b)[0, 1], np.corrcoef(th, theta)[0, 1],
            ])
        s = np.mean(stats, axis=0)
        rows.append({"N": n, "rmse_a": s[0], "rmse_b": s[1], "r_a": s[2], "r_b": s[3], "r_theta": s[4]})
    return rows
