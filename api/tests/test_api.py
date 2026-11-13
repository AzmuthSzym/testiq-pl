import copy
from datetime import datetime
import json
import os
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.backup import backup_once
from app.main import MAX_BODY_BYTES, create_app
from app.norms import summarize
from app.ratelimit import RateLimiter

ORIGIN = "https://azmuthszym.github.io"


def make_result(participant="11111111-2222-3333-4444-555555555555", correct=10, started="2026-11-12T10:00:00Z"):
    responses = [
        {"item": i + 1, "moves": 1 + i // 5, "choice": 0, "correct": i < correct, "ms": 5000}
        for i in range(20)
    ]
    return {
        "test": "kostka-v1", "version": 1, "participant": participant,
        "startedAt": started, "durationMs": 300000, "timedOut": False,
        "meta": {"birthYear": 1990, "education": "wyzsze", "consent": True},
        "responses": responses,
    }


@pytest.fixture
def client(tmp_path):
    app = create_app(db_path=str(tmp_path / "t.db"), trust_proxy=True, rate_limit=1000)
    with TestClient(app) as c:
        c.db_path = str(tmp_path / "t.db")
        yield c


def post(client, body, ip="1.2.3.4", **headers):
    return client.post("/api/results", content=json.dumps(body),
                       headers={"Content-Type": "application/json", "X-Real-IP": ip, **headers})


def test_health(client):
    assert client.get("/api/health").json() == {"ok": True}


def test_stores_valid_result(client):
    r = post(client, make_result())
    assert r.status_code == 201
    assert r.json() == {"stored": True, "duplicate": False}
    rows = sqlite3.connect(client.db_path).execute("SELECT score, birth_year, received_on FROM results").fetchall()
    assert rows[0][0] == 10 and rows[0][1] == 1990
    assert len(rows[0][2]) == 10  # tylko data, bez godziny


def test_duplicate_is_not_stored_twice(client):
    post(client, make_result())
    r = post(client, make_result())
    assert r.status_code == 201 and r.json()["duplicate"] is True
    assert client.get("/api/norms/kostka-v1").json()["n"] == 1


def test_rejects_without_consent(client):
    body = make_result()
    body["meta"]["consent"] = False
    r = post(client, body)
    assert r.status_code == 422
    assert sqlite3.connect(client.db_path).execute("SELECT COUNT(*) FROM results").fetchone()[0] == 0


@pytest.mark.parametrize("mutate", [
    lambda b: b.pop("responses"),
    lambda b: b.update(test="nieznany-test"),
    lambda b: b.update(test="Kostka V1!"),
    lambda b: b.update(participant="x"),
    lambda b: b.update(durationMs=-5),
    lambda b: b["meta"].update(birthYear=1800),
    lambda b: b["meta"].update(birthYear=datetime.now().year - 15),  # poniżej 16 lat
    lambda b: b["meta"].update(education="doktorat-z-kosmosu"),
    lambda b: b["meta"].update(sex="x"),
    lambda b: b["meta"].update(nativeLang="niemiecki"),  # tylko „pl” albo „inny”
    lambda b: b["meta"].update(country="DE"),
    lambda b: b["meta"].update(nationality="polska"),  # narodowości nie zbieramy
    lambda b: b["meta"].update(assist="troche"),
    lambda b: b["responses"][0].update(away=-1),
    lambda b: b["responses"][0].update(awayMs=10**9),
    lambda b: b["meta"].update(email="ktos@example.com"),  # nadmiarowe dane osobowe
    lambda b: b.update(ip="1.2.3.4"),
    lambda b: b["responses"][0].update(item=21),
    lambda b: b["responses"][1].update(item=1),  # powtórzone zadanie
    lambda b: b["responses"][0].update(ms="szybko"),
    lambda b: b["responses"][0].update(choice="x" * 100),
    lambda b: b["responses"].extend(copy.deepcopy(b["responses"])),
])
def test_rejects_invalid(client, mutate):
    body = make_result()
    mutate(body)
    assert post(client, body).status_code == 422


def test_rejects_non_json(client):
    r = client.post("/api/results", content=b"nie json", headers={"Content-Type": "application/json"})
    assert r.status_code == 422


def test_body_size_limit(client):
    body = make_result()
    body["padding"] = "x" * (MAX_BODY_BYTES + 10)
    r = post(client, body)
    assert r.status_code == 413


def test_rate_limit_per_ip(tmp_path):
    app = create_app(db_path=str(tmp_path / "r.db"), trust_proxy=True, rate_limit=3)
    with TestClient(app) as c:
        codes = [post(c, make_result(participant=f"participant-{i:04d}"), ip="9.9.9.9").status_code
                 for i in range(4)]
        assert codes == [201, 201, 201, 429]
        # inny adres ma własny limit
        assert post(c, make_result(participant="participant-x001"), ip="8.8.8.8").status_code == 201


def test_rate_limiter_does_not_keep_ips_and_rotates_salt():
    day = ["2026-11-12"]
    clock = [0.0]
    lim = RateLimiter(2, 3600, clock=lambda: clock[0], today=lambda: day[0])
    k1 = lim.key_for("1.2.3.4")
    assert "1.2.3.4" not in k1 and len(k1) == 64
    assert lim.allow("1.2.3.4") and lim.allow("1.2.3.4") and not lim.allow("1.2.3.4")
    assert all("1.2.3.4" not in k for k in lim._hits)
    clock[0] = 3601
    assert lim.allow("1.2.3.4"), "okno minęło"
    day[0] = "2026-11-13"
    assert lim.key_for("1.2.3.4") != k1, "nowa sól nowego dnia"


def test_cors_only_for_github_pages(client):
    ok = client.options("/api/results", headers={
        "Origin": ORIGIN, "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"})
    assert ok.headers.get("access-control-allow-origin") == ORIGIN
    bad = client.options("/api/results", headers={
        "Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert bad.headers.get("access-control-allow-origin") is None
    get = client.get("/api/norms/kostka-v1", headers={"Origin": "https://evil.example"})
    assert get.headers.get("access-control-allow-origin") is None


def test_norms_use_first_attempt_only(client):
    for i, score in enumerate([5, 10, 15]):
        post(client, make_result(participant=f"person-{i:04d}", correct=score))
    # drugie podejście osoby 0 (wyższy wynik) nie liczy się do norm
    post(client, make_result(participant="person-0000", correct=20, started="2026-11-12T11:00:00Z"))
    stats = client.get("/api/norms/kostka-v1").json()
    assert stats["n"] == 3
    assert stats["mean"] == 10
    assert stats["sd"] == 5
    assert stats["distribution"][5] == 1 and stats["distribution"][20] == 0
    assert len(stats["distribution"]) == 21
    assert "niereprezentatywna" in stats["sample"]


def test_both_cube_versions_accepted_separately(client):
    post(client, make_result())
    body = make_result()
    body["test"] = "kostka-v2"
    assert post(client, body).status_code == 201
    assert client.get("/api/norms/kostka-v1").json()["n"] == 1
    assert client.get("/api/norms/kostka-v2").json()["n"] == 1


def test_norms_reliability_and_age_groups(client):
    # 40 osób: wynik zależy od "zdolności", więc zadania są spójne (KR-20 wysokie)
    for i in range(40):
        body = make_result(participant=f"person-{i:04d}", correct=i % 21)
        body["meta"]["birthYear"] = 2000 if i < 35 else 1960
        post(client, body)
    stats = client.get("/api/norms/kostka-v1").json()
    assert stats["n"] == 40
    assert stats["reliability"] > 0.9
    # grupa 20-29 lat ma 35 osób (pokazana), 60-69 tylko 5 (ukryta)
    assert [(g["from"], g["n"]) for g in stats["byAge"]] == [(20, 35)]


def test_norms_small_sample_has_no_reliability(client):
    post(client, make_result())
    stats = client.get("/api/norms/kostka-v1").json()
    assert stats["reliability"] is None and stats["byAge"] == []


def test_norms_unknown_test(client):
    assert client.get("/api/norms/nie-ma").status_code == 404


def test_summarize_edge_cases():
    assert summarize([], 3) == {"n": 0, "mean": None, "sd": None, "sem": None, "distribution": [0, 0, 0, 0]}
    one = summarize([2], 3)
    assert one["n"] == 1 and one["sd"] is None


def test_backup(tmp_path, client):
    post(client, make_result())
    backup_dir = tmp_path / "b"
    target = backup_once(client.db_path, str(backup_dir), keep=2)
    copy_conn = sqlite3.connect(target)
    assert copy_conn.execute("SELECT COUNT(*) FROM results").fetchone()[0] == 1
    copy_conn.close()
    for name in ["results-2020-01-01.db", "results-2020-01-02.db"]:
        (backup_dir / name).write_bytes(b"")
    backup_once(client.db_path, str(backup_dir), keep=2)
    assert len(os.listdir(backup_dir)) == 2
    assert not (backup_dir / "results-2020-01-01.db").exists()


def test_stores_sex_language_country(client):
    body = make_result()
    body["meta"].update(sex="k", nativeLang="inny", country="pl")
    assert post(client, body).status_code == 201
    row = sqlite3.connect(client.db_path).execute("SELECT sex, native_lang, country FROM results").fetchone()
    assert row == ("k", "inny", "pl")


def test_old_database_gets_new_columns(tmp_path):
    path = str(tmp_path / "old.db")
    conn = sqlite3.connect(path)
    conn.executescript("""CREATE TABLE results (id INTEGER PRIMARY KEY AUTOINCREMENT, test TEXT NOT NULL,
        participant TEXT NOT NULL, started_at TEXT NOT NULL, received_on TEXT NOT NULL,
        duration_ms INTEGER NOT NULL, timed_out INTEGER NOT NULL, birth_year INTEGER, education TEXT,
        score INTEGER NOT NULL, n_responses INTEGER NOT NULL, responses TEXT NOT NULL,
        UNIQUE (test, participant, started_at));
        INSERT INTO results VALUES (1,'kostka-v1','p1','2026-01-01T00:00:00+00:00','2026-01-01',1,0,1990,NULL,5,20,'[]');""")
    conn.close()
    app = create_app(db_path=path, trust_proxy=True, rate_limit=1000)
    with TestClient(app) as c:
        body = make_result()
        body["meta"]["sex"] = "m"
        assert post(c, body).status_code == 201
    rows = sqlite3.connect(path).execute("SELECT score, sex FROM results ORDER BY id").fetchall()
    assert rows == [(5, None), (10, "m")]


def test_language_test_norms_only_native_speakers(client):
    def vocab(pid, correct, lang):
        return {"test": "slownictwo-v1", "version": 1, "participant": pid,
                "startedAt": "2026-11-12T10:00:00Z", "durationMs": 300000, "timedOut": False,
                "meta": {"nativeLang": lang, "consent": True},
                "responses": [{"item": i + 1, "choice": 0, "correct": i < correct, "ms": 5000} for i in range(20)]}
    assert post(client, vocab("participant-pl-1", 15, "pl")).status_code == 201
    assert post(client, vocab("participant-xx-1", 3, "inny")).status_code == 201
    assert post(client, vocab("participant-nn-1", 13, None)).status_code == 201
    norms = client.get("/api/norms/slownictwo-v1").json()
    assert norms["n"] == 2 and norms["mean"] == 14


def test_assisted_tests_are_left_out_of_norms(client):
    honest = make_result(participant="participant-honest-1", correct=10)
    honest["meta"]["assist"] = "nie"
    ai = make_result(participant="participant-ai-0001", correct=20)
    ai["meta"]["assist"] = "ai"
    left_tab = make_result(participant="participant-tab-001", correct=19)
    for r in left_tab["responses"][:3]:
        r.update(away=1, awayMs=15000)
    one_blip = make_result(participant="participant-blip-01", correct=12)
    one_blip["responses"][4].update(away=1, awayMs=800)  # jedno krótkie wyjście nie wyklucza
    unknown = make_result(participant="participant-unkn-01", correct=8)  # brak odpowiedzi: liczymy
    for body in (honest, ai, left_tab, one_blip, unknown):
        assert post(client, body).status_code == 201
    norms = client.get("/api/norms/kostka-v1").json()
    assert norms["n"] == 3 and norms["excluded"] == 2
    assert norms["mean"] == 10
    stored = sqlite3.connect(client.db_path).execute(
        "SELECT assist FROM results WHERE participant = 'participant-ai-0001'").fetchone()
    assert stored == ("ai",)
