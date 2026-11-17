"""API zbierające wyniki testów i udostępniające bieżące statystyki.

Konfiguracja przez zmienne środowiskowe:
  DB_PATH          ścieżka bazy SQLite (domyślnie ./data/results.db)
  ALLOWED_ORIGIN   dozwolone originy CORS, rozdzielone przecinkami (domyślnie https://azmuthszym.github.io)
  TRUST_PROXY      "1" = adres klienta z nagłówka X-Real-IP (ustawia go nginx)
  RATE_LIMIT       liczba wyników na adres na godzinę (domyślnie 20)
"""

import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .db import Database
from .models import DeleteRequest, Result
from .norms import assisted, by_age, kr20, summarize
from .scoring import counted
from .ratelimit import RateLimiter
from .tests_registry import TESTS

MAX_BODY_BYTES = 64 * 1024
NORMS_CACHE_SECONDS = 60.0


def create_app(
    db_path: str | None = None,
    allowed_origin: str | None = None,
    trust_proxy: bool | None = None,
    rate_limit: int | None = None,
    limiter: RateLimiter | None = None,
) -> FastAPI:
    db_path = db_path or os.environ.get("DB_PATH", "./data/results.db")
    allowed_origin = allowed_origin or os.environ.get("ALLOWED_ORIGIN", "https://azmuthszym.github.io")
    if trust_proxy is None:
        trust_proxy = os.environ.get("TRUST_PROXY") == "1"
    if rate_limit is None:
        rate_limit = int(os.environ.get("RATE_LIMIT", "20"))

    database = Database(db_path)

    @asynccontextmanager
    async def lifespan(_app):
        yield
        database.close()

    app = FastAPI(title="Test IQ PL API", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.db = database
    app.state.limiter = limiter or RateLimiter(rate_limit, 3600.0)
    app.state.norms_cache = {}

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in allowed_origin.split(",") if o.strip()],
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        max_age=86400,
    )

    def client_ip(request: Request) -> str:
        if trust_proxy:
            forwarded = request.headers.get("x-real-ip")
            if forwarded:
                return forwarded.strip()
        return request.client.host if request.client else "unknown"

    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.post("/api/results", status_code=201)
    async def post_result(request: Request):
        declared = request.headers.get("content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > MAX_BODY_BYTES):
            raise HTTPException(413, "Zbyt duże zgłoszenie.")
        body = b""
        async for chunk in request.stream():
            body += chunk
            if len(body) > MAX_BODY_BYTES:
                raise HTTPException(413, "Zbyt duże zgłoszenie.")

        if not app.state.limiter.allow(client_ip(request)):
            raise HTTPException(429, "Za dużo zgłoszeń. Spróbuj później.")

        try:
            result = Result.model_validate_json(body)
        except ValidationError as e:
            return JSONResponse(
                status_code=422,
                content={"detail": "Nieprawidłowy format wyniku.",
                         "errors": [{"loc": list(x["loc"]), "msg": x["msg"]} for x in e.errors()[:10]]},
            )

        if not result.meta.consent:
            raise HTTPException(422, "Brak zgody na wykorzystanie wyniku - nic nie zapisano.")
        spec = TESTS.get(result.test)
        if spec is None:
            raise HTTPException(422, "Nieznany test.")
        items = [r.item for r in result.responses]
        if len(items) > spec["items"] or len(set(items)) != len(items) or any(i > spec["items"] for i in items):
            raise HTTPException(422, "Odpowiedzi nie pasują do testu.")

        score = sum(1 for r in result.responses if counted(r.model_dump()))
        stored = app.state.db.insert_result(result, score)
        app.state.norms_cache.pop(result.test, None)
        return {"stored": stored, "duplicate": not stored}

    @app.post("/api/delete")
    async def delete_results(request: Request):
        """Usunięcie wszystkich wyników uczestnika. Identyfikator to losowy
        UUID znany tylko przeglądarce uczestnika, więc jego znajomość wystarcza
        do potwierdzenia, że prośba pochodzi od tej osoby."""
        body = await request.body()
        if len(body) > 1024:
            raise HTTPException(413, "Zbyt duże zgłoszenie.")
        if not app.state.limiter.allow(client_ip(request)):
            raise HTTPException(429, "Za dużo zgłoszeń. Spróbuj później.")
        try:
            req = DeleteRequest.model_validate_json(body)
        except ValidationError:
            raise HTTPException(422, "Nieprawidłowy identyfikator.")
        deleted = app.state.db.delete_participant(req.participant)
        app.state.norms_cache.clear()
        return {"deleted": deleted}

    @app.get("/api/norms/{test}")
    def norms(test: str):
        spec = TESTS.get(test)
        if spec is None:
            raise HTTPException(404, "Nieznany test.")
        cached = app.state.norms_cache.get(test)
        now = time.monotonic()
        if cached and now - cached[0] < NORMS_CACHE_SECONDS:
            return cached[1]
        all_attempts = app.state.db.first_attempts(test, native_only=spec.get("language", False))
        attempts = [a for a in all_attempts if not assisted(a)]
        stats = summarize([a["score"] for a in attempts], spec["max_score"])
        stats.update({
            "reliability": kr20(attempts, spec["items"]),
            "byAge": by_age(attempts, spec["max_score"]),
            "test": test,
            "maxScore": spec["max_score"],
            # ile testów pominięto (pomoc AI lub inna, wychodzenie z karty)
            "excluded": len(all_attempts) - len(attempts),
            "sample": "pierwsze podejście każdego uczestnika, który wyraził zgodę; bez testów rozwiązanych z pomocą; próba ochotnicza, niereprezentatywna",
        })
        app.state.norms_cache[test] = (now, stats)
        return stats

    return app
