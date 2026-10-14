import sys
from pathlib import Path

from fastapi import FastAPI

# backend/main.py imports database.py by name, so the backend folder has to be on the path
sys.path.append(str(Path(__file__).parent.parent / "backend"))

from main import app as backend_app

# Vercel sends every /api/* request here, so the backend's routes live under /api
app = FastAPI()
app.mount("/api", backend_app)
