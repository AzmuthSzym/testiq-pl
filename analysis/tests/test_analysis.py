"""Testy modułów analizy na danych symulowanych."""

import json
import math
import sqlite3

import numpy as np
import pytest

from testiq_analysis import careless, data, irt, items, scoring


@pytest.fixture(scope="module")
def sim():
    rng = np.random.default_rng(7)
    k = 20
    a = np.exp(rng.normal(0, 0.3, k))
    b = np.linspace(-2, 2, k)
    x, theta = irt.simulate(2000, a, b, rng)
    return x, theta, a, b


# ---------- klasyczna teoria testu ----------

def test_alpha_known_values():
    # dwa identyczne zadania: alfa = 1; zadania niezależne: alfa ≈ 0
    x = np.array([[1, 1], [0, 0], [1, 1], [0, 0]], float)
    assert items.cronbach_alpha(x) == pytest.approx(1.0)
    rng = np.random.default_rng(1)
    noise = (rng.random((5000, 10)) < 0.5).astype(float)
    assert abs(items.cronbach_alpha(noise)) < 0.1


def test_alpha_and_omega_on_simulated_test(sim):
    x = sim[0]
    alpha, omega = items.cronbach_alpha(x), items.mcdonald_omega(x)
    assert 0.7 < alpha < 0.95
    assert omega >= alpha - 0.02  # omega ≥ alfa (z dokładnością numeryczną)


def test_item_stats(sim):
    stats = items.item_stats(sim[0])
    p = [s["trudnosc_p"] for s in stats]
    assert p[0] > p[-1], "zadania od łatwych do trudnych"
    assert all(s["korelacja_z_reszta"] > 0.1 for s in stats)


def test_bad_item_detected(sim):
    x = sim[0].copy()
    rng = np.random.default_rng(3)
    x[:, 5] = (rng.random(len(x)) < 0.5)  # zadanie bez związku z resztą
    assert items.item_stats(x)[5]["korelacja_z_reszta"] < 0.1


# ---------- 2PL ----------

def test_2pl_recovers_parameters(sim):
    x, theta, a, b = sim
    fit = irt.fit_2pl(x)
    assert fit["converged"]
    assert np.corrcoef(fit["b"], b)[0, 1] > 0.98
    assert np.corrcoef(fit["a"], a)[0, 1] > 0.8
    assert np.sqrt(np.mean((fit["b"] - b) ** 2)) < 0.2
    th, se = irt.eap(x, fit["a"], fit["b"])
    # granica to √rzetelności testu (20 zadań: ok. 0,87)
    assert np.corrcoef(th, theta)[0, 1] > 0.8
    # SE z modelu zgadza się z rzeczywistym błędem θ
    assert np.std(th - theta) == pytest.approx(np.mean(se), rel=0.25)


def test_2pl_handles_missing(sim):
    x = sim[0][:800].copy()
    rng = np.random.default_rng(5)
    x[rng.random(x.shape) < 0.1] = np.nan
    fit = irt.fit_2pl(x)
    assert np.all(np.isfinite(fit["a"])) and np.all(np.isfinite(fit["b"]))


def test_information_and_se():
    a, b = np.ones(10), np.zeros(10)
    info = irt.test_information(np.array([0.0, 3.0]), a, b)
    assert info[0] == pytest.approx(10 * 0.25)
    assert info[1] < info[0], "najwięcej informacji przy θ = b"


# ---------- wykrywanie braku zaangażowania ----------

def test_careless_flags(sim):
    x = sim[0][:200].copy()
    k = x.shape[1]
    rng = np.random.default_rng(9)
    times = rng.normal(15000, 4000, x.shape).clip(3000)
    choices = [[int(c) for c in rng.integers(0, 8, k)] for _ in range(200)]
    # 10 osób klika losowo, szybko i ciągle tę samą opcję
    for i in range(10):
        x[i] = rng.random(k) < 0.125
        times[i] = rng.normal(800, 200, k)
        choices[i] = [0] * k
    fl = careless.flags(x, times, choices, p_guess=0.125)
    excluded = [i for i, f in enumerate(fl) if f["wyklucz"]]
    assert set(range(10)) <= set(excluded)
    assert len(excluded) <= 15, "mało fałszywych alarmów"


def test_guttman_errors():
    perfect = np.array([[1, 1, 0, 0], [1, 0, 0, 0], [1, 1, 1, 0]], float)
    reversed_ = np.array([[0, 0, 1, 1], [1, 1, 0, 0], [1, 1, 1, 0]], float)
    assert careless.guttman_errors(perfect)[0] == 0
    assert careless.guttman_errors(reversed_)[0] == 1


# ---------- IQ i wynik łączny ----------

def test_iq_preliminary_and_ci():
    norm_small = {"n": 20, "mean": 10, "sd": 3}
    assert scoring.to_iq(13, 1.5, norm_small)["status"] == "brak"
    prelim = scoring.to_iq(13, 1.5, {"n": 150, "mean": 10, "sd": 3})
    final = scoring.to_iq(13, 1.5, {"n": 5000, "mean": 10, "sd": 3})
    assert prelim["status"] == "wstepna" and final["status"] == "normy"
    assert prelim["iq"] == final["iq"] == 115
    assert prelim["se"] > final["se"], "mniejsza próba = większy błąd"
    assert final["ci"][0] < 115 < final["ci"][1]


