from datetime import datetime, timezone
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from supabase import create_client
from supabase_auth.errors import AuthApiError
import httpx
from os import getenv

router = APIRouter(prefix="/admin", tags=["Admin"])
security = HTTPBearer()

from database import SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY = getenv("SUPABASE_SECRET_KEY")

class CreateBanRequest(BaseModel):
    ban_type: Literal["temporary", "permanent"]
    reason: str = Field(min_length=1, max_length=500)
    end_time: Optional[datetime] = None

# Checks if the current user is an admin. Returns user info and profile if they are an admin, otherwise raises an HTTPException.
def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    token = credentials.credentials
    auth_client = create_client(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    )

    try:
        auth_user = auth_client.auth.get_user(token).user
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

    # Query profiles using the authenticated token.
    profile_response = httpx.get(
        f"{SUPABASE_URL}/rest/v1/profiles",
        headers={
            "apikey": SUPABASE_PUBLISHABLE_KEY,
            "Authorization": f"Bearer {token}"
        },
        params={
            "select": "id,username,role",
            "id": f"eq.{auth_user.id}",
            "limit": "1"
        }
    )

    profiles = profile_response.json()

    if not profiles:
        raise HTTPException(
            status_code=403,
            detail="Profile not found"
        )

    profile = profiles[0]

    if profile.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Administrator access required"
        )

    return {
        "auth_user": auth_user,
        "profile": profile,
        "token": token
    }

# List all users with their profiles and active bans. Requires admin access.
@router.get("/users")
def list_admin_users(admin=Depends(require_admin)):

    #Error-checking due to issues with empty users[] list
    if not SUPABASE_SECRET_KEY:
        raise HTTPException(
            status_code=500,
            detail="Server admin access is not configured"
        )

    admin_client = create_client(
        SUPABASE_URL,
        SUPABASE_SECRET_KEY
    )

    profiles_response = (
        admin_client.table("profiles")
        .select("id,username,role,created_at")
        .order("created_at", desc=True)
        .execute()
    )

    # Testing code
    profiles = profiles_response.data or []
    print("User profiles returned:", len(profiles))

    bans_response = (
        admin_client.table("bans")
        .select(
            "id,user_id,reason,start_time,end_time,is_active"
        )
        .eq("is_active", True)
        .execute()
    )

    now = datetime.now(timezone.utc)
    bans_by_user_id = {}

    for ban in bans_response.data or []:
        end_time = ban.get("end_time")

        if end_time:
            try:
                parsed_end = datetime.fromisoformat(
                    end_time.replace("Z", "+00:00")
                )

                if parsed_end.tzinfo is None:
                        parsed_end = parsed_end.replace(
                            tzinfo=timezone.utc
                        )

                if parsed_end <= now:
                    continue
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=500,
                    detail="A ban record has an invalid expiration timestamp"
                )
        user_id = str(ban["user_id"])

        bans_by_user_id[str(ban["user_id"])] = {
            "reason": ban.get("reason"),
            "start_time": ban.get("start_time"),
            "end_time": ban.get("end_time"),
            "type": (
                "permanent"
                if ban.get("end_time") is None
                else "temporary"
            )
        }
    users = []

    for profile in profiles_response.data or []:
        user_id = str(profile["id"])

        users.append({
            "id": user_id,
            "username": profile.get("username"),
            "role": profile.get("role", "user"),
            "ban": bans_by_user_id.get(user_id)
        })

    return {"users": users}

@router.post("/users/{user_id}/bans")
def create_user_ban(
    user_id: str,
    details: CreateBanRequest,
    admin=Depends(require_admin)
):
    now = datetime.now(timezone.utc)

    # Grabs the username of the user being banned to ensure they exist.

    admin_client = create_client(
        SUPABASE_URL,
        SUPABASE_SECRET_KEY
    )

    profile_response = (
        admin_client.table("profiles")
        .select("id,username")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )

    # Ensures ban reason isn't blank.
    reason = details.reason.strip()
    if not reason:
        raise HTTPException(
            status_code=422,
            detail="A ban reason is required"
        )
    
    # Ensures that the end time is provided for temporary bans and that it includes a timezone.
    if details.end_time.tzinfo is None:
        raise HTTPException(
            status_code=422,
            detail="The end time must include a time zone"
        )

    profiles = profile_response.data or []

    if not profiles:
        raise HTTPException(
            status_code=404,
            detail="Member profile not found"
        )
    username = profiles[0].get("username")

    if not username:
        raise HTTPException(
            status_code=422,
            detail="Member profile has no username"
        )

    # Checks ban type and validates end time for temporary bans.
    if details.ban_type == "temporary":
        if details.end_time is None:
            raise HTTPException(
                status_code=422,
                detail="Temporary bans require an end time"
            )

        if details.end_time <= now:
            raise HTTPException(
                status_code=422,
                detail="The end time must be in the future"
            )

        end_time = details.end_time.isoformat()
    else:
        end_time = None

    # Create a Supabase client with the secret key to perform admin actions.
    admin_client = create_client(
        SUPABASE_URL,
        SUPABASE_SECRET_KEY
    )

    # Deactivates an existing ban (if applicable).
    (
        admin_client.table("bans")
        .update({
            "is_active": False,
            "updated_at": now.isoformat()
        })
        .eq("user_id", user_id)
        .eq("is_active", True)
        .execute()
    )

    # Data sent to the database for creating a new ban.
    result = (
        admin_client.table("bans")
        .insert({
            "user_id": user_id,
            "username": username,
            "reason": details.reason.strip(),
            "start_time": now.isoformat(),
            "end_time": end_time,
            "is_active": True,
            "created_by": admin["auth_user"].id,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        })
        .execute()
    )

    return {"ban": result.data[0]}

# User unban. Utilizes the service role key to update the ban record in the database. Requires admin access.
@router.delete("/users/{user_id}/bans")
def revoke_user_ban(
    user_id: str,
    admin=Depends(require_admin)
):
    now = datetime.now(timezone.utc)

    admin_client = create_client(
        SUPABASE_URL,
        SUPABASE_SECRET_KEY
    )

    result = (
        admin_client.table("bans")
        .update({
            "is_active": False,
            "updated_at": now.isoformat()
        })
        .eq("user_id", user_id)
        .eq("is_active", True)
        .execute()
    )

    return {
        "message": "User unbanned",
        "updated": len(result.data or [])
    }