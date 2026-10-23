// Import exported functions from main.js

import {
  API_URL,
  getToken,
  getCurrentUser
} from "./main.js";

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