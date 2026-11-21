import os

import httpx
import stripe

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from uuid import UUID
from supabase import create_client
from supabase_auth.errors import AuthApiError

from database import SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
from admin import router as admin_router #from admin.py
from openrouter import router as openrouter_router
from polymarket import router as polymarket_router
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

app = FastAPI(title="AIgentFlow API")
app.include_router(admin_router)
app.include_router(openrouter_router)
app.include_router(polymarket_router)
security = HTTPBearer()

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY")

# stand-ins until the marketplace has real teams. prices are in cents, and they live
# here instead of the page so a user can't edit the price in their browser
MOCK_TEAMS = {
    "mock-geopolitics": {"name": "Geopolitics Team", "price": 999},
    "mock-sports-betting": {"name": "Sports Betting Team", "price": 1499},
}

#allowed agent models, can change when verified what AI models we are using
ALLOWED_AGENT_MODELS = {
    "openAI/gpt-4o",
    "anthropic/claude-sonnet-4",
    "google/gemini-2.5-pro"
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

class UpdateTeamCapRequest(BaseModel):
    daily_trade_cap: int = Field(
        ge = 0,
        le = 50, 
        strict = True
    )

class UpdateTeamStatusRequest(BaseModel):
    is_enabled: bool = Field(strict = True)

class UpdateAgentModelRequest(BaseModel):
    model : str = Field(min_length = 1, max_length = 150)

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

        now = datetime.now(timezone.utc)
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

            # Format the string into a datetime object (timezone-aware) - Only runs for temp bans
            if end_time is not None:
                dt = datetime.fromisoformat(end_time)
                end_time_formatted = dt.strftime("%A, %B %d, %Y at %I:%M %p")

            if end_time is not None:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Your account is temporarily banned until "
                        f"{end_time_formatted}. Reason: {reason}"
                    )
                )
            else:
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

