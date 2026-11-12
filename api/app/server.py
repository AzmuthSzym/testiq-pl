"""Punkt wejścia dla uvicorn: ``uvicorn app.server:app``."""

import os

from .main import create_app

os.makedirs(os.path.dirname(os.environ.get("DB_PATH", "./data/results.db")) or ".", exist_ok=True)
app = create_app()
