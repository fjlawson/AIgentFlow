// Dashboard functionality for AIgentFlow

//import apiRequest function from /main.js
import { apiRequest } from "./main.js";

//find elements from dashboard.html
const TeamTemplate = document.getElementById("team-template");
const TeamList = document.getElementById("team-list");
const SaveButton = document.getElementById("agents-save");
const ExpandButton = document.getElementById("expand-btn");
const FeedTeams = document.getElementById("feed-teams");
const FeedItemTemplate = document.getElementById("feed-item-template");
const FeedMessageTemplate = document.getElementById("feed-message-template");
const FeedList = document.getElementById("feed-list");
const FeedMessages = document.getElementById("feed-messages");
const FeedEmpty =  document.getElementById("feed-empty");
const FeedFooter =  document.getElementById("feed-footer");

//global variables
let ConfiguringTeamID = null;

//display team template + list in console - debug
//console.log("Team Template: ", TeamTemplate);
//console.log("Team List: ", TeamList);

//function to load teams owned by logged in user
async function LoadOwnedTeams() {
    
    try {
        //request teams purchased by the current user
        const Teams = await apiRequest("/my-teams"); //await tells JS to wait for result before continuing

        console.log("Owned Teams: ", Teams);

        return Teams;
    } catch (error){
        console.error("Unable to load owned Teams: ", error);

        return [];
    }
}

//function to create team card
function CreateTeamCard(Team){
    
    //clone the HTML template
    const TeamCard = TeamTemplate.content.cloneNode(true);

    //Populate the template with the teams information
    //team name
    TeamCard.querySelector('[data-field="team_name"]').textContent =
        Team.name;

    //number of agents
    TeamCard.querySelector('[data-field="numAgents"]').textContent =
        Team.numAgents;

    //last run
    TeamCard.querySelector('[data-field="lastRun"]').textContent =
        Team.lastRun;

    //Trades today
    TeamCard.querySelector('[data-field="tradesToday"]').textContent =
        Team.tradesToday;

    //User Cap
    TeamCard.querySelectorAll('[data-field="userCap"]').forEach(element => {
        element.textContent = Team.userCap;
        });
    

    //Maxiumum Cap
    TeamCard.querySelector('[data-field="maxCap"]').textContent =
        Team.maxCap;

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
            //console.log("Label should say Inactive.");
        }
    });

    //Find the view live feed button inside our cloned team card
    const ViewFeedButton = TeamCard.querySelector('[data-action="view-feed"]');

    //open the live feed dialog when clicked
    ViewFeedButton.addEventListener("click", function () {
    console.log("view live feed clicked.")
    SelectedTeamID = Team.id;
    PopulateFeedTeams();
    PopulateExpandedFeed();
    FeedDialog.showModal();
    });

    //find and configure agents button in the team card "configure Agents"
    const ConfigureButton = TeamCard.querySelector('[data-action="configure-agents"]');

    //listen for clicks on the configure agents button
    ConfigureButton.addEventListener("click", function () {

        ConfiguringTeamID = Team.id;

        console.log("Configuring Team: ", ConfiguringTeamID); // for testing purposes

        PopulateAgentDropDown();
        PopulateModelDropdown();
        DisplaySelectedAgent();
        AgentsDialog.showModal();

    });

    return TeamCard;

}

//function to display all teams
function DisplayTeams(Teams){
    
    //Remove existing cards
    TeamList.replaceChildren();

    //loop through the teams
    Teams.forEach(function (Team){
        
        const TeamCard = CreateTeamCard(Team)

        TeamList.appendChild(TeamCard);
    });

    //update the empty-state message
    const EmptyMessage = document.getElementById("teams-empty")

    EmptyMessage.hidden = Teams.length > 0;
}

//Temporary team data for testing
const TestTeam = {
    name: "Sports Research Team",
    numAgents: 3,
    lastRun: "5 minutes ago",
    tradesToday: 2,
    userCap: 5,
    maxCap: 10
}