# get the teams the user purchased
@app.get("/my-teams")
def my_teams(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    token = credentials.credentials

    # check who is logged in
    client = create_client(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

    try:
        user = client.auth.get_user(token).user
    except AuthApiError:
        raise HTTPException(status_code=401, detail="Please log in again")

    if not user:
        raise HTTPException(status_code=401, detail="Please log in again")

    # get the user's purchased teams
    db = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)

    result = (
        db.table("user_teams")
        .select("id, team_name, owned, daily_trade_cap, is_enabled")
        .eq("user_id", user.id)
        .eq("owned",True)

    .execute()
    )

    teams = []

    for item in result.data or []:
        teams.append({
            "id" : item["id"],
            "name" : item["team_name"],
            "daily_trade_cap" : item["daily_trade_cap"],
            "is_enabled" : item["is_enabled"]
        })
        
    return teams
    

@app.patch("/my-teams/{user_team_id}/cap")
def update_team_cap(
    user_team_id: UUID,
    settings: UpdateTeamCapRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    #Authenticate the logged in user
    client = create_client(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    )
    #Creat SupeBase client for backend database operations
    db = create_client(
        SUPABASE_URL,
        SUPABASE_SECRET_KEY
    )
    try:
        user = client.auth.get_user(
            credentials.credentials
        ).user
    except AuthApiError:
        raise HTTPException(
            status_code = 401,
            detail = "Please log in again"
        )
    if not user:
        raise HTTPException(
            status_code = 401,
            detail = "Please log in again"
        )

    #Update only a team owned by the authenticated user
    result = (
        db.table("user_teams")
        .update({"daily_trade_cap": settings.daily_trade_cap})
        .eq("id",str(user_team_id))
        .eq("user_id", user.id)
        .eq("owned", True)
        .execute()
    )
    
    if not result.data:
        raise HHTPException(
            status_code=404,
            detail="Owned team not found."
        )

    updated_team = result.data[0]

    return {
        "id": updated_team["id"],
        "daily_trade_cap" : updated_team["daily_trade_cap"]
    }


@app.patch("/my-teams/{user_team_id}/status")
def update_team_status(
    user_team_id: UUID,
    settings: UpdateTeamStatusRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    # Identify the authenticated user
    client = create_client(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    )

    try:
        user = client.auth.get_user(
            credentials.credentials
        ).user

    except AuthApiError:
        raise HTTPException(
            status_code=401,
            detail="Please log in again"
        )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Please log in again"
        )

    # Backend only database client
    db = create_client(
        SUPABASE_URL,
        SUPABASE_SECRET_KEY
    )

    # Only update an owned team belonging to this user
    result = (
        db.table("user_teams")
        .update({
            "is_enabled": settings.is_enabled
        })
        .eq("id", str(user_team_id))
        .eq("user_id", user.id)
        .eq("owned", True)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail="Owned team not found"
        )

    updated_team = result.data[0]

    return {
        "id": updated_team["id"],
        "is_enabled": updated_team["is_enabled"]
    }


@app.get("/my-teams/{user_team_id}/agents")
def get_team_agents(
    user_team_id: UUID,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    # Step 1: Identify the logged-in user
    client = create_client(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    )

    try:
        user = client.auth.get_user(
            credentials.credentials
        ).user
    except AuthApiError:
        raise HTTPException(
            status_code=401,
            detail="Please log in again"
        )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Please log in again"
        )

    # Step 2: Create the backend database client
    db = create_client(
        SUPABASE_URL,
        SUPABASE_SECRET_KEY
    )

    # Step 3: Verify this user owns the requested team
    owned = (
        db.table("user_teams")
        .select("id, team_name")
        .eq("id", str(user_team_id))
        .eq("user_id", user.id)
        .eq("owned", True)
        .execute()
    )

    if not owned.data:
        raise HTTPException(
            status_code=404,
            detail="Owned team not found"
        )

    team_name = owned.data[0]["team_name"]

    # Step 4: Find the matching catalog team
    catalog = (
        db.table("teams")
        .select("id")
        .eq("name", team_name)
        .execute()
    )

    if len(catalog.data or []) != 1:
        raise HTTPException(
            status_code=409,
            detail="Team catalog mapping is missing or ambiguous"
        )

    catalog_team_id = catalog.data[0]["id"]

    # Step 5: Load the team's predefined agents
    agents = (
        db.table("team_agents")
        .select("id, name, role, default_model")
        .eq("team_id", catalog_team_id)
        .execute()
    )

    # Step 6: Load this user's model selections
    settings = (
        db.table("user_agent_settings")
        .select("team_agent_id, model")
        .eq("user_team_id", str(user_team_id))
        .execute()
    )

    # Create a lookup of saved models
    selected_models = {
        item["team_agent_id"]: item["model"]
        for item in (settings.data or [])
    }

    # Step 7: Build the response
    result = []

    for agent in agents.data or []:
        result.append({
            "id": agent["id"],
            "name": agent["name"],
            "role": agent["role"],
            "model": selected_models.get(
                agent["id"],
                agent["default_model"]
            )
        })

    return result


@app.put("/my-teams/{user_team_id}/agents/{agent_id}/model")
def update_agent_model(
    user_team_id: UUID,
    agent_id: UUID,
    settings: UpdateAgentModelRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    # 1. Verify the user's authentication token
    auth_client = create_client(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    )

    try:
        user = auth_client.auth.get_user(
            credentials.credentials
        ).user
    except AuthApiError:
        raise HTTPException(
            status_code=401,
            detail="Please log in again"
        )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Please log in again"
        )

    # 2. Validate the selected model
    if settings.model not in ALLOWED_AGENT_MODELS:
        raise HTTPException(
            status_code=422,
            detail="Unsupported AI model"
        )

    # 3. Connect to Supabase from the backend
    db = create_client(
        SUPABASE_URL,
        SUPABASE_SECRET_KEY
    )

    # 4. Verify ownership of the purchased team
    owned = (
        db.table("user_teams")
        .select("id, team_name")
        .eq("id", str(user_team_id))
        .eq("user_id", user.id)
        .eq("owned", True)
        .execute()
    )

    if not owned.data:
        raise HTTPException(
            status_code=404,
            detail="Owned team not found"
        )

    # 5. Find the catalog team
    catalog = (
        db.table("teams")
        .select("id")
        .eq("name", owned.data[0]["team_name"])
        .execute()
    )

    if len(catalog.data or []) != 1:
        raise HTTPException(
            status_code=409,
            detail="Team catalog mapping is invalid"
        )

    catalog_team_id = catalog.data[0]["id"]

    # 6. Verify the agent belongs to this team
    agent = (
        db.table("team_agents")
        .select("id")
        .eq("id", str(agent_id))
        .eq("team_id", catalog_team_id)
        .execute()
    )

    if not agent.data:
        raise HTTPException(
            status_code=404,
            detail="Agent not found in this team"
        )

    # 7. Save the model selection
    result = (
        db.table("user_agent_settings")
        .upsert(
            {
                "user_team_id": str(user_team_id),
                "team_agent_id": str(agent_id),
                "model": settings.model
            },
            on_conflict="user_team_id,team_agent_id"
        )
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=500,
            detail="Unable to save model selection"
        )

    return {
        "team_agent_id": str(agent_id),
        "model": result.data[0]["model"]
    }


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
        # newer stripe versions return an object without .get(), so make it a normal dict
        session = event["data"]["object"].to_dict()

        if session.get("payment_status") != "paid":
            return {"status": "pending"}

        info = session.get("metadata") or {}
        user_id = info.get("user_id")
        team_id = info.get("team_id")

        if not user_id or not team_id:
            raise HTTPException(status_code=400, detail="Missing user or team")
      
        # save the purchase to supabase
        try:
            db = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)

            purchase = {
                "user_id": user_id,
                "team_id": team_id,
                "stripe_session_id": session["id"]
            }

            db.table("purchases").upsert(
                purchase,
                on_conflict="stripe_session_id"
            ).execute()

            # give the user their team
            owned_team = {
                "user_id": user_id,
                "team_id": team_id
            }

            db.table("user_teams").upsert(
                owned_team,
                on_conflict="user_id,team_id"
            ).execute()

        except Exception as e:
            print("Purchase error:", e)
            raise HTTPException(
                status_code=500,
                detail="Could not save purchase"
            )

        return {"status": "received"}

