// Dashboard functionality for AIgentFlow

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

//Temporary Models for Frontend testing
const TestModels = [
    {id: "openAI/gpt-4o", name: "GPT-4o"},
    {id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4"},
    {id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro"}
];

//temporary test teams
const TestTeams = [
    {id: 1, name: "Sports Research Team"},
    {id: 2, name: "Politics Research Team"},
    {id: 3, name: "Crypto Research Team"}
]

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

    const SelectedAgent = TestAgents.find(function (Agent){
        return Agent.id === SelectedID;
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
        return Agent.id === SelectedID;
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

//Find the view live feed button inside our cloned team card
const ViewFeedButton = TeamCard.querySelector('[data-action="view-feed"]');

//find the expanded feed dialog
const FeedDialog = document.getElementById("feed-dialog");

//find close button in live feed window
const FeedCloseButton = document.getElementById("feed-close");

//close button function in live feed window
FeedCloseButton.addEventListener("click", function() {
    FeedDialog.close();
})

//open the live feed dialog when clicked
ViewFeedButton.addEventListener("click", function () {
    console.log("view live feed clicked.")
    SelectedTeamID = TestTeams[0].id;
    PopulateFeedTeams();
    PopulateExpandedFeed();
    FeedDialog.showModal();
});

//listen for clicks on the configure agents button
ConfigureButton.addEventListener("click", function () {

    console.log("Configure agents button clicked.") // for testing purposes

    PopulateAgentDropDown();
    PopulateModelDropdown();
    DisplaySelectedAgent();
    AgentsDialog.showModal();

});

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

//expand button event listender for clicking
ExpandButton.addEventListener("click", function (){

    //default to the first team
    SelectedTeamID = TestTeams[0].id;

    PopulateFeedTeams();
    PopulateExpandedFeed();
    FeedDialog.showModal();
});

//launch local server in console -  python -m http.server 5500
//find cancel button in "agent configuration" modal
const CancelButton = document.getElementById("agents-cancel");

//close the configuraiton dialog when clicked
CancelButton.addEventListener("click", function () {

    AgentsDialog.close();

});

//Add the completed team card to the dashboard
TeamList.appendChild(TeamCard);

//initialize dashboard feed
PopulateDashboardFeed();