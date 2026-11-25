// Dashboard functionality for AIgentFlow

//import apiRequest function from /main.js
import { apiRequest } from "./main.js";

//######### Find Elements from Dashboard.html #############
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
const AgentsDialog = document.getElementById("agents-dialog"); //find the configuration dialog in the dashboard.html file
const AgentSelect = document.getElementById("agent-select"); //find agent selection, name, and model
const AgentName = document.getElementById("agent-name"); //find agent selection, name, and model
const AgentModel = document.getElementById("agent-model"); //find agent selection, name, and model
const FeedDialog = document.getElementById("feed-dialog"); //find the expanded feed dialog
const FeedCloseButton = document.getElementById("feed-close"); //find close button in live feed window
const CancelButton = document.getElementById("agents-cancel"); //find cancel button in "agent configuration" modal
const DetailsDialog = document.getElementById("team-details-dialog"); //find dialog window when clicking "view details"
const DetailsTeamName = document.getElementById("details-team-name");
const DetailsTeamStatus = document.getElementById("details-team-status");
const DetailsTeamCap = document.getElementById("details-team-cap");
const DetailsTeamID = document.getElementById("details-team-id");
const DetailsCloseButton = document.getElementById("details-close");
const PortfolioValue = document.getElementById("portfolio-value");
const PortfolioChart = document.getElementById("portfolio-chart");
const ChartWrap = document.getElementById("chart-wrap");
const ChartEmpty = document.getElementById("chart-empty");
const ActivityBody = document.getElementById("activity-body");
const ActivityEmpty = document.getElementById("activity-empty");


//launch local server in console -  python -m http.server 5500, vercel dev --listen 5500

//######## Global variables #############
let ConfiguringTeamID = null;   //needed for "configure agents" team card, to help identify which agent is selected
let CurrentTeams = [];          //Array for currently displayed teams
let SelectedTeamID = null;      //create selected Team ID for populate feed teams default value
let CurrentActivity = [];       //activity messages retrieved from supabase
let CurrentAgents = [];         //empty array for Current agents
let Activity_Feed_Amount = 10;  //activity feed message amount


//####### Functions ########
//function to load teams owned by logged in user
async function LoadOwnedTeams() {
    
    try {
        //request teams purchased by the current user
        const Teams = await apiRequest("/my-teams"); //await tells JS to wait for result before continuing

        
        return Teams;
    } catch (error){
        console.error("Unable to load owned Teams: ", error);

        return [];
    }
}

//function to load recent activity
async function LoadRecentActivity() {

    // Clear any previously displayed orders
    ActivityBody.replaceChildren();

    ActivityEmpty.hidden = false;
    ActivityEmpty.textContent = "Loading recent activity...";

    try {

        const Orders = await apiRequest(
            "/activity/recent?mode=paper"
        );

        console.log("Recent activity:", Orders);

        // Handle an account with no orders
        if (Orders.length === 0) {

            ActivityEmpty.hidden = false;
            ActivityEmpty.textContent =
                "No paper trades yet.";

            return;
        }

        // Hide the empty message when orders exist
        ActivityEmpty.hidden = true;

        // Create one table row per order
        Orders.forEach(function (Order) {

            const Row = document.createElement("tr");

            // Market identifier
            const MarketCell = document.createElement("td");
            MarketCell.textContent =
                Order.market_slug || "Unknown Market";

            // Selected outcome (YES/NO, etc.)
            const SideCell = document.createElement("td");
            SideCell.textContent =
                Order.outcome || "—";

            // Order quantity
            const SizeCell = document.createElement("td");

            const Quantity = Number(Order.quantity);

            SizeCell.textContent =
                Order.quantity != null &&
                Number.isFinite(Quantity)
                    ? Quantity.toLocaleString("en-US")
                    : "—";

            // Order status
            const ResultCell = document.createElement("td");
            const DateCell = document.createElement("td");
            DateCell.textContent = Order.created_at
            ? new Date(Order.created_at).toLocaleString() : "--";
            ResultCell.textContent =
                Order.status || "Unknown";

            // Add cells to row
            Row.append(
                MarketCell,
                SideCell,
                SizeCell,
                ResultCell,
                DateCell
            );

            // Add row to Recent Activity table
            ActivityBody.appendChild(Row);
        });

    } catch (error) {

        console.error(
            "Unable to load recent activity:",
            error
        );

        ActivityBody.replaceChildren();

        ActivityEmpty.hidden = false;
        ActivityEmpty.textContent =
            "Unable to load recent activity.";
    }
}


