from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from openrouter import ask_model, get_user_id, get_admin_client
import polymarket_tools

router = APIRouter(prefix="/agents", tags=["Agents"])
AGENT_ORDER = [
    "Market Research Agent",
    "Risk Analysis Agent",
    "Validation Agent",
    "Decision & Execution Agent"
]


class RunTeamRequest(BaseModel):
    team_id: str


@router.post("/run")
def run_team(
    details: RunTeamRequest,
    user_id=Depends(get_user_id)
):
    db = get_admin_client()

    # Find the team in the catalog
    catalog = (
        db.table("teams")
        .select("id,name")
        .eq("id", details.team_id)
        .execute()
    )

    if not catalog.data:
        raise HTTPException(
            status_code=404,
            detail="Team not found"
        )

    team_name = catalog.data[0]["name"]

    # Verify that the logged-in user owns the team
    owned = (
        db.table("user_teams")
        .select("id,team_name,is_enabled")
        .eq("user_id", user_id)
        .eq("team_name", team_name)
        .eq("owned", True)
        .execute()
    )

    if not owned.data:
        raise HTTPException(
            status_code=403,
            detail="You do not own this team"
        )

    # Load the preconfigured agents for this team
    agents = (
        db.table("team_agents")
        .select("id,name,role,system_prompt,default_model")
        .eq("team_id", details.team_id)
        .execute()
    ).data

    if not agents:
        raise HTTPException(
            status_code=404,
            detail="This team has no configured agents"
        )

    # Get the user's ownership record ID
    user_team_id = owned.data[0]["id"]

    # Load the user's selected models
    settings = (
        db.table("user_agent_settings")
        .select("team_agent_id,model")
        .eq("user_team_id", user_team_id)
        .execute()
    )

    # Map each agent to its selected model
    selected_models = {
        item["team_agent_id"]: item["model"]
        for item in (settings.data or [])
    }

    # Use the selected model or fall back to the default
    for agent in agents:
        agent["model"] = selected_models.get(
            agent["id"],
            agent["default_model"]
        )

    # Sort agents into their execution order
    agents.sort(
        key=lambda agent: (
            AGENT_ORDER.index(agent["name"])
            if agent["name"] in AGENT_ORDER
            else len(AGENT_ORDER)
        )
    )

    # Assign execution positions
    for position, agent in enumerate(agents, start=1):
        agent["execution_order"] = position

    # Store each agent's response
    results = []

    # Initial task for testing the agent pipeline
    context = (
        "This is a simulated team execution test. "
        "Do not place trades or claim to access live market data. "
        "Use a hypothetical market example to demonstrate collaboration."
    )

    # Execute each agent in order
    for agent in agents:
        prompt = (
            f"{agent['system_prompt']}\n\n"
            f"Team context:\n{context}\n\n"
            "Provide your analysis based on the available information. "
            "This is a simulation only. Do not execute trades."
        )

        response = ask_model(
            user_id=user_id,
            model=agent["model"],
            prompt=prompt
        )

        results.append({
            "agent_id": agent["id"],
            "name": agent["name"],
            "model": agent["model"],
            "execution_order": agent["execution_order"],
            "response": response
        })

        # Pass the response to the following agents
        context += f"\n\n{agent['name']}:\n{response}"

    return {
        "team_id": details.team_id,
        "team_name": team_name,
        "user_team_id": user_team_id,
        "mode": "simulation",
        "agents": results
    }