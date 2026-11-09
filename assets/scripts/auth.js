const API_URL = "/api"; 
const LOGIN_PAGE = "index.html";             
const HOME_PAGE = "dashboard.html";        

function saveSession(data) {
  localStorage.setItem("token", data.access_token);
  localStorage.setItem("username", data.username || "");
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
}

function getToken() {
  return localStorage.getItem("token");
}

// Returns the user object if the session is valid, otherwise null. Only clears the stored token when the server says it's invalid (401)
async function getValidSession() {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 401) {
      clearSession();
      return null;
    }
    if (!res.ok) return null;

    return await res.json(); // { id, username, role }
  } catch {
    return null; // network error
  }
}

// Call on the login page: skip login if already signed in
async function redirectIfLoggedIn() {
  const user = await getValidSession();
  if (user) window.location.replace(HOME_PAGE);
}

// Call on every protected page
async function requireAuth({ adminOnly = false } = {}) {
  try {
    const user = await getValidSession();

    if (!user || (adminOnly && user.role !== "admin")) {
      window.location.replace(user ? HOME_PAGE : LOGIN_PAGE);
      return null;
    }

    document.documentElement.style.visibility = "visible";
    return user;
  } catch (err) {
    console.error("Auth check failed:", err);
    window.location.replace(LOGIN_PAGE);
    return null;
  }
}

// Sets up the user menu toggle and logout button. Call during renderNavbar()
function setupUserMenu() {
  const wrapper = document.querySelector(".navbar__user");
  const toggle = document.getElementById("user-menu-toggle");
  const menu = document.getElementById("user-menu");
  const logoutBtn = document.getElementById("logout-btn");
  if (!wrapper || !toggle || !menu) return;

  function setOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  }

  toggle.addEventListener("click", () => setOpen(menu.hidden));

  // Click outside closes
  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) setOpen(false);
  });

  // Escape closes and returns focus to the button
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });

  // Tabbing out of the menu closes it
  wrapper.addEventListener("focusout", (e) => {
    if (!wrapper.contains(e.relatedTarget)) setOpen(false);
  });

  if (logoutBtn) logoutBtn.addEventListener("click", logout);
}

// Loads navbar with the username and sets up logout button. Call after requireAuth()
function renderNavbar(user) {
  const el = document.getElementById("nav-username");
  if (el) el.textContent = user.username;

  // Hide admin-only links (when applicable)
  const adminItem = document.getElementById("admin-nav-item");
  if (adminItem) adminItem.hidden = user.role !== "admin";

  setupUserMenu();
}

// Clears the stored session ID (line 16 main.js) and redirects to the login page
function logout() {
  clearSession();
  window.location.replace(LOGIN_PAGE);
}

// Stops users from signing out and then using the brower's back button
window.addEventListener("pageshow", (e) => {
  if (e.persisted && document.documentElement.style.visibility === "visible" && !getToken()) {
    window.location.replace(LOGIN_PAGE);
  }
});