import base64
import json
import math
import os
import time
from datetime import datetime, timedelta, timezone

import httpx
from cryptography.fernet import InvalidToken
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from openrouter import get_user_id, get_fernet, get_admin_client

router = APIRouter(prefix="/polymarket", tags=["Polymarket"])

GATEWAY_URL = "https://gateway.polymarket.us"
API_URL = "https://api.polymarket.us"

# hard cap on one order, checked in code so the AI can't talk its way past it
MAX_TRADE_DOLLARS = 10


class SaveKeyRequest(BaseModel):
    key_id: str
    secret_key: str


def get_mode():
    return "live" if os.getenv("POLYMARKET_MODE", "paper").lower() == "live" else "paper"


def get_paper_cash():
    return float(os.getenv("PAPER_STARTING_CASH", "50"))


# public market data, no key needed
def public_get(path, params=None):
    try:
        response = httpx.get(f"{GATEWAY_URL}{path}", params=params, timeout=15)
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Couldn't reach Polymarket")

    if response.status_code == 429:
        raise HTTPException(status_code=502, detail="Polymarket is rate limiting us, try again shortly")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Polymarket couldn't load that market data")
    return response.json()


def find_credentials(user_id):
    result = (
        get_admin_client().table("api_keys")
        .select("encrypted_key")
        .eq("user_id", user_id)
        .eq("provider", "polymarket")
        .execute()
    )
    if result.data:
        try:
            decrypted = get_fernet().decrypt(result.data[0]["encrypted_key"].encode())
        except InvalidToken:
            raise HTTPException(status_code=400, detail="Your saved key can't be read. Please save it again")
        return json.loads(decrypted)

    # users without their own key trade on the demo account from the server env
    key_id = os.getenv("POLYMARKET_KEY_ID")
    secret_key = os.getenv("POLYMARKET_SECRET_KEY")
    if not key_id or not secret_key:
        raise HTTPException(status_code=400, detail="Add your Polymarket key in Settings first")
    return {"key_id": key_id, "secret_key": secret_key}


def signed_request(creds, method, path, params=None, body=None):
    secret = base64.b64decode(creds["secret_key"])
    # some tools export 64 bytes (seed plus public key), only the first 32 are the seed
    private_key = Ed25519PrivateKey.from_private_bytes(secret[:32])

    timestamp = str(int(time.time() * 1000))
    # the path is signed without its query string
    signature = private_key.sign(f"{timestamp}{method}{path}".encode())
    headers = {
        "X-PM-Access-Key": creds["key_id"],
        "X-PM-Timestamp": timestamp,
        "X-PM-Signature": base64.b64encode(signature).decode()
    }

    try:
        response = httpx.request(
            method, f"{API_URL}{path}", headers=headers, params=params, json=body, timeout=15
        )
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Couldn't reach Polymarket")

    # a bad Polymarket key isn't the user's login failing, so it can't be a 401 from us
    if response.status_code == 401:
        raise HTTPException(status_code=400, detail="Polymarket rejected the saved key")
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="Polymarket is rate limiting us, try again shortly")
    if not 200 <= response.status_code < 300:
        try:
            message = response.json().get("message")
        except ValueError:
            message = None
        raise HTTPException(status_code=502, detail=message or "Polymarket couldn't run that request")

    # cancels come back with an empty body
    return response.json() if response.content else {}


def side_price(market, long):
    for side in market["marketSides"]:
        # a side with no orders on it comes back without a price
        if side["long"] == long and side.get("price"):
            return float(side["price"])


def list_markets(category=None, limit=20):
    params = {"limit": limit, "active": "true", "closed": "false"}
    if category:
        params["categories"] = category

    markets = []
    for market in public_get("/v1/markets", params)["markets"]:
        if market["status"] != "MARKET_STATUS_OPEN":
            continue
        markets.append({
            "slug": market["slug"],
            "question": market["question"],
            # many markets share one question, the title says which team or company this one is
            "title": market.get("title"),
            "category": market["category"],
            "yes_price": side_price(market, True),
            "no_price": side_price(market, False),
            "end_date": market.get("endDate")
        })
    return markets


def fetch_book(slug):
    book = public_get(f"/v1/markets/{slug}/book")["marketData"]
    return {
        "slug": slug,
        "bids": sorted(
            [{"price": float(b["px"]["value"]), "qty": float(b["qty"])} for b in book.get("bids", [])],
            key=lambda level: -level["price"]
        ),
        "offers": sorted(
            [{"price": float(o["px"]["value"]), "qty": float(o["qty"])} for o in book.get("offers", [])],
            key=lambda level: level["price"]
        )
    }


def get_book(slug, depth=5):
    book = fetch_book(slug)
    return {"slug": slug, "bids": book["bids"][:depth], "offers": book["offers"][:depth]}