//function to Load activity feed
async function LoadActivityFeed(){

    try {

        const Activity = await apiRequest("/activity/feed");

        console.log("Live Feed Activity:", Activity);

        // Store records returned by Supabase
        CurrentActivity = Activity;

        // Refresh the dashboard's Live Feed
        PopulateDashboardFeed();

        // If the expanded feed is open, refresh it too
        if (FeedDialog.open) {
            PopulateFeedTeams();
            PopulateExpandedFeed();
        }
    } catch (error){
        console.error("Unable to load Live Feed:", error);

        FeedList.replaceChildren();
        FeedEmpty.hidden = false;
        FeedEmpty.textContent =
            "Unable to load activity.";

        FeedFooter.hidden = true;
    }
} 



//function to show details of each team
function ShowTeamDetails(Team){
    
    //display the selected teams information
    DetailsTeamName.textContent = Team.name;
    DetailsTeamStatus.textContent = Team.is_enabled ? "Enabled" : "Disabled";
    DetailsTeamCap.textContent = Team.daily_trade_cap + " / 50";
    DetailsTeamID.textContent = Team.id;

    //Open modal
    DetailsDialog.showModal()
}

//function that Creates a tean card using the fields currently returned by /my-teams
function CreateOwnedTeamCard(Team){
   
    // Create the teams card
    const Card = document.createElement("article");
    Card.className="card team-card"

    //Create maximum daily trade cap
    const MAX_DAILY_CAP = 50;

    //Team name
    const TeamName = document.createElement("h3");
    TeamName.className = "team-card__name";
    TeamName.textContent = Team.name || "Unnamed Team";

    //Display wether the team is enabled
    const TeamStatus = document.createElement("p");
    const StatusToggle = document.createElement("input");
    TeamStatus.textContent = Team.is_enabled ? "Status: Active" : "Status : Inactive";
    StatusToggle.type = "checkbox";
    StatusToggle.checked = Team.is_enabled === true;
    //create the label that holds the toggle switch
    const ToggleLabel = document.createElement("label");
    ToggleLabel.className = "toggle";
    //create the visual slider
    const ToggleTrack = document.createElement("span");
    ToggleTrack.className = "toggle__track";

    //place both elements inside the label
    ToggleLabel.appendChild(StatusToggle);
    ToggleLabel.appendChild(ToggleTrack);

    // Create the header container
    const TeamHeader = document.createElement("div");
    TeamHeader.className = "team-card__margin";

    // Group the team's status and toggle
    const StatusContainer = document.createElement("div");
    StatusContainer.className = "team-card__status";

    // Add status text and toggle
    StatusContainer.appendChild(TeamStatus);
    StatusContainer.appendChild(ToggleLabel);

    // Add team name and status controls to the header
    TeamHeader.appendChild(TeamName);
    TeamHeader.appendChild(StatusContainer);

    //Give the checkbox an accessible label
    StatusToggle.setAttribute("aria-label", `Enable or Disable ${Team.name}`);
    
    //status toggle event listener
    StatusToggle.addEventListener("change", async function () {
        
        const NewStatus = StatusToggle.checked;

        //prevent repeated updates while saving
        StatusToggle.disabled = true;

        try {
            const Updated = await apiRequest(
                `/my-teams/${Team.id}/status`,
                {
                    method: "PATCH",
                    headers: {"Content-Type" : "application/json"},
                    body: JSON.stringify({is_enabled: NewStatus})
                }
            );
            //Update local data after succesful save
            Team.is_enabled = Updated.is_enabled;

            TeamStatus.textContent = Team.is_enabled ? "Status: Active" : "Status: Inactive";

        }catch (error){
            console.error("Unable to update team status: ", error);
            //Restore the previous value if the request failed
            StatusToggle.checked = Team.is_enabled === true;
            alert("Unable to save team status.");
        } finally {
            StatusToggle.disabled = false;
        }
    });


    //Display the user's daily trade cap
    const TradeCap = document.createElement("p");
    TradeCap.textContent = "Daily Trade Cap: " + Team.daily_trade_cap;

    //create container for the adjustment buttons
    const Stepper = document.createElement("div");
    Stepper.className = "stepper";

    //Decrement button
    const DecrementButton = document.createElement("button");
    DecrementButton.type = "button";
    DecrementButton.className = "stepper__btn";
    DecrementButton.textContent = "-";
    DecrementButton.setAttribute("aria-label", "Decrease daily trading cap");

    //Display the current Cap
    const CapValue = document.createElement("span");
    CapValue.className = "stepper__value";

    //Increment button
    const IncrementButton = document.createElement("button");
    IncrementButton.type = "button";
    IncrementButton.className = "stepper__btn";
    IncrementButton.textContent = "+";
    IncrementButton.setAttribute("aria-label", "Increase daily trading cap");


    //Add all three elements to the container
    Stepper.append(
        DecrementButton,
        CapValue,
        IncrementButton
    );

    //create configure agents button
    const ConfigureButton = document.createElement("button");
    ConfigureButton.type = "button";
    ConfigureButton.className = "card__btn";
    ConfigureButton.textContent = "Configure Agents";

    ConfigureButton.addEventListener("click", async function() {
        ConfiguringTeamID = String(Team.id);
        console.log("Configuring Team: ", ConfiguringTeamID);
        await LoadTeamAgents(ConfiguringTeamID);
    });


    function UpdateCapDisplay(){

        const CurrentCap = Number(Team.daily_trade_cap);

        //update both displayed values
        CapValue.textContent = CurrentCap;
        TradeCap.textContent = "Daily Trade Cap: " + CurrentCap + " /50";

        //Disable buttons at the boundaries
        DecrementButton.disabled = CurrentCap <= 0;
        IncrementButton.disabled = CurrentCap >= MAX_DAILY_CAP;
    }

    async function ChangeDailyCap(Amount) {
        
        const CurrentCap = Number(Team.daily_trade_cap);
        const NewCap = CurrentCap + Amount;

        //Validate before requesting the backend
        if (NewCap < 0 || NewCap > MAX_DAILY_CAP){
            return;
        }

        //prevent multiple simultaneous requests
        DecrementButton.disabled = true;
        IncrementButton.disabled = true;

        try {

            const Updated = await apiRequest(
                `/my-teams/${Team.id}/cap`,
                {
                    method : "PATCH",
                    headers : {"Content-Type" : "application/json"},
                    body : JSON.stringify({daily_trade_cap : NewCap})
                }
            );

        //Only update local data after succesful save
        Team.daily_trade_cap = Updated.daily_trade_cap;

        //console.log("Updated daily cap: ", Updated)

        } catch (error){
            console.error("Failed to save daily cap: ", error);
            alert("Unable to save your daily trading cap.");
        } finally {
            UpdateCapDisplay();
        }
    }

    DecrementButton.addEventListener("click", function() {
        ChangeDailyCap(-1);
    });

    IncrementButton.addEventListener("click", function() {
        ChangeDailyCap(1);
    });


    //Details button
    const DetailsButton = document.createElement("button");
    DetailsButton.type = "button";
    DetailsButton.className = "card__btn";
    DetailsButton.textContent = "View Details";

    DetailsButton.addEventListener("click", function (){
        //console.log("Selected Team: ", Team.name);
        //TestLoadAgents(Team.id);
        ShowTeamDetails(Team);
    });

    DetailsCloseButton.addEventListener("click", function(){
        DetailsDialog.close();
    })

    // initialize displayed cap and button states
    UpdateCapDisplay();

    //Add Elements to card
    //Card.appendChild(TeamName);
    //Card.appendChild(TeamStatus);
    //Card.appendChild(ToggleLabel);
    //Card.appendChild(TradeCap);
    //Card.appendChild(Stepper);
    //Card.appendChild(DetailsButton);
    //
    Card.appendChild(TeamHeader);
    Card.appendChild(TradeCap);
    Card.appendChild(Stepper);
    Card.appendChild(DetailsButton);
    Card.appendChild(ConfigureButton);

    return Card;
}

