// vercel.json sends /api/* to the backend, so the site and API share one address
const API_URL = "/api";

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const navUsername = document.getElementById("nav-username");


function showError(message) {
  const error = document.getElementById("form-error");
  error.textContent = message;
  error.hidden = false;
}

function saveSession(data) {
  localStorage.setItem("token", data.access_token);
  localStorage.setItem("username", data.username || "");
}

// sends the form fields as JSON and returns the response body, or throws the backend's error message
async function postForm(form, path) {
  const body = Object.fromEntries(new FormData(form));
  const response = await fetch(API_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  // a server crash returns plain text instead of JSON
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // FastAPI puts errors in "detail", but validation errors come back as a list
    throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong. Please try again.");
  }
  return data;
}

async function handleSubmit(event, path) {
  event.preventDefault();
  const form = event.target;

  // the forms use novalidate so we can show our own error message instead of the browser popup
  if (!form.checkValidity()) {
    showError("Please fill in every field with a valid value.");
    return;
  }

  const button = form.querySelector("button[type=submit]");
  button.disabled = true;

  try {
    const data = await postForm(form, path);

    if (!data.access_token) {
      showError("Account created. Check your email to confirm it, then log in.");
      return;
    }
    saveSession(data);
    location.href = "dashboard.html";
  } catch (error) {
    showError(error instanceof TypeError ? "Can't reach the server right now." : error.message);
  } finally {
    button.disabled = false;
  }
}


if (loginForm) {
  loginForm.addEventListener("submit", (event) => handleSubmit(event, "/login"));
}

if (registerForm) {
  registerForm.addEventListener("submit", (event) => handleSubmit(event, "/register"));
}

// every page with the navbar needs a logged-in user
if (navUsername) {
  if (!localStorage.getItem("token")) {
    location.href = "index.html";
  }
  navUsername.textContent = localStorage.getItem("username") || "username";
}


 // Gettting the teams from the backend
async function loadTeams() {
  const teamList = document.getElementById("team-list");
  if (!teamList) return;

  const token = localStorage.getItem("token");

  try {
    const response = await fetch(API_URL + "/teams", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!response.ok) {
      throw new Error("Could not get teams");
    }

    const teams = await response.json();
    teamList.innerHTML = "";

    // Showing the teams on the dashboard
    teams.forEach(function(team) {
      const div = document.createElement("div");
      div.className = "card";
      div.textContent = team.name || "Unnamed team";
      teamList.appendChild(div);
    });

    document.getElementById("teams-empty").hidden = teams.length > 0;

  } catch (error) {
    teamList.textContent = "Error loading teams";
    console.log(error);
  }
}

loadTeams();
