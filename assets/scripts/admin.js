// Import exported functions from main.js
import {
  apiRequest,
  getCurrentUser,
  getToken
} from "./main.js";

const tableBody = document.getElementById("user-table-body");
const searchInput = document.getElementById("user-search");
const userCount = document.getElementById("user-count");
const emptyState = document.getElementById("empty-state");
const adminStatus = document.getElementById("admin-status");
const refreshButton = document.getElementById("refresh-users");

const banDialog = document.getElementById("ban-dialog");
const banForm = document.getElementById("ban-form");
const banUserId = document.getElementById("ban-user-id");
const banMemberName = document.getElementById("ban-member-name");
const banEndGroup = document.getElementById("ban-end-group");
const banEndTime = document.getElementById("ban-end-time");
const banFormStatus = document.getElementById("ban-form-status");

// Error checking
console.log("admin.js loaded");
console.log({
  tableBody: Boolean(tableBody),
  searchInput: Boolean(searchInput),
  userCount: Boolean(userCount),
  emptyState: Boolean(emptyState),
  adminStatus: Boolean(adminStatus),
  refreshButton: Boolean(refreshButton),
  banDialog: Boolean(banDialog),
  banForm: Boolean(banForm),
  banUserId: Boolean(banUserId),
  banMemberName: Boolean(banMemberName),
  banEndGroup: Boolean(banEndGroup),
  banEndTime: Boolean(banEndTime),
  banFormStatus: Boolean(banFormStatus)
});

let users = [];

// Checks if the user has an admin role. Transforms the role to lowercase and trims whitespace for safe comparrison.
function isAdmin(user) {
  return String(user.role || "").trim().toLowerCase() === "admin";
}

// Formats date (if applicable) to a human-friendly format.
function formatDate(value) {
  if (!value) {
    return "No expiration";
  }

  return new Date(value).toLocaleString();
}

// Sets the admin status message and applies error styling if needed.
function setAdminStatus(message, isError = false) {
  adminStatus.textContent = message;
  adminStatus.classList.toggle("status--error", isError);
}

// Loads the admin page (navbar icon and admin dashboard) if the user is an admin. Kicks user back to dashboard.html otherwise.
async function initializeAdminPage() {
  // Error checking
  console.log("initializeAdminPage started");
  const adminContent = document.getElementById("admin-content");
  const loading = document.getElementById("admin-loading");
  const navUsername = document.getElementById("nav-username");
  const adminNavItem = document.getElementById("admin-nav-item");

  if (!getToken()) {
    location.replace("index.html");
    return;
  }

  try {
    const user = await getCurrentUser();

    if (!isAdmin(user)) {
      location.replace("dashboard.html");
      return;
    }

    navUsername.textContent = user.username || "Admin";
    adminNavItem.hidden = false;
    adminContent.hidden = false;
    loading.hidden = true;

    await loadUsers();
  } catch (error) {
    console.error(error);
    loading.textContent = "Unable to load the admin panel.";
  }
}

// Loads the list of users from the backend. 
async function loadUsers() {
  // Error checking
  console.log("loadUsers started");
  refreshButton.disabled = true;
  setAdminStatus("");

  try {
    const result = await apiRequest("/admin/users");
    users = Array.isArray(result) ? result : result.users || [];
    renderUsers();
  } catch (error) {
    tableBody.replaceChildren();
    setAdminStatus(error.message, true);
  } finally {
    refreshButton.disabled = false;
  }
}