//function to load portolio history
async function LoadPortfolioHistory() {
    
    //show the loading state
    PortfolioValue.textContent = "Loading...";

    try {
        const History = await apiRequest("/portfolio/history?mode=paper");
        console.log("Portfolio history: ", History);

        //no historical data yet
        if (History.length === 0){
            PortfolioValue.textContent = "- No Data";
            ChartWrap.hidden = false;
            PortfolioChart.hidden = true;
            ChartEmpty.hidden = false;

            ChartEmpty.textContent = "No paper portfolio history yet.";

            return;
        }

        //most recent snapshot
        const Latest = History[History.length - 1];

        //convert supabase numeric values to JS numbers
        const Total = Number(Latest.total);

        if (!Number.isFinite(Total)){
            throw new Error("Invalid portfolio value.");
        }

        //Display the curent porfolio value
        PortfolioValue.textContent = Total.toLocaleString("en-US", {
            style: "currency",
            currency: "USD"
        });

        //make the chart visible
        ChartWrap.hidden = false;
        ChartEmpty.hidden = true;
        PortfolioChart.hidden = false;
        DrawPortfolioChart(History);

    }catch (error){
        console.error("Unable to retrieve portfolio history: ", error);


        PortfolioValue.textContent = "—";

        ChartWrap.hidden = false;
        PortfolioChart.hidden = true;
        ChartEmpty.hidden = false;

        ChartEmpty.textContent = "Unable to load portfolio history.";
    }
}