//Temporary messages for testing the live feed
const TestMessages = [
    {
        id: 1,
        time: "10:30",
        teamId: 1,
        summary: "Sports Analyst started researching NFL Games",
        text: "Sports analyst is reviewing upcoming NFL games and comparing team statistics."
    },
    {
        id: 2,
        time: "10:32",
        teamId: 1,
        summary: "Market Researcher found a potential opportunity.",
        text: "Market Researcher identified a prediction market that may warrant further analysis."
    },
    {
        id: 3,
        time: "10:35",
        teamId: 2,
        summary: "Risk Evaluator completed its analysis.",
        text: "Risk Evaluator completed its initial risk assessment."
    },
    {
        id: 4,
        time: "10:40",
        teamId: 3,
        summary: "Crypto Analyst completed its review.",
        text: "Crypto Analyst reviewed recent cryptocurrency market movements."
    }
];

//Temporary Agents for Frontend Testing
const TestAgents = [
    //Sports Team
    {
        id: 1,
        teamId: 1,
        name: "Sports Analyst",
        model: "openAI/gpt-4o"
    },
    {
        id: 2,
        teamId: 1,
        name: "Market Research",
        model: "anthropic/claude-sonnet-4"
    },
    {
        id: 3,
        teamId: 1,
        name: "Risk Evaluator",
        model: "google/gemini-2.5-pro"
    },
    //politics team
    {
        id: 4,
        teamId: 2,
        name: "Polling Analyst",
        model: "openAI/gpt-4o"
    },
    {
        id: 5,
        teamId: 2,
        name: "Political Research",
        model: "google/gemini-2.5-pro"
    },
    //Crypto team
    {
        id: 6,
        teamId: 3,
        name: "Crypto Analyst",
        model: "anthropic/claude-sonnet-4"
    },
    {
        id: 7,
        teamId: 3,
        name: "Market Monitor",
        model: "openAI/gpt-4o"
    }

];

