import json

from fastapi import HTTPException

import polymarket
from openrouter import get_admin_client

CATEGORIES = ["climate", "technology", "macro", "crypto", "politics", "culture", "finance"]

READ_TOOLS = ["search_markets", "get_market", "get_order_book", "get_portfolio", "get_open_orders"]
TRADE_TOOLS = ["place_order", "close_position"]

SLUG = {"type": "string", "description": "The market slug, from search_markets"}


def tool(name, description, properties=None, required=None):
    return {"type": "function", "function": {
        "name": name,
        "description": description,
        "parameters": {"type": "object", "properties": properties or {}, "required": required or []}
    }}


TOOLS = [
    tool(
        "search_markets",
        "List open prediction markets with their yes and no prices. Weather is climate, tech is technology, "
        "commodities and economics are macro.",
        {"category": {"type": "string", "enum": CATEGORIES, "description": "Leave out to search every category"}}
    ),
    tool("get_market", "Get the details of one market: question, prices, end date, minimum quantity and tick size.",
         {"slug": SLUG}, ["slug"]),
    tool("get_order_book", "Get the best bids and offers for one market. Prices are quoted for YES.",
         {"slug": SLUG}, ["slug"]),
    tool("get_portfolio", "Get your cash, open positions and total value."),
    tool("get_open_orders", "Get your orders that haven't finished filling yet."),
    tool(
        "place_order",
        "Place a limit order to buy an outcome. The limit price is the price of the outcome being bought "
        "(0.01 to 0.99). The total cost (quantity times price) can't go over $10. You get only one trade per "
        "run. Only trade when the research clearly supports it, doing nothing is fine.",
        {
            "slug": SLUG,
            "outcome": {"type": "string", "enum": ["yes", "no"]},
            "quantity": {"type": "number", "description": "How many shares to buy"},
            "limit_price": {"type": "number", "description": "Most you will pay per share, 0.01 to 0.99"}
        },
        ["slug", "outcome", "quantity", "limit_price"]
    ),
    tool("close_position", "Sell out of your position in one market. This counts as your one trade for the run.",
         {"slug": SLUG}, ["slug"])
]


def pick_tools(names):
    return [t for t in TOOLS if t["function"]["name"] in names]


def start_run(user_id, team_id):
    return {"user_id": user_id, "team_id": team_id, "traded": False}


def market_details(slug):
    market = polymarket.get_market(slug)
    return {
        "slug": market["slug"],
        "question": market["question"],
        "title": market.get("title"),
        "category": market["category"],
        "yes_price": polymarket.side_price(market, True),
        "no_price": polymarket.side_price(market, False),
        "end_date": market.get("endDate"),
        "minimum_quantity": market.get("minimumTradeQty"),
        "tick_size": market.get("orderPriceMinTickSize")
    }


ORDER_FIELDS = ["market_slug", "outcome", "quantity", "limit_price", "filled_quantity", "avg_fill_price", "status", "expires_at"]


def open_orders(user_id):
    return (
        get_admin_client().table("polymarket_orders")
        .select(", ".join(ORDER_FIELDS))
        .eq("user_id", user_id)
        .in_("status", ["open", "partial"])
        .execute()
    ).data


def run_tool(run, name, args):
    user_id = run["user_id"]
    try:
        if name in TRADE_TOOLS and run["traded"]:
            return json.dumps({"error": "Only one trade is allowed per run and it has already been used"})

        if name == "search_markets":
            result = polymarket.list_markets(args.get("category"))
        elif name == "get_market":
            result = market_details(args["slug"])
        elif name == "get_order_book":
            result = polymarket.get_book(args["slug"])
        elif name == "get_portfolio":
            result = polymarket.get_portfolio(user_id)
        elif name == "get_open_orders":
            result = open_orders(user_id)
        elif name == "place_order":
            order = polymarket.place_order(
                user_id, args["slug"], args["outcome"], args["quantity"], args["limit_price"], run["team_id"]
            )
            # the model only needs to know how the order went, not our database ids
            result = {key: order[key] for key in ORDER_FIELDS}
            run["traded"] = True
        elif name == "close_position":
            result = polymarket.close_position(user_id, args["slug"])
            run["traded"] = True
        else:
            return json.dumps({"error": f"Unknown tool: {name}"})
    except HTTPException as error:
        return json.dumps({"error": error.detail})
    except (KeyError, TypeError, ValueError):
        return json.dumps({"error": "Missing or invalid arguments for that tool"})

    return json.dumps(result)
