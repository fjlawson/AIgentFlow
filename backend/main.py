import httpx

from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from supabase import create_client

from database import SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY


app = FastAPI(title="AIgentFlow API")
security = HTTPBearer()


class LoginRequest(BaseModel):
    email: str
    password: str


@app.get("/")
def root():
    return {
        "message": "AIgentFlow backend is running",
        "supabase": "configured"
    }


@app.post("/login")
def login(credentials: LoginRequest):
    try:
        client = create_client(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY
        )

        response = client.auth.sign_in_with_password({
            "email": credentials.email,
            "password": credentials.password
        })

        return {
            "message": "Login successful",
            "user_id": response.user.id,
            "access_token": response.session.access_token
        }

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )


@app.get("/teams")
def get_teams(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    token = credentials.credentials

    headers = {
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": f"Bearer {token}"
    }

    response = httpx.get(
        f"{SUPABASE_URL}/rest/v1/teams",
        headers=headers,
        params={"select": "*"}
    )

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail="Unable to retrieve teams"
        )

    return response.json()