def test_iq_ci_coverage_by_simulation():
    """Przedział 95% obejmuje prawdziwe IQ w ok. 95% przypadków (normy z próby N = 200)."""
    rng = np.random.default_rng(11)
    hits, trials = 0, 2000
    sem = 0.4
    for _ in range(trials):
        sample = rng.standard_normal(200) + rng.normal(0, sem, 200)
        norm = {"n": 200, "mean": sample.mean(), "sd": sample.std(ddof=1)}
        true = rng.standard_normal()
        observed = true + rng.normal(0, sem)
        r = scoring.to_iq(observed, sem, norm)
        # prawdziwe IQ: pozycja prawdziwego wyniku w populacji obserwowanych wyników
        true_iq = 100 + 15 * true / math.sqrt(1 + sem ** 2)
        hits += r["ci"][0] - 0.5 <= true_iq <= r["ci"][1] + 0.5
    assert 0.9 < hits / trials < 0.99


def test_age_norms():
    ages = [18, 19, 25, 26, 27, 45]
    norms = scoring.build_norms([10, 12, 20, 22, 24, 30], ages)
    assert norms[(16, 19)]["n"] == 2 and norms[(20, 29)]["mean"] == 22
    assert scoring.age_band(35) == (30, 39) and scoring.age_band(10) is None


def test_composite_one_test_equals_that_test():
    one = scoring.composite([1.0], [0.84], [0.7])
    assert one["z"] == pytest.approx(1.0)
    assert one["se"] == pytest.approx(math.sqrt(1 - 0.84))


def test_composite_error_shrinks_with_more_tests():
    ses = [scoring.composite([1.0] * k, [0.8] * k, [0.7] * k)["se"] for k in (1, 2, 3, 5)]
    assert ses == sorted(ses, reverse=True) and ses[-1] < ses[0] * 0.7
    assert scoring.composite([0, 0], [0.8, 0.8], [0.7, 0.7])["iq"] == pytest.approx(100)


def test_composite_matches_simulation():
    """SE z composite() zgadza się z rozrzutem wyniku łącznego wokół
    prawdziwego wyniku łącznego w symulacji (testy z błędem pomiaru)."""
    rng = np.random.default_rng(13)
    lam, rel = np.array([0.8, 0.6, 0.7]), np.array([0.85, 0.8, 0.9])
    n = 20000
    g = rng.standard_normal(n)
    # prawdziwy wynik testu: λg + reszta swoista, wariancja r_i; obserwowany: + błąd, wariancja 1 − r_i
    true = g[:, None] * lam + rng.standard_normal((n, 3)) * np.sqrt(rel - lam ** 2)
    obs = true + rng.standard_normal((n, 3)) * np.sqrt(1 - rel)
    var_c = np.outer(lam, lam).sum() - (lam ** 2).sum() + 3
    zc_true = true.sum(axis=1) / np.sqrt(var_c)
    zc_obs = np.array([scoring.composite(row, rel, lam)["z"] for row in obs[:4000]])
    se = scoring.composite([0, 0, 0], rel, lam)["se"]
    assert np.std(zc_obs - zc_true[:4000]) == pytest.approx(se, rel=0.05)


# ---------- eksport z bazy API ----------

def test_load_first_attempts(tmp_path):
    db = tmp_path / "r.db"
    conn = sqlite3.connect(db)
    conn.execute("""CREATE TABLE results (id INTEGER PRIMARY KEY, test TEXT, participant TEXT, started_at TEXT,
        received_on TEXT, duration_ms INT, timed_out INT, birth_year INT, education TEXT, score INT,
        n_responses INT, responses TEXT)""")
    def add(pid, correct, by):
        resp = [{"item": i + 1, "correct": i < correct, "ms": 4000, "choice": 0} for i in range(4)]
        conn.execute("INSERT INTO results (test, participant, started_at, received_on, duration_ms, timed_out, "
                     "birth_year, education, score, n_responses, responses) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                     ("t", pid, "x", "2026-11-12", 1, 0, by, None, correct, 4, json.dumps(resp)))
    add("p1", 2, 1990)
    add("p2", 4, None)
    add("p1", 4, 1990)  # drugie podejście - pomijane
    conn.commit()
    d = data.load(str(db), "t", 4)
    assert d.participants == ["p1", "p2"]
    assert np.nansum(d.responses, axis=1).tolist() == [2, 4]
    assert np.isnan(d.birth_year[1])
    out = tmp_path / "o.csv"
    data.export_csv(d, str(out))
    assert "p1" not in out.read_text(), "w eksporcie bez identyfikatorów"


def test_assisted_matches_api_thresholds():
    a = careless.assisted(["nie", "ai", "inna", None, None, None],
                          [0, 0, 0, 3, 1, 2], [0, 0, 0, 1000, 25_000, 5_000])
    assert a.tolist() == [False, True, True, True, True, False]


def test_slow_and_accurate_flags_only_slow_top_scorers():
    rng = np.random.default_rng(1)
    n, k = 200, 16
    times = rng.lognormal(np.log(8000), 0.3, size=(n, k))
    resp = (rng.random((n, k)) < 0.5).astype(float)
    times[0] *= 6          # bardzo wolno ...
    resp[0] = 1            # ... i bezbłędnie: flaga
    times[1] *= 6          # bardzo wolno, ale słaby wynik: bez flagi
    resp[1] = 0
    flagged = careless.slow_and_accurate(resp, times)
    assert flagged[0] and not flagged[1]
    assert flagged.sum() <= 3