//draw portfolio graph function to canvas
function DrawPortfolioChart(History) {

    const Canvas = PortfolioChart;
    const Context = Canvas.getContext("2d");

    // Convert database values into chart points
    const Points = History.map(function (Snapshot) {
        return {
            time: new Date(Snapshot.taken_at),
            value: Number(Snapshot.total)
        };
    }).filter(function (Point) {
        return Number.isFinite(Point.value) &&
               !Number.isNaN(Point.time.getTime());
    });

    if (Points.length === 0) {
        throw new Error("No valid portfolio points");
    }

    // Set canvas size for sharp rendering
    const Width = Canvas.clientWidth || 600;
    const Height = 260;
    const Scale = window.devicePixelRatio || 1;

    Canvas.width = Width * Scale;
    Canvas.height = Height * Scale;

    Context.setTransform(Scale, 0, 0, Scale, 0, 0);
    Context.clearRect(0, 0, Width, Height);

    // Chart padding
    const Left = 55;
    const Right = 20;
    const Top = 25;
    const Bottom = 35;

    const GraphWidth = Width - Left - Right;
    const GraphHeight = Height - Top - Bottom;

    // Determine portfolio value range
    const Values = Points.map(Point => Point.value);

    let Min = Math.min(...Values);
    let Max = Math.max(...Values);

    // Prevent division by zero for constant values
    if (Min === Max) {
        Min -= 1;
        Max += 1;
    }

    const X = function (Index) {
        return Left +
            (Points.length === 1
                ? GraphWidth / 2
                : Index / (Points.length - 1) * GraphWidth);
    };

    const Y = function (Value) {
        return Top +
            GraphHeight -
            ((Value - Min) / (Max - Min)) * GraphHeight;
    };

    // Draw horizontal grid lines and dollar labels
    Context.font = "12px Arial";
    Context.fillStyle = "#666";
    Context.strokeStyle = "#ddd";
    Context.lineWidth = 1;

    for (let i = 0; i <= 4; i++) {

        const Value = Min + (Max - Min) * (i / 4);
        const PositionY = Y(Value);

        Context.beginPath();
        Context.moveTo(Left, PositionY);
        Context.lineTo(Width - Right, PositionY);
        Context.stroke();

        Context.fillText(
            "$" + Value.toFixed(2),
            2,
            PositionY + 4
        );
    }

    // Draw portfolio value line
    Context.beginPath();

    Points.forEach(function (Point, Index) {

        const PositionX = X(Index);
        const PositionY = Y(Point.value);

        if (Index === 0) {
            Context.moveTo(PositionX, PositionY);
        } else {
            Context.lineTo(PositionX, PositionY);
        }
    });

    Context.strokeStyle = "#005633";
    Context.lineWidth = 2.5;
    Context.stroke();

    // Draw the latest portfolio point
    const LastIndex = Points.length - 1;

    Context.beginPath();
    Context.arc(
        X(LastIndex),
        Y(Points[LastIndex].value),
        4,
        0,
        Math.PI * 2
    );

    Context.fillStyle = "#005633";
    Context.fill();

    // Label the first and last dates
    Context.fillStyle = "#666";
    Context.textAlign = "left";

    Context.fillText(
        Points[0].time.toLocaleDateString(),
        Left,
        Height - 10
    );

    Context.textAlign = "right";

    Context.fillText(
        Points[LastIndex].time.toLocaleDateString(),
        Width - Right,
        Height - 10
    );
}


