import httpx

from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from supabase import create_client
from supabase_auth.errors import AuthApiError

from database import SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY


app = FastAPI(title="AIgentFlow API")
security = HTTPBearer()


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    username: str
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
            "username": response.user.user_metadata.get("username"),
            "access_token": response.session.access_token
        }

    except AuthApiError as error:
        if error.code == "email_not_confirmed":
            raise HTTPException(
                status_code=401,
                detail="Please confirm your email before logging in"
            )
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )


@app.post("/register")
def register(details: RegisterRequest):
    client = create_client(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    )

    try:
        # username goes in the user's metadata so login can hand it back for the navbar
        response = client.auth.sign_up({
            "email": details.email,
            "password": details.password,
            "options": {"data": {"username": details.username}}
        })
    except AuthApiError as error:
        raise HTTPException(status_code=400, detail=error.message)

    # session is empty when Supabase has email confirmation turned on
    return {
        "message": "Account created",
        "user_id": response.user.id,
        "username": details.username,
        "access_token": response.session.access_token if response.session else None
    }


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