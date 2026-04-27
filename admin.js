const state = {
  token: localStorage.getItem("tg_admin_token") || "",
  users: [],
  sessions: []
};

const nodes = {
  loginView: document.getElementById("login-view"),
  dashboardView: document.getElementById("dashboard-view"),
  loginForm: document.getElementById("login-form"),
  loginError: document.getElementById("login-error"),
  adminKey: document.getElementById("admin-key"),
  logoutButton: document.getElementById("logout-button"),
  refreshButton: document.getElementById("refresh-button"),
  createUserForm: document.getElementById("create-user-form"),
  newLogin: document.getElementById("new-login"),
  newDays: document.getElementById("new-days"),
  newBeta: document.getElementById("new-beta"),
  newUserKey: document.getElementById("new-user-key"),
  userFilter: document.getElementById("user-filter"),
  usersBody: document.getElementById("users-body"),
  sessionsBody: document.getElementById("sessions-body"),
  sessionsUpdated: document.getElementById("sessions-updated"),
  statUsers: document.getElementById("stat-users"),
  statActive: document.getElementById("stat-active"),
  statBeta: document.getElementById("stat-beta"),
  statDisabled: document.getElementById("stat-disabled"),
  toast: document.getElementById("toast")
};

function showToast(message) {
  nodes.toast.textContent = message;
  nodes.toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => nodes.toast.classList.add("hidden"), 3200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function setLoggedIn(loggedIn) {
  nodes.loginView.classList.toggle("hidden", loggedIn);
  nodes.dashboardView.classList.toggle("hidden", !loggedIn);
}

function formatDate(value) {
  if (!value) return "нет";
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function daysLeft(value) {
  if (!value) return "нет";
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return "истекла";
  const days = Math.ceil(diff / 86400000);
  return `${days} д.`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function rolePills(roles) {
  return (roles || [])
    .map((role) => `<span class="pill ${role === "beta" ? "good" : ""}">${escapeHtml(role)}</span>`)
    .join("");
}

function renderStats(stats) {
  nodes.statUsers.textContent = stats.users || 0;
  nodes.statActive.textContent = stats.activeUsers || 0;
  nodes.statBeta.textContent = stats.betaUsers || 0;
  nodes.statDisabled.textContent = stats.disabledUsers || 0;
}

function renderSessions() {
  if (state.sessions.length === 0) {
    nodes.sessionsBody.innerHTML = `<tr><td colspan="6" class="muted">Нет активных сессий</td></tr>`;
    return;
  }

  nodes.sessionsBody.innerHTML = state.sessions
    .map((session) => `
      <tr>
        <td>${escapeHtml(session.login)}</td>
        <td>${escapeHtml(session.game)}</td>
        <td>${escapeHtml(session.clientVersion || "-")}</td>
        <td>${escapeHtml(session.hardwareId || "-")}</td>
        <td>${escapeHtml(session.ip || "-")}</td>
        <td>${formatDate(session.lastSeenAt)}</td>
      </tr>
    `)
    .join("");
}

function renderUsers() {
  const query = nodes.userFilter.value.trim().toLowerCase();
  const users = query
    ? state.users.filter((user) => user.login.toLowerCase().includes(query))
    : state.users;

  if (users.length === 0) {
    nodes.usersBody.innerHTML = `<tr><td colspan="5" class="muted">Пользователи не найдены</td></tr>`;
    return;
  }

  nodes.usersBody.innerHTML = users
    .map((user) => {
      const hasBeta = (user.roles || []).includes("beta");
      const statusClass = user.subscriptionActive ? "good" : "warn";
      const statusText = user.subscriptionActive ? daysLeft(user.subscriptionExpiresAt) : "нет доступа";
      return `
        <tr>
          <td>${escapeHtml(user.login)}</td>
          <td>${rolePills(user.roles)}</td>
          <td>
            <span class="pill ${statusClass}">${statusText}</span>
            <span class="muted">${formatDate(user.subscriptionExpiresAt)}</span>
          </td>
          <td>${user.activeSessionCount || 0}</td>
          <td>
            <div class="actions">
              <button class="button" data-action="extend" data-days="7" data-id="${user.id}">+7д</button>
              <button class="button" data-action="extend" data-days="30" data-id="${user.id}">+30д</button>
              <button class="button" data-action="revoke" data-id="${user.id}">Снять</button>
              <button class="button" data-action="beta" data-enabled="${!hasBeta}" data-id="${user.id}">
                ${hasBeta ? "Убрать beta" : "Выдать beta"}
              </button>
              <button class="button danger" data-action="delete" data-id="${user.id}">Удалить</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function refresh() {
  const data = await api("/api/admin/overview");
  state.users = data.users || [];
  state.sessions = data.sessions || [];
  renderStats(data.stats || {});
  renderSessions();
  renderUsers();
  nodes.sessionsUpdated.textContent = `обновлено ${formatDate(new Date().toISOString())}`;
}

async function login(event) {
  event.preventDefault();
  nodes.loginError.textContent = "";
  try {
    const data = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ key: nodes.adminKey.value.trim() })
    });
    state.token = data.token;
    localStorage.setItem("tg_admin_token", state.token);
    setLoggedIn(true);
    await refresh();
  } catch (error) {
    nodes.loginError.textContent = error.message;
  }
}

async function createUser(event) {
  event.preventDefault();
  const roles = nodes.newBeta.checked ? ["user", "beta"] : ["user"];
  const data = await api("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({
      login: nodes.newLogin.value.trim(),
      subscriptionDays: Number(nodes.newDays.value),
      roles
    })
  });

  nodes.newUserKey.textContent = `Ключ пользователя ${data.user.login}: ${data.accessKey}`;
  nodes.createUserForm.reset();
  nodes.newDays.value = 30;
  showToast("Пользователь создан");
  await refresh();
}

async function handleUserAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;

  if (action === "extend") {
    await api(`/api/admin/users/${id}/extend`, {
      method: "PATCH",
      body: JSON.stringify({ days: Number(button.dataset.days) })
    });
    showToast("Подписка продлена");
  }

  if (action === "revoke") {
    await api(`/api/admin/users/${id}/revoke`, { method: "PATCH", body: "{}" });
    showToast("Подписка снята");
  }

  if (action === "beta") {
    await api(`/api/admin/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role: "beta", enabled: button.dataset.enabled === "true" })
    });
    showToast("Роль обновлена");
  }

  if (action === "delete") {
    const user = state.users.find((item) => item.id === id);
    if (!confirm(`Удалить аккаунт ${user?.login || ""}?`)) return;
    await api(`/api/admin/users/${id}`, { method: "DELETE" });
    showToast("Аккаунт удален");
  }

  await refresh();
}

nodes.loginForm.addEventListener("submit", login);
nodes.logoutButton.addEventListener("click", () => {
  state.token = "";
  localStorage.removeItem("tg_admin_token");
  setLoggedIn(false);
});
nodes.refreshButton.addEventListener("click", () => refresh().catch((error) => showToast(error.message)));
nodes.createUserForm.addEventListener("submit", (event) => createUser(event).catch((error) => showToast(error.message)));
nodes.usersBody.addEventListener("click", (event) => handleUserAction(event).catch((error) => showToast(error.message)));
nodes.userFilter.addEventListener("input", renderUsers);

if (state.token) {
  setLoggedIn(true);
  refresh().catch(() => {
    state.token = "";
    localStorage.removeItem("tg_admin_token");
    setLoggedIn(false);
  });
} else {
  setLoggedIn(false);
}

setInterval(() => {
  if (state.token) refresh().catch(() => {});
}, 10000);