//load team agents function
async function LoadTeamAgents(TeamID) {

    //clear information from previously selected teams
    CurrentAgents = [];
    AgentSelect.replaceChildren();
    AgentModel.replaceChildren();
    AgentName.value = "";

    //ConfigureButtonLoading(true);

    try {

        const Agents = await apiRequest(
            `/my-teams/${TeamID}/agents`
        );

        console.log("Agents retrieved:", Agents);

        CurrentAgents = Agents;

        PopulateRealAgentDropdown();

        AgentsDialog.showModal();

    } catch (error) {

        console.error("Unable to load team agents:", error);

        alert("Unable to retrieve this team's agents.");

    } finally {
       //ConfigureButtonLoading(false);
    }
    
}

//function to populate agent drop down in configure menu
function PopulateRealAgentDropdown(){
    
    AgentSelect.replaceChildren();

    if (CurrentAgents.length === 0) {
        
        const Option = document.createElement("option");

        Option.textContent = "No Agents Configured Yet";
        Option.disabled = true;
        Option.selected = true;

        AgentSelect.appendChild(Option);

        AgentSelect.disabled = true;
        AgentModel.disabled = true;
        SaveButton.disabled = true;

        return;
    }

    AgentSelect.disabled = false;
    AgentModel.disabled = false;

    CurrentAgents.forEach(function(Agent){
        const Option = document.createElement("option");

        Option.value = Agent.id;
        Option.textContent = Agent.name;

        AgentSelect.appendChild(Option);
    });

    SaveButton.disabled = CurrentAgents.length === 0; 
    DisplayRealSelectedAgent();
}


//function to display all teams
function DisplayTeams(Teams){

    //store the teams currently being displayed
    CurrentTeams = Teams;
    
    //Remove existing cards
    TeamList.replaceChildren();

    //loop through the teams
    Teams.forEach(function (Team){
        
        const TeamCard = CreateOwnedTeamCard(Team)

        TeamList.appendChild(TeamCard);
    });

    //update the empty-state message
    const EmptyMessage = document.getElementById("teams-empty")

    EmptyMessage.hidden = Teams.length > 0;

}