// Renders the list of users in the table, filtering based on the search input.
function renderUsers() {
  const query = searchInput.value.trim().toLowerCase();

  const filtered = users.filter((user) => {
    const text = [
      user.id,
      user.username,
      user.email,
      user.role,
      user.ban?.reason
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return text.includes(query);
  });

  tableBody.replaceChildren();

  for (const user of filtered) {
    tableBody.append(createUserRow(user));
  }

  userCount.textContent =
    `${filtered.length} of ${users.length} members`;
  emptyState.hidden = filtered.length !== 0;
}

// Takes user information and creates invdividual table rows for each user. Factors in ban status and creates the proper buttons.
function createUserRow(user) {
  const row = document.createElement("tr");

  const memberCell = document.createElement("td");
  const username = document.createElement("strong");
  const identifier = document.createElement("div");

  username.textContent = user.username || "Unnamed member";
  identifier.className = "hint";
  identifier.textContent = user.email || user.id;
  memberCell.append(username, identifier);

  const roleCell = document.createElement("td");
  roleCell.textContent = user.role || "user";

  const statusCell = document.createElement("td");
  const badge = document.createElement("span");

  badge.className = user.ban
    ? "account-status account-status--banned"
    : "account-status account-status--active";

  badge.textContent = user.ban ? "Banned" : "Active";
  statusCell.append(badge);

  const detailsCell = document.createElement("td");

  // If the user is banned, display the reason and expiration date. Empty otherwise.
  if (user.ban) {
    const reason = document.createElement("div");
    const expiration = document.createElement("div");

    reason.textContent = user.ban.reason;
    expiration.className = "hint";
    expiration.textContent = user.ban.end_time
      ? `Until ${formatDate(user.ban.end_time)}`
      : "Permanent";

    detailsCell.append(reason, expiration);
  } else {
    detailsCell.textContent = "—";
  }

  const actionsCell = document.createElement("td");
  const actions = document.createElement("div");
  actions.className = "user-table__actions";

  // Creates either "Ban" or "Unban" buttons depending on user status.
  if (user.ban) {
    const unbanButton = document.createElement("button");
    unbanButton.type = "button";
    unbanButton.className = "btn";
    unbanButton.textContent = "Unban";
    unbanButton.dataset.action = "unban";
    unbanButton.dataset.userId = user.id;
    actions.append(unbanButton);
  } else {
    const banButton = document.createElement("button");
    banButton.type = "button";
    banButton.className = "btn btn--danger";
    banButton.textContent = "Ban";
    banButton.dataset.action = "ban";
    banButton.dataset.userId = user.id;
    actions.append(banButton);
  }

  actionsCell.append(actions);
  row.append(
    memberCell,
    roleCell,
    statusCell,
    detailsCell,
    actionsCell
  );

  return row;
}

// Opens the ban diaglog (below </main> in admin.html) and pre-fills the form with the selected user's information. Sets the default ban end time to 24 hours from now.)
function openBanDialog(user) {
  banForm.reset();
  banUserId.value = user.id;
  banMemberName.textContent =
    user.username || user.email || user.id;
  banFormStatus.textContent = "";

  const oneDayFromNow = new Date(
    Date.now() + 24 * 60 * 60 * 1000
  );

  // datetime-local expects YYYY-MM-DDTHH:mm.
  const localDate = new Date(
    oneDayFromNow.getTime() -
    oneDayFromNow.getTimezoneOffset() * 60_000
  );

  banEndTime.value = localDate.toISOString().slice(0, 16);
  updateBanTypeFields();
  banDialog.showModal();
}

function closeBanDialog() {
  banDialog.close();
}

// Updates the visibility and required status of the ban end time field based on the selected ban type (temporary or permanent).
function updateBanTypeFields() {
  const banType =
    banForm.elements.namedItem("ban_type").value;

  const temporary = banType === "temporary";

  banEndGroup.hidden = !temporary;
  banEndTime.required = temporary;
  banEndTime.disabled = !temporary;
}

banForm.addEventListener("change", (event) => {
  if (event.target.name === "ban_type") {
    updateBanTypeFields();
  }
});

document
  .getElementById("close-ban-dialog")
  .addEventListener("click", closeBanDialog);

document
  .getElementById("cancel-ban")
  .addEventListener("click", closeBanDialog);

// When user clicks "Submit" button in the ban form. Sends data to backend and updates the user list.
banForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!banForm.checkValidity()) {
    banForm.reportValidity();
    return;
  }

  const submitButton =
    banForm.querySelector("button[type='submit']");

  const formData = new FormData(banForm);
  const banType = formData.get("ban_type");
  const userId = formData.get("user_id");

  const payload = {
    ban_type: banType,
    reason: String(formData.get("reason")).trim(),
    end_time:
      banType === "temporary"
        ? new Date(
            String(formData.get("end_time"))
          ).toISOString()
        : null
  };

  submitButton.disabled = true;
  banFormStatus.textContent = "Applying ban…";

  try {
    await apiRequest(
      `/admin/users/${encodeURIComponent(userId)}/bans`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    banDialog.close();
    setAdminStatus("Member banned.");
    await loadUsers();
  } catch (error) {
    banFormStatus.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

// Handles clicks on the "Ban" and "Unban" buttons in the user table. Opens the ban dialog for banning, and confirms before unbanning.
tableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const user = users.find(
    (item) => String(item.id) === button.dataset.userId
  );

  if (!user) {
    setAdminStatus("Member could not be found.", true);
    return;
  }

  // When user clicks "Ban" button.
  if (button.dataset.action === "ban") {
    openBanDialog(user);
    return;
  }

  // When user clicks "Unban" button.
  if (button.dataset.action === "unban") {
    const confirmed = window.confirm(
      `Unban ${user.username || user.email || user.id}?`
    );

    if (!confirmed) {
      return;
    }

    button.disabled = true;

    // Sends a DELETE request to the backend to remove the ban for the selected user. Updates the user list upon success.
    try {
      await apiRequest(
        `/admin/users/${encodeURIComponent(user.id)}/bans`,
        { method: "DELETE" }
      );

      setAdminStatus("Member unbanned.");
      await loadUsers();
    } catch (error) {
      setAdminStatus(error.message, true);
      button.disabled = false;
    }
  }
});

searchInput.addEventListener("input", renderUsers);
refreshButton.addEventListener("click", loadUsers);

initializeAdminPage();