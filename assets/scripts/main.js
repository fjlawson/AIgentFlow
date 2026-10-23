// vercel.json sends /api/* to the backend, so the site and API share one address
export const API_URL = "/api";

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const navUsername = document.getElementById("nav-username");
let userRole = null;


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
  navUsername.textContent =
    localStorage.getItem("username") || "Loading…";
}

 // getting teams from backend
async function loadTeams() {
  const teamList = document.getElementById("team-list");

  if (!teamList) {
    return;
  }

  const token = localStorage.getItem("token");

  try {
    const response = await fetch(API_URL + "/teams", {
      headers: {
        "Authorization": "Bearer " + token
      }
    });

    if (response.ok == false) {
      throw new Error("Failed to load teams");
    }

    const teams = await response.json();

    teamList.replaceChildren();

    // display the teams
    for (let i = 0; i < teams.length; i++) {
      const team = document.createElement("div");
      team.className = "card";
      team.textContent = teams[i].name || "Unnamed team";

      teamList.appendChild(team);
    }

    const empty = document.getElementById("teams-empty");
    if (empty) {
      empty.hidden = teams.length > 0;
    }

  } catch (error) {
    teamList.textContent = "Could not load teams";
    console.log(error);
  }
}

loadTeams();

// marketplace checkout
const checkoutStatus = document.getElementById("checkout-status");

function showCheckoutStatus(message, isError) {
  checkoutStatus.textContent = message;
  checkoutStatus.classList.toggle("checkout-status--error", isError);
  checkoutStatus.hidden = false;
}

async function startCheckout(button) {
  button.disabled = true;

  try {
    const response = await fetch(API_URL + "/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify({ team_id: button.dataset.team })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't start checkout. Please try again.");
    }
    // Stripe hosts the payment page, so card details never touch our site
    location.href = data.url;
  } catch (error) {
    showCheckoutStatus(error instanceof TypeError ? "Can't reach the server right now." : error.message, true);
    button.disabled = false;
  }
}

if (checkoutStatus) {
  document.querySelectorAll("[data-team]").forEach((button) => {
    button.addEventListener("click", () => startCheckout(button));
  });

  // Stripe sends the user back with ?checkout=success or ?checkout=canceled
  const result = new URLSearchParams(location.search).get("checkout");
  if (result === "success") {
    // the team gets added by the webhook, which can land a few seconds after this page loads
    showCheckoutStatus("Thanks for your purchase! Your team will show up on your dashboard shortly.", false);
  } else if (result === "canceled") {
    showCheckoutStatus("Checkout canceled. You weren't charged.", true);
  }
}

// --------------------------------------------------------------------
// Admin panel access control
// --------------------------------------------------------------------

// Verify the user has admin permissions before choosing whether to show or hide
export function getToken() {
  return localStorage.getItem("token");
}

export async function getCurrentUser() {
  const token = getToken();

  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(API_URL + "/users/me", {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : `Unable to load current user (${response.status}).`
    );
  }

  return data;
}

// Adds Admin nav item and shows/hides admin content based on the user's role
async function initializeAuthorization() {
  const adminNavItem = document.getElementById("admin-nav-item");
  const usernameElement = document.getElementById("nav-username");
  const adminContent = document.getElementById("admin-content");
  const loadingElement = document.getElementById("admin-loading");

  const requiresAdmin =
    document.body.dataset.requiresAdmin === "true";

  // Default to hidden until the backend confirms authorization.
  if (adminNavItem) {
    adminNavItem.hidden = true;
  }

  if (adminContent) {
    adminContent.hidden = true;
  }

  const token = getToken();

  if (!token) {
    if (usernameElement) {
      usernameElement.textContent = "Not signed in";
    }

    if (requiresAdmin) {
      location.replace("index.html");
    }

    return;
  }

  try {
    const user = await getCurrentUser();

    console.log("Current user response:", {
      id: user.id,
      username: user.username,
      role: user.role
    });

    const isAdmin =
      String(user.role || "").trim().toLowerCase() === "admin";

    if (usernameElement) {
      usernameElement.textContent =
        user.username ||
        localStorage.getItem("username") ||
        "User";
    }

    if (adminNavItem) {
      adminNavItem.hidden = !isAdmin;
    }

    // Sends user back to dashboard if they try to bruteforce admin.html without admin permissions
    if (requiresAdmin && !isAdmin) {
      location.replace("dashboard.html");
      return;
    }

    if (requiresAdmin && adminContent) {
      adminContent.hidden = false;
    }

    if (loadingElement) {
      loadingElement.hidden = true;
    }
  } catch (error) {
    console.error("Authorization initialization failed:", error);

    if (usernameElement) {
      usernameElement.textContent =
        localStorage.getItem("username") || "User";
    }

    if (loadingElement) {
      loadingElement.textContent =
        "Unable to verify administrator access.";
    }

    if (requiresAdmin) {
      // Give the status message time to render before redirecting.
      setTimeout(() => {
        location.replace("index.html");
      }, 1500);
    }
  }
}

initializeAuthorization();