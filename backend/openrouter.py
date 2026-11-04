import os
from datetime import datetime, timezone

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from supabase import create_client
from supabase_auth.errors import AuthApiError

from database import SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY

router = APIRouter(prefix="/openrouter", tags=["OpenRouter"])
security = HTTPBearer()

OPENROUTER_URL = "https://openrouter.ai/api/v1"


class SaveKeyRequest(BaseModel):
    key: str


class TestPromptRequest(BaseModel):
    model: str
    prompt: str


def get_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    client = create_client(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    try:
        user = client.auth.get_user(credentials.credentials).user
    except AuthApiError:
        raise HTTPException(status_code=401, detail="Please log in again")

    if not user:
        raise HTTPException(status_code=401, detail="Please log in again")

    return user.id


# built per request so a missing secret only breaks key saving, not the whole backend
def get_fernet():
    secret = os.getenv("KEY_ENCRYPTION_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Key storage is not configured")
    return Fernet(secret)


# api_keys has no RLS policies, so only the secret key can read or write it
def get_admin_client():
    return create_client(SUPABASE_URL, os.getenv("SUPABASE_SECRET_KEY"))


def find_saved_key(user_id):
    result = (
        get_admin_client().table("api_keys")
        .select("encrypted_key")
        .eq("user_id", user_id)
        .eq("provider", "openrouter")
        .execute()
    )
    return result.data[0]["encrypted_key"] if result.data else None


def ask_model(user_id, model, prompt):
    encrypted_key = find_saved_key(user_id)
    if not encrypted_key:
        raise HTTPException(status_code=400, detail="Add your OpenRouter key in Settings first")

    try:
        key = get_fernet().decrypt(encrypted_key.encode()).decode()
    except InvalidToken:
        raise HTTPException(status_code=400, detail="Your saved key can't be read. Please save it again")

    try:
        response = httpx.post(
            f"{OPENROUTER_URL}/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={"model": model, "messages": [{"role": "user", "content": prompt}]},
            # models can take a while to answer, and httpx gives up after 5 seconds by default
            timeout=60
        )
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Couldn't reach OpenRouter")

    try:
        data = response.json()
    except ValueError:
        data = {}

    # these are the user's OpenRouter problems, so they can't be a 401 from us
    if response.status_code == 401:
        raise HTTPException(status_code=400, detail="OpenRouter rejected your saved key")
    if response.status_code == 402:
        raise HTTPException(status_code=402, detail="Your OpenRouter account is out of credits")

    # OpenRouter can send an error with a 200 if the model fails partway through
    if response.status_code != 200 or "error" in data:
        message = (data.get("error") or {}).get("message", "OpenRouter couldn't run that request")
        raise HTTPException(status_code=502, detail=message)

    return data["choices"][0]["message"]["content"]


@router.get("/key")
def get_key_status(user_id=Depends(get_user_id)):
    # only says if a key exists, the key itself never goes back to the browser
    return {"saved": find_saved_key(user_id) is not None}


@router.post("/key")
def save_key(details: SaveKeyRequest, user_id=Depends(get_user_id)):
    key = details.key.strip()
    if not key:
        raise HTTPException(status_code=422, detail="Please enter a key")

    fernet = get_fernet()

    try:
        response = httpx.get(
            f"{OPENROUTER_URL}/key",
            headers={"Authorization": f"Bearer {key}"},
            timeout=10
        )
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Couldn't reach OpenRouter")

    if response.status_code == 401:
        raise HTTPException(status_code=400, detail="OpenRouter didn't accept that key")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Couldn't check that key with OpenRouter")

    (
        get_admin_client().table("api_keys")
        .upsert({
            "user_id": user_id,
            "provider": "openrouter",
            "encrypted_key": fernet.encrypt(key.encode()).decode(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
        .execute()
    )

    return {"saved": True}


@router.post("/test")
def test_prompt(details: TestPromptRequest, user_id=Depends(get_user_id)):
    return {"answer": ask_model(user_id, details.model, details.prompt)}