def market_snapshot(category=None, limit=10):
    params = {"limit": limit, "active": "true", "closed": "false"}
    if category:
        params["categories"] = category

    lines = []
    for market in public_get("/v1/markets", params)["markets"]:
        if market["status"] != "MARKET_STATUS_OPEN":
            continue
        bid = market.get("bestBidQuote", {}).get("value", "n/a")
        ask = market.get("bestAskQuote", {}).get("value", "n/a")
        lines.append(
            f"{market['question']}: {market.get('title')} (slug: {market['slug']}) "
            f"yes {side_price(market, True)}, no {side_price(market, False)}, "
            f"best bid {bid}, best ask {ask}"
        )
    return "\n".join(lines)


def get_market(slug):
    markets = public_get("/v1/markets", {"slug": slug})["markets"]
    if not markets:
        raise HTTPException(status_code=404, detail="That market doesn't exist")
    return markets[0]


def current_yes_price(slug):
    return float(public_get(f"/v1/markets/{slug}/bbo")["marketData"]["currentPx"]["value"])


# the book is quoted for YES, so NO levels are flipped to 1 - price. returned best price first
def book_levels(book, outcome, buying):
    # buying yes eats offers, selling yes eats bids, and no is the mirror image
    use_offers = (outcome == "yes") == buying
    levels = book["offers"] if use_offers else book["bids"]
    if outcome == "no":
        return [(round(1 - level["price"], 4), level["qty"]) for level in levels]
    return [(level["price"], level["qty"]) for level in levels]


# takes levels while the price is still fine for the limit, returns (filled, average price)
def walk_book(levels, quantity, limit, buying):
    filled = 0
    cost = 0
    for price, qty in levels:
        if (buying and price > limit) or (not buying and price < limit):
            break
        take = min(qty, quantity - filled)
        filled += take
        cost += take * price
        if filled >= quantity:
            break
    return filled, (cost / filled if filled else None)


# Polymarket quotes every order in the YES price, even buys of NO (confirmed with a real order),
# so a NO price of 0.63 goes out as 0.37 and fills come back the same way
def exchange_price(outcome, price):
    return price if outcome == "yes" else round(1 - price, 4)


def map_state(state):
    if state == "ORDER_STATE_FILLED":
        return "filled"
    if state == "ORDER_STATE_PARTIALLY_FILLED":
        return "partial"
    if state == "ORDER_STATE_CANCELED":
        return "canceled"
    if state == "ORDER_STATE_EXPIRED":
        return "expired"
    if state == "ORDER_STATE_REJECTED":
        return "rejected"
    # new and the pending states are all still waiting
    return "open"


def order_updates(order, outcome):
    avg = (order.get("avgPx") or {}).get("value")
    if avg and float(avg):
        avg = exchange_price(outcome, float(avg))
    return {
        "status": map_state(order["state"]),
        "filled_quantity": float(order.get("cumQuantity") or 0),
        # an unfilled order comes back with "0.0000", which isn't a real price
        "avg_fill_price": float(avg) if avg and float(avg) else None
    }


def place_order(user_id, slug, outcome, quantity, limit_price, team_id=None, expires_in_minutes=60):
    if outcome not in ("yes", "no"):
        raise HTTPException(status_code=422, detail="Outcome must be yes or no")

    market = get_market(slug)
    if market["status"] != "MARKET_STATUS_OPEN":
        raise HTTPException(status_code=400, detail="That market isn't open for trading")

    tick = market.get("orderPriceMinTickSize") or 0.01
    price = round(round(limit_price / tick) * tick, 4)
    if not 0.01 <= price <= 0.99:
        raise HTTPException(status_code=400, detail="Price must be between 0.01 and 0.99")

    min_qty = market.get("minimumTradeQty") or 1
    if min_qty >= 1:
        quantity = math.floor(quantity)
    else:
        quantity = math.floor(quantity * 100 + 1e-9) / 100
    if quantity < min_qty:
        raise HTTPException(status_code=400, detail=f"The smallest order for this market is {min_qty}")

    if round(quantity * price, 6) > MAX_TRADE_DOLLARS:
        raise HTTPException(status_code=400, detail=f"One order can't cost more than ${MAX_TRADE_DOLLARS}")

    mode = get_mode()
    row = {
        "user_id": user_id,
        "team_id": team_id,
        "mode": mode,
        "market_slug": slug,
        "outcome": outcome,
        "quantity": quantity,
        "limit_price": price,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=expires_in_minutes)).isoformat()
    }

    if mode == "live":
        creds = find_credentials(user_id)
        created = signed_request(creds, "POST", "/v1/orders", body={
            "marketSlug": slug,
            "intent": "ORDER_INTENT_BUY_LONG" if outcome == "yes" else "ORDER_INTENT_BUY_SHORT",
            "type": "ORDER_TYPE_LIMIT",
            "price": {"value": str(exchange_price(outcome, price)), "currency": "USD"},
            "quantity": quantity,
            "tif": "TIME_IN_FORCE_GOOD_TILL_CANCEL",
            "manualOrderIndicator": "MANUAL_ORDER_INDICATOR_AUTOMATIC"
        })
        row["exchange_order_id"] = created["id"]
        row["status"] = "open"
        # the order is already live at this point, so save it even if the status check fails
        try:
            order = signed_request(creds, "GET", f"/v1/order/{created['id']}")["order"]
            row.update(order_updates(order, outcome))
        except HTTPException:
            pass
    else:
        levels = book_levels(fetch_book(slug), outcome, True)
        filled, avg = walk_book(levels, quantity, price, True)
        row["filled_quantity"] = filled
        row["avg_fill_price"] = avg
        row["status"] = "filled" if filled >= quantity else "partial" if filled else "open"

    result = get_admin_client().table("polymarket_orders").insert(row).execute()
    return result.data[0]