//Function to load the actual team records
async function PreviewOwnedTeams() {
    
    try{
        const Teams = await apiRequest("/my-teams");

        //console.log("Teams returned by supabase: ", Teams);

        return Teams;
    } catch (error){
        console.error("Failed to retrieve owned Teams: ", error);
        return null
    }
}

//Hide message
document.getElementById("teams-empty").hidden= true;

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

        AgentSelect.appendChild(Option);

    });
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

//function that displays the real selected agent
function DisplayRealSelectedAgent(){
     const SelectedAgent = CurrentAgents.find(function (Agent) {
        return String(Agent.id) === AgentSelect.value;
    });

    if (!SelectedAgent) {
        AgentName.value = "";
        AgentModel.replaceChildren();
        return;
    }

    // Names are fixed, so users cannot edit them
    AgentName.value = SelectedAgent.name;
    AgentName.readOnly = true;

    // Populate available models
    AgentModel.replaceChildren();

    TestModels.forEach(function (Model) {

        const Option = document.createElement("option");

        Option.value = Model.id;
        Option.textContent = Model.name;

        AgentModel.appendChild(Option);
    });

    // Select the model returned by Supabase
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


//close button function in live feed window
FeedCloseButton.addEventListener("click", function() {
    FeedDialog.close();
})


AgentSelect.addEventListener("change", function() {
   DisplayRealSelectedAgent(); 
});

//populate dashboard feed
function PopulateDashboardFeed(){

    // Clear previously displayed activity
    FeedList.replaceChildren();

    // Display empty state when there are no messages
    if (CurrentActivity.length === 0) {
        FeedEmpty.hidden = false;
        FeedEmpty.textContent = "No activity to be shown.";
        FeedFooter.hidden = true;
        return;
    }

    // Show the latest five messages on the dashboard -- Change to increase activity feed message amount
    const RecentMessages = CurrentActivity.slice(0, Activity_Feed_Amount);

    RecentMessages.forEach(function (Message) {

        // Clone the existing HTML template
        const FeedItem = FeedItemTemplate.content.cloneNode(true);

        // Convert timestamp into local time
        const Time = new Date(Message.created_at);

        const TimeText = Number.isNaN(Time.getTime())
            ? "—" : Time.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit"
            });

        // Populate the template
        FeedItem.querySelector(
            '[data-field="time"]'
        ).textContent = TimeText;

        FeedItem.querySelector(
            '[data-field="summary"]'
        ).textContent = `${Message.team_name}: ${Message.message}`;

        // Append message to dashboard
        FeedList.appendChild(FeedItem);
    });

    // Show activity and the Expand button
    FeedEmpty.hidden = true;
    FeedFooter.hidden = false;
}


//function for displaying detailed messages
function PopulateExpandedFeed(){

    //remove previously displayed messages
    FeedMessages.replaceChildren();


    // Retrieve messages for the selected purchased team
    const TeamMessages = CurrentActivity.filter(
        function (Message) {
            return String(Message.user_team_id) ===
                   String(SelectedTeamID);
        }
    );

    // Handle teams with no activity
    if (TeamMessages.length === 0) {

        const EmptyMessage = document.createElement("p");
        EmptyMessage.className = "feed-modal__empty";
        EmptyMessage.textContent =
            "No messages for this team yet.";

        FeedMessages.appendChild(EmptyMessage);
        return;
    }

    TeamMessages.forEach(function (Message) {

        const FeedMessage =
            FeedMessageTemplate.content.cloneNode(true);

        const Time = new Date(Message.created_at);

        const TimeText = Number.isNaN(Time.getTime())
            ? "—"
            : Time.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit"
            });

        FeedMessage.querySelector(
            '[data-field="time"]'
        ).textContent = TimeText;

        FeedMessage.querySelector(
            '[data-field="text"]'
        ).textContent = Message.message;

        FeedMessages.appendChild(FeedMessage);
    });
    
}


