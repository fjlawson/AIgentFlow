
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from openrouter import ask_model, get_user_id


router = APIRouter(prefix="/agents", tags=["Agents"])


class RunTaskRequest(BaseModel):
    model: str
    query: str




@router.post("/run")
def run_agent_team(
    details: RunTaskRequest,
    user_id=Depends(get_user_id)
):
    query = details.query.strip()

    if not query:
        raise HTTPException(
            status_code=422,
            detail="Please enter a task for the agent team"
        )

    model = details.model

    analyst_response = ask_model(
        user_id,
        model,
        f"""
        You are the Market Analyst for AIgentFlow.

        Analyze the following prediction-market-related question:

        {query}

        Identify the main claim, important factors, assumptions,
        and arguments for and against the outcome.
        """
    )

    skeptic_response = ask_model(
        user_id,
        model,
        f"""
        You are the Skeptic Agent for AIgentFlow.

        Original task:
        {query}

        Market Analyst response:
        {analyst_response}

        Challenge the analysis. Identify weak assumptions,
        missing considerations, bias, or overconfidence.
        """
    )

    risk_response = ask_model(
        user_id,
        model,
        f"""
        You are the Risk Manager for AIgentFlow.

        Original task:
        {query}

        Market Analyst:
        {analyst_response}

        Skeptic:
        {skeptic_response}

        Evaluate uncertainty and risk. Explain whether the
        available information supports taking a position.
        """
    )

    decision_response = ask_model(
        user_id,
        model,
        f"""
        You are the Final Decision Agent for AIgentFlow.

        Original task:
        {query}

        Market Analyst:
        {analyst_response}

        Skeptic:
        {skeptic_response}

        Risk Manager:
        {risk_response}

        Provide:
        1. Final conclusion
        2. Strongest supporting reason
        3. Strongest opposing reason
        4. Overall uncertainty/risk
        5. Whether to take a position or no position
        """
    )

    return {
        "team": "Polymarket Betting Team",
        "query": query,
        "agents": [
            {
                "agent": "Market Analyst",
                "response": analyst_response
            },
            {
                "agent": "Skeptic",
                "response": skeptic_response
            },
            {
                "agent": "Risk Manager",
                "response": risk_response
            },
            {
                "agent": "Decision Agent",
                "response": decision_response
            }
        ],
        "final_response": decision_response
    }