def sync_orders(user_id):
    db = get_admin_client()
    rows = (
        db.table("polymarket_orders")
        .select("*")
        .eq("user_id", user_id)
        .in_("status", ["open", "partial"])
        .execute()
    ).data

    updated = []
    for row in rows:
        expired = datetime.fromisoformat(row["expires_at"]) <= datetime.now(timezone.utc)
        changes = {}

        if row["mode"] == "live":
            creds = find_credentials(user_id)
            if expired:
                signed_request(
                    creds, "POST", f"/v1/order/{row['exchange_order_id']}/cancel",
                    body={"marketSlug": row["market_slug"]}
                )
                changes["status"] = "expired"
            else:
                order = signed_request(creds, "GET", f"/v1/order/{row['exchange_order_id']}")["order"]
                changes = order_updates(order, row["outcome"])
        elif expired:
            changes["status"] = "expired"
        else:
            levels = book_levels(fetch_book(row["market_slug"]), row["outcome"], True)
            left = row["quantity"] - row["filled_quantity"]
            filled, avg = walk_book(levels, left, row["limit_price"], True)
            if filled:
                total = row["filled_quantity"] + filled
                old_cost = row["filled_quantity"] * (row["avg_fill_price"] or 0)
                changes["filled_quantity"] = total
                changes["avg_fill_price"] = (old_cost + filled * avg) / total
                changes["status"] = "filled" if total >= row["quantity"] else "partial"

        changes["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = db.table("polymarket_orders").update(changes).eq("id", row["id"]).execute()
        updated.append(result.data[0])

    return updated


def paper_positions(user_id):
    rows = (
        get_admin_client().table("polymarket_orders")
        .select("market_slug, outcome, filled_quantity, avg_fill_price")
        .eq("user_id", user_id)
        .eq("mode", "paper")
        .neq("filled_quantity", 0)
        .execute()
    ).data

    # paper closes are saved as rows with a negative quantity, so plain sums give the net position and cash spent
    positions = {}
    spent = 0
    for row in rows:
        key = (row["market_slug"], row["outcome"])
        positions[key] = positions.get(key, 0) + row["filled_quantity"]
        spent += row["filled_quantity"] * row["avg_fill_price"]
    return positions, spent


def close_position(user_id, slug):
    if get_mode() == "live":
        return signed_request(find_credentials(user_id), "POST", "/v1/order/close-position", body={"marketSlug": slug})

    positions, _ = paper_positions(user_id)
    book = fetch_book(slug)
    saved = []
    for (position_slug, outcome), quantity in positions.items():
        if position_slug != slug or quantity <= 0:
            continue
        # limit 0 means sell at whatever the bids pay
        filled, avg = walk_book(book_levels(book, outcome, False), quantity, 0, False)
        if not filled:
            continue
        result = get_admin_client().table("polymarket_orders").insert({
            "user_id": user_id,
            "mode": "paper",
            "market_slug": slug,
            "outcome": outcome,
            "quantity": -quantity,
            "limit_price": 0,
            "filled_quantity": -filled,
            "avg_fill_price": avg,
            "status": "filled",
            "expires_at": datetime.now(timezone.utc).isoformat()
        }).execute()
        saved.append(result.data[0])

    if not saved:
        raise HTTPException(status_code=400, detail="There's no position to close in that market")
    return saved


def live_positions(creds):
    found = {}
    cursor = None
    while True:
        data = signed_request(creds, "GET", "/v1/portfolio/positions", params={"cursor": cursor} if cursor else None)
        found.update(data.get("positions") or {})
        cursor = data.get("nextCursor")
        if data.get("eof") or not cursor:
            return found


def get_portfolio(user_id):
    mode = get_mode()
    owned = {}

    if mode == "live":
        creds = find_credentials(user_id)
        balances = signed_request(creds, "GET", "/v1/account/balances")["balances"]
        # currentBalance goes up when a NO is bought (it counts the YES sale), buyingPower doesn't
        cash = next(b["buyingPower"] for b in balances if b["currency"] == "USD")
        for slug, position in live_positions(creds).items():
            net = float(position["netPositionDecimal"])
            if net:
                owned[(slug, "yes" if net > 0 else "no")] = abs(net)
    else:
        positions, spent = paper_positions(user_id)
        cash = get_paper_cash() - spent
        owned = {key: qty for key, qty in positions.items() if abs(qty) > 0.000001}

    positions = []
    for (slug, outcome), quantity in owned.items():
        yes_price = current_yes_price(slug)
        price = yes_price if outcome == "yes" else round(1 - yes_price, 4)
        positions.append({
            "slug": slug,
            "outcome": outcome,
            "quantity": quantity,
            "price": price,
            "value": round(quantity * price, 4)
        })

    positions_value = round(sum(p["value"] for p in positions), 4)
    return {
        "mode": mode,
        "cash": round(cash, 4),
        "positions_value": positions_value,
        "total": round(cash + positions_value, 4),
        "positions": positions
    }


def snapshot_portfolio(user_id):
    portfolio = get_portfolio(user_id)
    result = get_admin_client().table("portfolio_snapshots").insert({
        "user_id": user_id,
        "mode": portfolio["mode"],
        "cash": portfolio["cash"],
        "positions_value": portfolio["positions_value"],
        "total": portfolio["total"]
    }).execute()
    return result.data[0]


@router.get("/key")
def get_key_status(user_id=Depends(get_user_id)):
    result = (
        get_admin_client().table("api_keys")
        .select("user_id")
        .eq("user_id", user_id)
        .eq("provider", "polymarket")
        .execute()
    )
    # only says if a key exists, the key itself never goes back to the browser
    return {"saved": bool(result.data), "mode": get_mode()}


@router.post("/key")
def save_key(details: SaveKeyRequest, user_id=Depends(get_user_id)):
    key_id = details.key_id.strip()
    secret_key = details.secret_key.strip()
    if not key_id or not secret_key:
        raise HTTPException(status_code=422, detail="Please enter both the key ID and the secret key")

    fernet = get_fernet()
    creds = {"key_id": key_id, "secret_key": secret_key}

    try:
        signed_request(creds, "GET", "/v1/account/balances")
    except HTTPException as error:
        if error.status_code == 400:
            raise HTTPException(status_code=400, detail="Polymarket didn't accept that key")
        raise
    except ValueError:
        # the secret wasn't valid base64 or the wrong length
        raise HTTPException(status_code=400, detail="Polymarket didn't accept that key")

    (
        get_admin_client().table("api_keys")
        .upsert({
            "user_id": user_id,
            "provider": "polymarket",
            "encrypted_key": fernet.encrypt(json.dumps(creds).encode()).decode(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
        .execute()
    )

    return {"saved": True}


@router.get("/markets")
def get_markets(category: str = None, user_id=Depends(get_user_id)):
    return list_markets(category)


@router.get("/portfolio")
def portfolio(user_id=Depends(get_user_id)):
    result = get_portfolio(user_id)
    db = get_admin_client()

    # snapshots from the other mode would make the change meaningless
    day_ago = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    old = (
        db.table("portfolio_snapshots").select("total")
        .eq("user_id", user_id).eq("mode", result["mode"]).lte("taken_at", day_ago)
        .order("taken_at", desc=True).limit(1).execute().data
    )
    if not old:
        # nothing that old yet, so compare against the very first snapshot
        old = (
            db.table("portfolio_snapshots").select("total")
            .eq("user_id", user_id).eq("mode", result["mode"])
            .order("taken_at").limit(1).execute().data
        )

    change = result["total"] - old[0]["total"] if old else 0
    result["day_change"] = round(change, 4)
    result["day_change_pct"] = round(change / old[0]["total"] * 100, 2) if old and old[0]["total"] else 0
    return result


@router.get("/portfolio/history")
def portfolio_history(days: int = 30, user_id=Depends(get_user_id)):
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    result = (
        get_admin_client().table("portfolio_snapshots")
        .select("taken_at, total")
        .eq("user_id", user_id)
        .eq("mode", get_mode())
        .gte("taken_at", since)
        .order("taken_at")
        .execute()
    )
    return result.data


@router.post("/orders/sync")
def sync(user_id=Depends(get_user_id)):
    sync_orders(user_id)
    return snapshot_portfolio(user_id)
