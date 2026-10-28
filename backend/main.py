import os

import httpx
import stripe

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from supabase import create_client
from supabase_auth.errors import AuthApiError

from database import SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
from admin import router as admin_router #from admin.py
from datetime import datetime, timezone

app = FastAPI(title="AIgentFlow API")
app.include_router(admin_router)
security = HTTPBearer()

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY")

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

# Verifies current user for admin verification. Returns user info
@app.get("/users/me")
def get_current_user_info(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    token = credentials.credentials

    client = create_client(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    )

    try:
        auth_response = client.auth.get_user(token)
        auth_user = auth_response.user
    except AuthApiError:
        raise HTTPException(
            status_code=401,
            detail="Please log in again"
        )

    if not auth_user:
        raise HTTPException(
            status_code=401,
            detail="Please log in again"
        )

    # Query as the authenticated user so Supabase Row-Level Security
    # policies apply to this user's request.
    client.postgrest.auth(token)

    profile_response = (
        client.table("profiles")
        .select("username, role")
        .eq("id", auth_user.id)
        .maybe_single()
        .execute()
    )

    profile = profile_response.data

    if not profile:
        raise HTTPException(
            status_code=404,
            detail="User profile not found"
        )

    return {
        "id": auth_user.id,
        "username": (
            profile.get("username")
            or (auth_user.user_metadata or {}).get("username")
        ),
        "role": profile.get("role", "user")
    }

@app.post("/login")
def login(credentials: LoginRequest):
    try:
        auth_client = create_client(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY
        )

        auth_response = auth_client.auth.sign_in_with_password({
            "email": credentials.email,
            "password": credentials.password
        })

        user = auth_response.user
        session = auth_response.session

        if not user or not session:
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password"
            )

        admin_client = create_client(
            SUPABASE_URL,
            SUPABASE_SECRET_KEY
        )

        ban_response = (
            admin_client.table("bans")
            .select("id,user_id,reason,end_time,is_active")
            .eq("user_id", user.id)
            .eq("is_active", True)
            .execute()
        )

        now = datetime.now(timezone.utc).isoformat()
        active_ban = None

        for ban in ban_response.data or []:
            end_time = ban.get("end_time")

            # A null end_time represents a permanent ban.
            if end_time is None:
                active_ban = ban
                break

            try:
                parsed_end_time = datetime.fromisoformat(
                    end_time.replace("Z", "+00:00")
                )
            except (TypeError, ValueError):
                print(
                    "Invalid ban end_time:",
                    ban.get("id"),
                    repr(end_time)
                )
                continue

            # Ensure a timestamp without timezone information is treated
            # consistently. Ideally the database column is timestamptz.
            if parsed_end_time.tzinfo is None:
                parsed_end_time = parsed_end_time.replace(
                    tzinfo=timezone.utc
                )

            if parsed_end_time > now:
                active_ban = ban
                break

        if active_ban is not None:
            end_time = active_ban.get("end_time")
            reason = (active_ban.get("reason") or "No reason provided")

            if end_time:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Your account is temporarily banned until "
                        f"{end_time}. Reason: {reason}"
                    )
                )

            raise HTTPException(
                status_code=403,
                detail=(
                    "Your account is permanently banned. "
                    f"Reason: {reason}"
                )
            )

        return {
            "message": "Login successful",
            "user_id": user.id,
            "username": (
                user.user_metadata or {}
            ).get("username"),
            "access_token": session.access_token
        }

    except HTTPException:
        raise

    except AuthApiError as error:
        print(
            "Supabase authentication error:",
            error.code,
            error.message
        )

        if error.code == "email_not_confirmed":
            raise HTTPException(
                status_code=401,
                detail="Please confirm your email before logging in"
            )

        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    except Exception as error:
        print(
            "Unexpected login error:",
            type(error).__name__,
            repr(error)
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to complete login right now"
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


# getting the payment info from stripe
@app.post("/webhook")
async def stripe_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("stripe-signature")
    secret = os.getenv("STRIPE_WEBHOOK_SECRET")

    if not secret:
        raise HTTPException(status_code=500, detail="Missing webhook secret")

    try:
        event = stripe.Webhook.construct_event(body, sig, secret)
    except ValueError:
        raise HTTPException(status_code=400, detail="Bad webhook data")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Bad signature")

    if event["type"] == "checkout.session.completed" or event["type"] == "checkout.session.async_payment_succeeded":
        session = event["data"]["object"]

        if session.get("payment_status") != "paid":
            return {"status": "pending"}

        info = session.get("metadata") or {}
        user_id = info.get("user_id")
        team_id = info.get("team_id")

        if not user_id or not team_id:
            raise HTTPException(status_code=400, detail="Missing user or team")

        # saves the purchase to supabase later
        print("Purchase:", session["id"], user_id, team_id)

        return {"status": "received"}

    return {"status": "ignored"}

