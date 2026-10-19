import os

import httpx
import stripe

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from supabase import create_client
from supabase_auth.errors import AuthApiError

from database import SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY


app = FastAPI(title="AIgentFlow API")
security = HTTPBearer()

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

# stand-ins until the marketplace has real teams. prices are in cents, and they live
# here instead of the page so a user can't edit the price in their browser
MOCK_TEAMS = {
    "mock-geopolitics": {"name": "Geopolitics Team", "price": 999},
    "mock-sports-betting": {"name": "Sports Betting Team", "price": 1499},
}


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class CheckoutRequest(BaseModel):
    team_id: str


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


@app.post("/checkout")
def checkout(
    details: CheckoutRequest,
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    team = MOCK_TEAMS.get(details.team_id)
    if not team:
        raise HTTPException(status_code=404, detail="That team doesn't exist")

    # ask Supabase who the token belongs to instead of trusting a user id from the page
    client = create_client(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    try:
        user = client.auth.get_user(credentials.credentials).user
    except AuthApiError:
        raise HTTPException(status_code=401, detail="Please log in again")

    # send the user back to whichever site they came from (localhost, preview, or production)
    site = request.headers.get("origin", "https://aigentflow.vercel.app")

    # the webhook reads user_id and team_id from metadata to grant the team, so keep these names
    metadata = {"user_id": user.id, "team_id": details.team_id}

    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": "usd",
                "product_data": {"name": team["name"]},
                "unit_amount": team["price"]
            },
            "quantity": 1
        }],
        metadata=metadata,
        # also copy it onto the payment so it shows up on the Payments page in the Stripe dashboard
        payment_intent_data={"metadata": metadata},
        success_url=f"{site}/marketplace.html?checkout=success",
        cancel_url=f"{site}/marketplace.html?checkout=canceled"
    )

    return {"url": session.url}
