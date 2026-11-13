// Dashboard functionality for AIgentFlow

const TeamTemplate = document.getElementById("team-template");
const TeamList = document.getElementById("team-list");

//display team template + list in console
console.log("Team Template: ", TeamTemplate);
console.log("Team List: ", TeamList);

//Temporary team data for testing
const TestTeam = {
    name: "Sports Research Team",
    numAgents: 3,
    lastRun: "5 minutes ago",
    tradesToday: 2,
    userCap: 5,
    maxCap: 10
}

//Temporary Agents for Frontend Testing
const TestAgents = [
    {
        id: 1,
        name: "Sports Analyst",
        model: "openAI/gpt-4o"
    },
    {
        id: 2,
        name: "Market Research",
        model: "anthropic/claude-sonnet-4"
    },
    {
        id: 3,
        name: "Risk Evaluator",
        model: "google/gemini-2.5-pro"
    }

];

//clone the HTML template
const TeamCard = TeamTemplate.content.cloneNode(true);

//Populate the template with the teams information
//team name
TeamCard.querySelector('[data-field="team_name"]').textContent =
    TestTeam.name;

//number of agents
TeamCard.querySelector('[data-field="numAgents"]').textContent =
    TestTeam.numAgents;

//last run
TeamCard.querySelector('[data-field="lastRun"]').textContent =
    TestTeam.lastRun;

//Trades today
TeamCard.querySelector('[data-field="tradesToday"]').textContent =
    TestTeam.tradesToday;

//User Cap
TeamCard.querySelectorAll('[data-field="userCap"]').forEach(element => {
    element.textContent = TestTeam.userCap;
});
    

//Maxiumum Cap
TeamCard.querySelector('[data-field="maxCap"]').textContent =
    TestTeam.maxCap;


//Hide message
document.getElementById("teams-empty").hidden= true;

//locate toggle checkbox on the cloned team card
const Toggle = TeamCard.querySelector('input[type="checkbox"]');

//find the status text next to toggle button
const StatusText = TeamCard.querySelector('[data-field="active_status"]');

//listen for changes to the checkbox (active/inactive)
Toggle.addEventListener("change", function () {
    if (Toggle.checked){
        StatusText.textContent = "Active";
        //console.log("Label should say active.");
    } else {
        StatusText.textContent = "Inactive";
        //console.log("Label should say INactive.");
    }
});

//find and configure agents button in the team card "configure Agents"
const ConfigureButton = TeamCard.querySelector('[data-action="configure-agents"]');

//find the configuration dialog in the dashboard.html file
const AgentsDialog = document.getElementById("agents-dialog");

//find agent selection, name, and model
const AgentSelect = document.getElementById("agent-select");
const AgentName = document.getElementById("agent-name");
const AgentModel = document.getElementById("agent-model");

//adds each agent as an option
function PopulateAgentDropDown(){

    //clear existing dropdown options
    AgentSelect.replaceChildren();

    //loop through each agent
    TestAgents.forEach(function (Agent){
        const Option = document.createElement("option");

        Option.value = Agent.id;
        Option.textContent = Agent.name;

        AgentSelect.appendChild(Option)
    });
}

//function that updates the name and model fields whenever someone selects an agent
function DisplaySelectedAgent(){
    const SelectedID = Number(AgentSelect.value);

    const SelectedAgent = TestAgents.find(function (agent){
        return Agent.id === SelectedID;
    });

    if (!SelectedAgent){
        return
    }

    AgentName.value = SelectedAgent.name;
    AgentModel.value = SelectedAgent.model;
}

//listen for clicks on the configure agents button
ConfigureButton.addEventListener("click", function () {

    console.log("Configure agents button clicked.") // for testing purposes
    AgentsDialog.showModal();

});

//find cancel button in "agent configuration" modal
const CancelButton = document.getElementById("agents-cancel");

//close the configuraiton dialog when clicked
CancelButton.addEventListener("click", function () {

    AgentsDialog.close();

});

//Add the completed team card to the dashboard
TeamList.appendChild(TeamCard);