"""Schemat wyniku przysyłanego przez stronę (format opisany w README)."""

from datetime import datetime
from typing import Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator

EDUCATION = Literal["podstawowe", "zawodowe", "srednie", "wyzsze-w-trakcie", "wyzsze"]
SEX = Literal["k", "m", "inna"]
# Język ojczysty i kraj: tylko „polski / inny” i „Polska / inny”. Dokładniejsze
# odpowiedzi nie są potrzebne do norm, a zwiększałyby ryzyko identyfikacji.
NATIVE_LANG = Literal["pl", "inny"]
COUNTRY = Literal["pl", "inny"]


# Zgody w RODO (w Polsce) może udzielić osoba, która ukończyła 16 lat.
MIN_AGE = 16


class Meta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    birthYear: Optional[int] = Field(default=None, ge=1900)
    education: Optional[EDUCATION] = None
    sex: Optional[SEX] = None
    nativeLang: Optional[NATIVE_LANG] = None
    country: Optional[COUNTRY] = None
    consent: bool


    @field_validator("birthYear")
    @classmethod
    def adult_enough(cls, v):
        if v is not None and datetime.now().year - v < MIN_AGE:
            raise ValueError("osoba poniżej 16 lat")
        return v


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
    # poziom trudności albo część testu
    level: Optional[int] = Field(default=None, ge=0, le=100)
    # pamięć robocza: długość ciągu cyfr
    span: Optional[int] = Field(default=None, ge=1, le=20)

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