//Temporary Models for Frontend testing
const TestModels = [
    {id: "openAI/gpt-4o", name: "GPT-4o"},
    {id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4"},
    {id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro"}
];

//temporary test teams
const TestTeams = [
    {id: 1, name: "Sports Research Team", numAgents: 3, lastRun: "5 minutes ago",
        tradesToday: 2, userCap: 5, maxCap: 10},
    {id: 2, name: "Politics Research Team", numAgents: 4, lastRun: "10 minutes ago",
        tradesToday: 1, userCap: 3, maxCap: 8},
    {id: 3, name: "Crypto Research Team", numAgents: 2, lastRun: "15 minutes ago",
        tradesToday: 0, userCap: 2, maxCap: 5},
]


//Hide message
document.getElementById("teams-empty").hidden= true;




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

    //retrieve agents belonging to the selected team
    const TeamAgents = TestAgents.filter(function (Agent){
        return Number(Agent.teamId) === ConfiguringTeamID;
    });

    //create a dropdown option for each matching agent
    TeamAgents.forEach(function (Agent){

        const Option = document.createElement("option");

        Option.value = Agent.id;
        Option.textContent = Agent.name;

    })
}

//function that updates the name and model fields whenever someone selects an agent
function DisplaySelectedAgent(){

    const SelectedID = Number(AgentSelect.value);

    const SelectedAgent = TestAgents.find(function (Agent){
        return Agent.id === SelectedID && Number(Agent.teamId) === ConfiguringTeamID;
    });

    if (!SelectedAgent){
        return;
    }

    AgentName.value = SelectedAgent.name;
    AgentModel.value = SelectedAgent.model;
}

//function that updates model dropdown menu
function PopulateModelDropdown(){
    
    AgentModel.replaceChildren();

    TestModels.forEach(function (Model){
        const Option = document.createElement("option");

        Option.value = Model.id;
        Option.textContent = Model.name;

        AgentModel.appendChild(Option);
    });
}

//Save changes to the selected Agent
SaveButton.addEventListener("click", function (){

    console.log("Save button pressed.")

    //get the currently selected agent's ID
    const SelectedID = Number(AgentSelect.value);

    //find the corresponding agent in our array
    const SelectedAgent = TestAgents.find(function (Agent){
        return Agent.id === SelectedID && Number(Agent.teamId) === ConfiguringTeamID;
    });

    //Make sure Agent was found
    if (!SelectedAgent){
        console.log("Agent was not found.")
        return;
    }

    //Make sure user enter a name in the name field
    const NewName = AgentName.value.trim(); //trim() removes whitespaces around entered name

    if(NewName === ""){
        alert("Please enter an Agent Name.")
        return;
    }

    //update our temporary agent object
    SelectedAgent.name = NewName;
    SelectedAgent.model = AgentModel.value;

    console.log("Agent updated: ", SelectedAgent);

    //close configuration window
    AgentsDialog.close();

});



//find the expanded feed dialog
const FeedDialog = document.getElementById("feed-dialog");

//find close button in live feed window
const FeedCloseButton = document.getElementById("feed-close");

//close button function in live feed window
FeedCloseButton.addEventListener("click", function() {
    FeedDialog.close();
})


AgentSelect.addEventListener("change", function() {
   DisplaySelectedAgent(); 
});

//populate dashboard feed
function PopulateDashboardFeed(){

    //clear any existing messages
    FeedList.replaceChildren();

    //loop through our test messages
    TestMessages.forEach(function (Message){

        //clone the dashboard feed template
        const FeedItem = FeedItemTemplate.content.cloneNode(true);

        //populate its fields
        FeedItem.querySelector('[data-field="time"]').textContent = Message.time;
        FeedItem.querySelector('[data-field="summary"]').textContent = Message.summary;

        //add the completed message to the dashboard
        FeedList.appendChild(FeedItem);
    });

    //show or hide empty message and expand button
    FeedEmpty.hidden = TestMessages.length > 0;       //if we have atleast 1 message, hide "No activity to be shown." message
    FeedFooter.hidden = TestMessages.length === 0;   //if there are messages, show the expand button
}


//create selected Team ID for populate feed teams default value
let SelectedTeamID = 1;

//function for displaying detailed messages
function PopulateExpandedFeed(){

    //remove previously displayed messages
    FeedMessages.replaceChildren();

    //Get messages belonging to the selected team
    const TeamMessages = TestMessages.filter(function (Message){
        return Message.teamId === SelectedTeamID;
    });

    //Display the filtered messages
    TeamMessages.forEach(function (Message){
        
        const FeedMessage = FeedMessageTemplate.content.cloneNode(true);

        FeedMessage.querySelector('[data-field="time"]').textContent = Message.time;
        FeedMessage.querySelector('[data-field="text"]').textContent = Message.text;

        FeedMessages.appendChild(FeedMessage);
    });

    if (TeamMessages.length === 0){
        const EmptyMessage = document.createElement("p");
        EmptyMessage.textContent = "No Messages for this team.";
        FeedMessages.appendChild(EmptyMessage);
    }
    
}


//function to populate feed teams
function PopulateFeedTeams(){
    
    FeedTeams.replaceChildren();

    TestTeams.forEach(function (Team){

        //create ann HTML list item
        const ListItem = document.createElement("li");

        //Create a button inside that list item
        const TeamButton = document.createElement("button");

        //Determine wether this team is currently selected
        const IsSelected = Number(Team.id) === Number(SelectedTeamID);

        TeamButton.type = "button";
        TeamButton.textContent = Team.name;

        //Mark selected Team
        TeamButton.setAttribute(
            "aria-current",
            IsSelected ? "true" : "false"
        );

        

        //when clicked, switch to this teams messages
        TeamButton.addEventListener("click", function() {

            SelectedTeamID = Number(Team.id);

            PopulateFeedTeams();
            PopulateExpandedFeed();
        });

        ListItem.appendChild(TeamButton);
        FeedTeams.appendChild(ListItem);

    });

    
}

//expand button event listener for clicking
ExpandButton.addEventListener("click", function (){

    //default to the first team
    SelectedTeamID = TestTeams[0].id;

    PopulateFeedTeams();
    PopulateExpandedFeed();
    FeedDialog.showModal();
});

//launch local server in console -  python -m http.server 5500, vercel dev --listen 5500
//find cancel button in "agent configuration" modal
const CancelButton = document.getElementById("agents-cancel");

//close the configuraiton dialog when clicked
CancelButton.addEventListener("click", function () {

    AgentsDialog.close();

});

//initialize dashboard feed
PopulateDashboardFeed();

//call Load Owned Teams function
LoadOwnedTeams();

//call display teams function and pass TestTeams for now
DisplayTeams(TestTeams);