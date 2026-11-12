"""Schemat wyniku przysyłanego przez stronę (format opisany w README)."""

from datetime import datetime
from typing import Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator

EDUCATION = Literal["podstawowe", "zawodowe", "srednie", "wyzsze-w-trakcie", "wyzsze"]


class Meta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    birthYear: Optional[int] = Field(default=None, ge=1900, le=2025)
    education: Optional[EDUCATION] = None
    consent: bool


class Response(BaseModel):
    """Odpowiedź na jedno zadanie. Pola wspólne dla wszystkich testów plus
    kilka opcjonalnych, używanych przez poszczególne testy."""

    model_config = ConfigDict(extra="forbid")

    item: int = Field(ge=1, le=500)
    correct: bool
    ms: int = Field(ge=0, le=3_600_000)
    # kostka: liczba obrotów i wybrana opcja (0-5)
    moves: Optional[int] = Field(default=None, ge=0, le=50)
    # wybór (indeks) albo wpisana odpowiedź
    choice: Optional[Union[int, str]] = None
    # długość sekwencji / poziom trudności
    level: Optional[int] = Field(default=None, ge=0, le=100)

    @field_validator("choice")
    @classmethod
    def short_choice(cls, v):
        if isinstance(v, str) and len(v) > 64:
            raise ValueError("choice za długie")
        if isinstance(v, int) and not -1 <= v <= 1000:
            raise ValueError("choice poza zakresem")
        return v


class Result(BaseModel):
    model_config = ConfigDict(extra="forbid")

    test: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,39}$")
    version: Optional[int] = Field(default=None, ge=1, le=1000)
    participant: str = Field(pattern=r"^[A-Za-z0-9-]{8,64}$")
    startedAt: datetime
    durationMs: int = Field(ge=0, le=24 * 3600 * 1000)
    timedOut: bool
    meta: Meta
    responses: list[Response] = Field(max_length=500)