//function to populate feed teams
function PopulateFeedTeams(){
    
    FeedTeams.replaceChildren();

    // Use real purchased teams from Supabase
    CurrentTeams.forEach(function (Team) {

        const ListItem = document.createElement("li");
        const TeamButton = document.createElement("button");

        TeamButton.type = "button";
        TeamButton.textContent = Team.name;

        // Compare UUID strings
        const IsSelected =
            String(Team.id) === String(SelectedTeamID);

        TeamButton.setAttribute(
            "aria-current",
            IsSelected ? "true" : "false"
        );

        // Change selected team
        TeamButton.addEventListener("click", function () {

            SelectedTeamID = String(Team.id);

            PopulateFeedTeams();
            PopulateExpandedFeed();
        });

        ListItem.appendChild(TeamButton);
        FeedTeams.appendChild(ListItem);
    });

    
}

//expand button event listener for clicking
ExpandButton.addEventListener("click", function (){

    if (CurrentTeams.length === 0){
        return;
    }
    
    //default to the first team
    SelectedTeamID = String(CurrentTeams[0].id);

    PopulateFeedTeams();
    PopulateExpandedFeed();
    FeedDialog.showModal();
});


//close the configuraiton dialog when clicked
CancelButton.addEventListener("click", function () {

    AgentsDialog.close();

});

SaveButton.addEventListener("click", async function() {
    // Identify the agent selected in the dropdown
    const SelectedAgentID = AgentSelect.value;

    // Get the selected AI model
    const SelectedModel = AgentModel.value;
    //console.log("Selected model being sent: ", SelectedModel);

    // Ensure we have the required information
    if (!ConfiguringTeamID || !SelectedAgentID || !SelectedModel) {
        alert("Please select an agent and model.");
        return;
    }

    // Prevent duplicate save requests
    SaveButton.disabled = true;

    try {

        const Updated = await apiRequest(
            `/my-teams/${ConfiguringTeamID}/agents/${SelectedAgentID}/model`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: SelectedModel
                })
            }
        );

        // Update the local agent data
        const SelectedAgent = CurrentAgents.find(function (Agent) {
            return String(Agent.id) === SelectedAgentID;
        });

        if (SelectedAgent) {
            SelectedAgent.model = Updated.model;
        }

        console.log("Agent model saved:", Updated);

        // Close the configuration dialog
        AgentsDialog.close();

    } catch (error) {

        console.error("Unable to save agent model:", error);
        alert("Unable to save the selected AI model.");

    } finally {

        SaveButton.disabled = false;

    }
});



//########### Test Data for Frontend Development ############
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
    {id: "openai/gpt-4o", name: "GPT-4o"},
    {id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4"},
    {id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro"}
];

//temporary test teams
const TestTeams = [
    {id: 1, name: "Sports Research Team", numAgents: 3, lastRun: "5 minutes ago",
        tradesToday: 2, userCap: 5, maxCap: 10, active: false},
    {id: 2, name: "Politics Research Team", numAgents: 4, lastRun: "10 minutes ago",
        tradesToday: 1, userCap: 3, maxCap: 8, active: false},
    {id: 3, name: "Crypto Research Team", numAgents: 2, lastRun: "15 minutes ago",
        tradesToday: 0, userCap: 2, maxCap: 5, active: false}
];

//####### Function Calls ############
//initialize dashboard feed
//PopulateDashboardFeed();

//call Load Owned Teams function
//LoadOwnedTeams();

//call display teams function and pass TestTeams for now
//DisplayTeams(TestTeams);

authReady.then(function(user){
    if (user){
        InitializeDashboard()
        
    }
});

async function InitializeDashboard() {
    
    try {
        const Teams = await apiRequest("/my-teams");
        //console.log("Owned Teams: ", Teams);

        DisplayTeams(Teams);

        
    } catch(error){
        console.error("Could not initialize dashboard: ", error);
        TeamList.textContent = "Unable to load your teams.";
        document.getElementById("teams-empty").hidden = true;
    }

    await LoadPortfolioHistory();
    await LoadRecentActivity();
    await LoadActivityFeed();

}
