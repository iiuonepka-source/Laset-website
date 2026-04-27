const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

let PgPool = null;
try {
  PgPool = require("pg").Pool;
} catch {
  PgPool = null;
}

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const ADMIN_KEYS_FILE = path.join(__dirname, "admin-keys.txt");
const ACTIVE_WINDOW_MS = 90 * 1000;
const MAX_BODY_BYTES = 64 * 1024;
const DATABASE_URL = process.env.DATABASE_URL || "";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

const adminSessions = new Map();

function nowIso() {
  return new Date().toISOString();
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashSecret(secret) {
  return crypto.createHash("sha256").update(String(secret)).digest("hex");
}

function safeEqualHex(left, right) {
  const a = Buffer.from(left || "", "hex");
  const b = Buffer.from(right || "", "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function loadAdminKeyHashes() {
  const fromEnv = (process.env.ADMIN_KEYS || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  let fromFile = [];
  if (fs.existsSync(ADMIN_KEYS_FILE)) {
    fromFile = fs
      .readFileSync(ADMIN_KEYS_FILE, "utf8")
      .split(/\r?\n/)
      .map((key) => key.trim())
      .filter(Boolean);
  }

  return [...new Set([...fromEnv, ...fromFile])].map(hashSecret);
}

const adminKeyHashes = loadAdminKeyHashes();

function normalizeUser(row) {
  return {
    id: row.id,
    login: row.login,
    accessKeyHash: row.access_key_hash ?? row.accessKeyHash,
    roles: Array.isArray(row.roles) ? row.roles : ["user"],
    disabled: Boolean(row.disabled),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
    subscriptionExpiresAt: row.subscription_expires_at ?? row.subscriptionExpiresAt,
    lastSeenAt: row.last_seen_at ?? row.lastSeenAt
  };
}

function normalizeSession(row) {
  return {
    id: row.id,
    tokenHash: row.token_hash ?? row.tokenHash,
    userId: row.user_id ?? row.userId,
    hardwareId: row.hardware_id ?? row.hardwareId,
    clientVersion: row.client_version ?? row.clientVersion,
    game: row.game,
    status: row.status,
    ip: row.ip,
    createdAt: row.created_at ?? row.createdAt,
    lastSeenAt: row.last_seen_at ?? row.lastSeenAt,
    login: row.login,
    roles: row.roles
  };
}

function normalizeAudit(row) {
  return {
    id: row.id,
    action: row.action,
    details: row.details || {},
    ip: row.ip,
    createdAt: row.created_at ?? row.createdAt
  };
}

function isSubscriptionActive(user) {
  if (user.disabled) return false;
  if (!user.subscriptionExpiresAt) return false;
  return new Date(user.subscriptionExpiresAt).getTime() > Date.now();
}

function publicUser(user, sessions = []) {
  const activeCount = sessions.filter((session) => session.userId === user.id).length;
  return {
    id: user.id,
    login: user.login,
    roles: user.roles || [],
    disabled: Boolean(user.disabled),
    createdAt: user.createdAt,
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    subscriptionActive: isSubscriptionActive(user),
    lastSeenAt: user.lastSeenAt || null,
    activeSessionCount: activeCount
  };
}

function ensureJsonStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify({ users: [], sessions: [], audit: [], createdAt: nowIso(), updatedAt: nowIso() }, null, 2)
    );
  }
}

function loadJsonStore() {
  ensureJsonStore();
  const store = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  store.users ||= [];
  store.sessions ||= [];
  store.audit ||= [];
  return store;
}

function saveJsonStore(store) {
  store.updatedAt = nowIso();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function activeJsonSessions(store) {
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  return store.sessions
    .filter((session) => session.status !== "offline" && new Date(session.lastSeenAt).getTime() >= cutoff)
    .map((session) => {
      const user = store.users.find((item) => item.id === session.userId);
      return {
        id: session.id,
        userId: session.userId,
        login: user?.login || "deleted",
        roles: user?.roles || [],
        game: session.game || "unknown",
        status: session.status || "online",
        clientVersion: session.clientVersion || "",
        hardwareId: session.hardwareId || "",
        ip: session.ip || "",
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt
      };
    });
}

function jsonStorage() {
  return {
    name: "json",
    async overview() {
      const store = loadJsonStore();
      const sessions = activeJsonSessions(store);
      return {
        users: store.users.map((user) => publicUser(user, sessions)),
        sessions,
        stats: {
          users: store.users.length,
          activeUsers: new Set(sessions.map((session) => session.userId)).size,
          betaUsers: store.users.filter((user) => user.roles?.includes("beta")).length,
          disabledUsers: store.users.filter((user) => user.disabled).length
        },
        audit: store.audit.slice(0, 30)
      };
    },
    async createUser({ login, accessKeyHash, roles, subscriptionExpiresAt, req }) {
      const store = loadJsonStore();
      if (store.users.some((user) => user.login.toLowerCase() === login.toLowerCase())) return null;
      const user = {
        id: crypto.randomUUID(),
        login,
        accessKeyHash,
        roles,
        disabled: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        subscriptionExpiresAt
      };
      store.users.push(user);
      addJsonAudit(store, "user.create", { login, roles }, req);
      saveJsonStore(store);
      return user;
    },
    async findUserByLogin(login) {
      return loadJsonStore().users.find((user) => user.login.toLowerCase() === login.toLowerCase()) || null;
    },
    async extendUser(id, days, req) {
      const store = loadJsonStore();
      const user = store.users.find((item) => item.id === id);
      if (!user) return null;
      const base = Math.max(Date.now(), new Date(user.subscriptionExpiresAt || 0).getTime());
      user.subscriptionExpiresAt = new Date(base + days * 86400000).toISOString();
      user.disabled = false;
      user.updatedAt = nowIso();
      addJsonAudit(store, "subscription.extend", { login: user.login, days }, req);
      saveJsonStore(store);
      return { user, sessions: activeJsonSessions(store) };
    },
    async revokeUser(id, req) {
      const store = loadJsonStore();
      const user = store.users.find((item) => item.id === id);
      if (!user) return null;
      user.subscriptionExpiresAt = new Date(Date.now() - 1000).toISOString();
      user.updatedAt = nowIso();
      store.sessions = store.sessions.filter((session) => session.userId !== user.id);
      addJsonAudit(store, "subscription.revoke", { login: user.login }, req);
      saveJsonStore(store);
      return { user, sessions: [] };
    },
    async setRole(id, role, enabled, req) {
      const store = loadJsonStore();
      const user = store.users.find((item) => item.id === id);
      if (!user) return null;
      user.roles ||= ["user"];
      if (enabled && !user.roles.includes(role)) user.roles.push(role);
      if (!enabled) user.roles = user.roles.filter((item) => item !== role && item !== "user");
      user.updatedAt = nowIso();
      addJsonAudit(store, "role.update", { login: user.login, role, enabled }, req);
      saveJsonStore(store);
      return { user, sessions: activeJsonSessions(store) };
    },
    async deleteUser(id, req) {
      const store = loadJsonStore();
      const user = store.users.find((item) => item.id === id);
      if (!user) return false;
      store.users = store.users.filter((item) => item.id !== id);
      store.sessions = store.sessions.filter((session) => session.userId !== id);
      addJsonAudit(store, "user.delete", { login: user.login }, req);
      saveJsonStore(store);
      return true;
    },
    async createSession(user, body, req) {
      const store = loadJsonStore();
      const sessionToken = randomToken();
      const session = {
        id: crypto.randomUUID(),
        tokenHash: hashSecret(sessionToken),
        userId: user.id,
        hardwareId: String(body.hardwareId || "").slice(0, 128),
        clientVersion: String(body.clientVersion || "").slice(0, 64),
        game: String(body.game || "Minecraft").slice(0, 64),
        status: "online",
        ip: req.socket.remoteAddress,
        createdAt: nowIso(),
        lastSeenAt: nowIso()
      };
      const storedUser = store.users.find((item) => item.id === user.id);
      storedUser.lastSeenAt = session.lastSeenAt;
      store.sessions.push(session);
      store.sessions = store.sessions.slice(-1000);
      saveJsonStore(store);
      return { sessionToken, user: storedUser };
    },
    async heartbeat(sessionToken, body) {
      const store = loadJsonStore();
      const tokenHash = hashSecret(sessionToken || "");
      const session = store.sessions.find((item) => safeEqualHex(item.tokenHash, tokenHash));
      if (!session) return { status: "invalid" };
      const user = store.users.find((item) => item.id === session.userId);
      if (!user || !isSubscriptionActive(user)) {
        store.sessions = store.sessions.filter((item) => item.id !== session.id);
        saveJsonStore(store);
        return { status: "inactive" };
      }
      session.lastSeenAt = nowIso();
      session.status = String(body.status || "online").slice(0, 32);
      session.game = String(body.game || session.game || "Minecraft").slice(0, 64);
      user.lastSeenAt = session.lastSeenAt;
      saveJsonStore(store);
      return { status: "ok", user };
    },
    async logout(sessionToken) {
      const store = loadJsonStore();
      const tokenHash = hashSecret(sessionToken || "");
      store.sessions = store.sessions.filter((item) => !safeEqualHex(item.tokenHash, tokenHash));
      saveJsonStore(store);
    }
  };
}

function addJsonAudit(store, action, details, req) {
  store.audit.unshift({
    id: crypto.randomUUID(),
    action,
    details,
    ip: req.socket.remoteAddress,
    createdAt: nowIso()
  });
  store.audit = store.audit.slice(0, 200);
}

function postgresStorage(pool) {
  async function audit(action, details, req) {
    await pool.query(
      "insert into audit (id, action, details, ip, created_at) values ($1, $2, $3, $4, now())",
      [crypto.randomUUID(), action, JSON.stringify(details || {}), req.socket.remoteAddress]
    );
  }

  async function activeSessions() {
    const { rows } = await pool.query(
      `select s.*, u.login, u.roles
       from sessions s
       left join users u on u.id = s.user_id
       where s.status <> 'offline' and s.last_seen_at >= now() - interval '90 seconds'
       order by s.last_seen_at desc`
    );
    return rows.map(normalizeSession);
  }

  return {
    name: "postgres",
    async init() {
      await pool.query(`
        create table if not exists users (
          id uuid primary key,
          login text not null unique,
          access_key_hash text not null,
          roles jsonb not null default '["user"]'::jsonb,
          disabled boolean not null default false,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          subscription_expires_at timestamptz,
          last_seen_at timestamptz
        );

        create table if not exists sessions (
          id uuid primary key,
          token_hash text not null unique,
          user_id uuid not null references users(id) on delete cascade,
          hardware_id text,
          client_version text,
          game text,
          status text not null default 'online',
          ip text,
          created_at timestamptz not null default now(),
          last_seen_at timestamptz not null default now()
        );

        create table if not exists audit (
          id uuid primary key,
          action text not null,
          details jsonb not null default '{}'::jsonb,
          ip text,
          created_at timestamptz not null default now()
        );

        create index if not exists sessions_last_seen_idx on sessions(last_seen_at);
        create index if not exists sessions_user_id_idx on sessions(user_id);
      `);
    },
    async overview() {
      const [usersResult, sessions, auditResult] = await Promise.all([
        pool.query("select * from users order by created_at desc"),
        activeSessions(),
        pool.query("select * from audit order by created_at desc limit 30")
      ]);
      const users = usersResult.rows.map(normalizeUser);
      return {
        users: users.map((user) => publicUser(user, sessions)),
        sessions,
        stats: {
          users: users.length,
          activeUsers: new Set(sessions.map((session) => session.userId)).size,
          betaUsers: users.filter((user) => user.roles?.includes("beta")).length,
          disabledUsers: users.filter((user) => user.disabled).length
        },
        audit: auditResult.rows.map(normalizeAudit)
      };
    },
    async createUser({ login, accessKeyHash, roles, subscriptionExpiresAt, req }) {
      try {
        const { rows } = await pool.query(
          `insert into users (id, login, access_key_hash, roles, disabled, subscription_expires_at)
           values ($1, $2, $3, $4::jsonb, false, $5)
           returning *`,
          [crypto.randomUUID(), login, accessKeyHash, JSON.stringify(roles), subscriptionExpiresAt]
        );
        await audit("user.create", { login, roles }, req);
        return normalizeUser(rows[0]);
      } catch (error) {
        if (error.code === "23505") return null;
        throw error;
      }
    },
    async findUserByLogin(login) {
      const { rows } = await pool.query("select * from users where lower(login) = lower($1) limit 1", [login]);
      return rows[0] ? normalizeUser(rows[0]) : null;
    },
    async extendUser(id, days, req) {
      const { rows } = await pool.query(
        `update users
         set subscription_expires_at = greatest(coalesce(subscription_expires_at, now()), now()) + ($2::int * interval '1 day'),
             disabled = false,
             updated_at = now()
         where id = $1
         returning *`,
        [id, days]
      );
      if (!rows[0]) return null;
      const user = normalizeUser(rows[0]);
      await audit("subscription.extend", { login: user.login, days }, req);
      return { user, sessions: await activeSessions() };
    },
    async revokeUser(id, req) {
      const { rows } = await pool.query(
        "update users set subscription_expires_at = now() - interval '1 second', updated_at = now() where id = $1 returning *",
        [id]
      );
      if (!rows[0]) return null;
      const user = normalizeUser(rows[0]);
      await pool.query("delete from sessions where user_id = $1", [id]);
      await audit("subscription.revoke", { login: user.login }, req);
      return { user, sessions: [] };
    },
    async setRole(id, role, enabled, req) {
      const user = await pool.connect();
      try {
        await user.query("begin");
        const { rows } = await user.query("select * from users where id = $1 for update", [id]);
        if (!rows[0]) {
          await user.query("rollback");
          return null;
        }
        const current = normalizeUser(rows[0]);
        let roles = current.roles || ["user"];
        if (enabled && !roles.includes(role)) roles.push(role);
        if (!enabled) roles = roles.filter((item) => item !== role && item !== "user");
        const updated = await user.query(
          "update users set roles = $2::jsonb, updated_at = now() where id = $1 returning *",
          [id, JSON.stringify(roles)]
        );
        await user.query("commit");
        const normalized = normalizeUser(updated.rows[0]);
        await audit("role.update", { login: normalized.login, role, enabled }, req);
        return { user: normalized, sessions: await activeSessions() };
      } catch (error) {
        await user.query("rollback");
        throw error;
      } finally {
        user.release();
      }
    },
    async deleteUser(id, req) {
      const { rows } = await pool.query("delete from users where id = $1 returning login", [id]);
      if (!rows[0]) return false;
      await audit("user.delete", { login: rows[0].login }, req);
      return true;
    },
    async createSession(user, body, req) {
      const sessionToken = randomToken();
      await pool.query(
        `insert into sessions (id, token_hash, user_id, hardware_id, client_version, game, status, ip, created_at, last_seen_at)
         values ($1, $2, $3, $4, $5, $6, 'online', $7, now(), now())`,
        [
          crypto.randomUUID(),
          hashSecret(sessionToken),
          user.id,
          String(body.hardwareId || "").slice(0, 128),
          String(body.clientVersion || "").slice(0, 64),
          String(body.game || "Minecraft").slice(0, 64),
          req.socket.remoteAddress
        ]
      );
      const { rows } = await pool.query("update users set last_seen_at = now() where id = $1 returning *", [user.id]);
      return { sessionToken, user: normalizeUser(rows[0]) };
    },
    async heartbeat(sessionToken, body) {
      const tokenHash = hashSecret(sessionToken || "");
      const { rows } = await pool.query(
        `select s.id as session_id, u.*
         from sessions s
         join users u on u.id = s.user_id
         where s.token_hash = $1
         limit 1`,
        [tokenHash]
      );
      if (!rows[0]) return { status: "invalid" };
      const user = normalizeUser(rows[0]);
      if (!isSubscriptionActive(user)) {
        await pool.query("delete from sessions where id = $1", [rows[0].session_id]);
        return { status: "inactive" };
      }
      await pool.query(
        `update sessions
         set last_seen_at = now(), status = $2, game = $3
         where token_hash = $1`,
        [
          tokenHash,
          String(body.status || "online").slice(0, 32),
          String(body.game || "Minecraft").slice(0, 64)
        ]
      );
      const updated = await pool.query("update users set last_seen_at = now() where id = $1 returning *", [user.id]);
      return { status: "ok", user: normalizeUser(updated.rows[0]) };
    },
    async logout(sessionToken) {
      await pool.query("delete from sessions where token_hash = $1", [hashSecret(sessionToken || "")]);
    }
  };
}

async function createStorage() {
  if (!DATABASE_URL) return jsonStorage();
  if (!PgPool) throw new Error("Package pg is not installed. Run npm install in website.");

  const pool = new PgPool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined
  });
  const storage = postgresStorage(pool);
  await storage.init();
  return storage;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Body is too large"));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function getBearer(req) {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function requireAdmin(req, res) {
  const token = getBearer(req);
  const session = adminSessions.get(token);
  if (!session) {
    sendJson(res, 401, { ok: false, error: "Admin authorization required" });
    return false;
  }
  session.lastSeenAt = Date.now();
  return true;
}

function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const relativePath = requestPath === "/" ? "/index.html" : requestPath;
  const fullPath = path.normalize(path.join(__dirname, relativePath));

  if (!fullPath.startsWith(__dirname) || fullPath.includes(`${path.sep}data${path.sep}`) || fullPath.endsWith("admin-keys.txt")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentTypes[path.extname(fullPath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

async function handleApi(req, res, storage) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method || "GET";
  const pathname = url.pathname;

  if (method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, storage: storage.name, time: nowIso() });
    return;
  }

  if (method === "POST" && pathname === "/api/admin/login") {
    const body = await readJsonBody(req);
    const keyHash = hashSecret(body.key || "");
    const valid = adminKeyHashes.some((storedHash) => safeEqualHex(storedHash, keyHash));
    if (!valid) {
      sendJson(res, 401, { ok: false, error: "Invalid admin key" });
      return;
    }

    const token = randomToken();
    adminSessions.set(token, { createdAt: Date.now(), lastSeenAt: Date.now(), ip: req.socket.remoteAddress });
    sendJson(res, 200, { ok: true, token });
    return;
  }

  if (pathname.startsWith("/api/admin/") && !requireAdmin(req, res)) return;

  if (method === "GET" && pathname === "/api/admin/overview") {
    sendJson(res, 200, { ok: true, ...(await storage.overview()) });
    return;
  }

  if (method === "POST" && pathname === "/api/admin/users") {
    const body = await readJsonBody(req);
    const login = String(body.login || "").trim();
    const subscriptionDays = Math.max(0, Number(body.subscriptionDays || 0));
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(login)) {
      sendJson(res, 400, { ok: false, error: "Login must be 3-32 latin characters, digits, dot, dash or underscore" });
      return;
    }

    const accessKey = `U-${randomToken(4).toUpperCase()}-${randomToken(4).toUpperCase()}-${randomToken(4).toUpperCase()}`;
    const roles = Array.isArray(body.roles) ? body.roles.filter((role) => typeof role === "string") : [];
    if (!roles.includes("user")) roles.unshift("user");

    const user = await storage.createUser({
      login,
      accessKeyHash: hashSecret(accessKey),
      roles: [...new Set(roles)],
      subscriptionExpiresAt: new Date(Date.now() + subscriptionDays * 86400000).toISOString(),
      req
    });

    if (!user) {
      sendJson(res, 409, { ok: false, error: "User already exists" });
      return;
    }

    sendJson(res, 201, { ok: true, user: publicUser(user), accessKey });
    return;
  }

  const extendMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/extend$/);
  if (method === "PATCH" && extendMatch) {
    const body = await readJsonBody(req);
    const result = await storage.extendUser(extendMatch[1], Math.max(1, Math.min(3650, Number(body.days || 0))), req);
    if (!result) {
      sendJson(res, 404, { ok: false, error: "User not found" });
      return;
    }
    sendJson(res, 200, { ok: true, user: publicUser(result.user, result.sessions) });
    return;
  }

  const revokeMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/revoke$/);
  if (method === "PATCH" && revokeMatch) {
    const result = await storage.revokeUser(revokeMatch[1], req);
    if (!result) {
      sendJson(res, 404, { ok: false, error: "User not found" });
      return;
    }
    sendJson(res, 200, { ok: true, user: publicUser(result.user, result.sessions) });
    return;
  }

  const roleMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
  if (method === "PATCH" && roleMatch) {
    const body = await readJsonBody(req);
    const role = String(body.role || "").trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,24}$/.test(role)) {
      sendJson(res, 400, { ok: false, error: "Invalid role" });
      return;
    }
    const result = await storage.setRole(roleMatch[1], role, Boolean(body.enabled), req);
    if (!result) {
      sendJson(res, 404, { ok: false, error: "User not found" });
      return;
    }
    sendJson(res, 200, { ok: true, user: publicUser(result.user, result.sessions) });
    return;
  }

  const deleteMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (method === "DELETE" && deleteMatch) {
    const deleted = await storage.deleteUser(deleteMatch[1], req);
    if (!deleted) {
      sendJson(res, 404, { ok: false, error: "User not found" });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === "POST" && pathname === "/api/client/login") {
    const body = await readJsonBody(req);
    const login = String(body.login || "").trim();
    const user = await storage.findUserByLogin(login);
    if (!user || !safeEqualHex(user.accessKeyHash, hashSecret(body.key || ""))) {
      sendJson(res, 401, { ok: false, error: "Invalid login or key" });
      return;
    }
    if (!isSubscriptionActive(user)) {
      sendJson(res, 403, { ok: false, error: "Subscription is inactive" });
      return;
    }
    const session = await storage.createSession(user, body, req);
    sendJson(res, 200, {
      ok: true,
      sessionToken: session.sessionToken,
      user: {
        login: session.user.login,
        roles: session.user.roles || [],
        subscriptionExpiresAt: session.user.subscriptionExpiresAt
      }
    });
    return;
  }

  if (method === "POST" && pathname === "/api/client/heartbeat") {
    const body = await readJsonBody(req);
    const result = await storage.heartbeat(body.sessionToken, body);
    if (result.status === "invalid") {
      sendJson(res, 401, { ok: false, error: "Invalid session" });
      return;
    }
    if (result.status === "inactive") {
      sendJson(res, 403, { ok: false, error: "Subscription is inactive" });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      subscriptionExpiresAt: result.user.subscriptionExpiresAt,
      roles: result.user.roles || []
    });
    return;
  }

  if (method === "POST" && pathname === "/api/client/logout") {
    const body = await readJsonBody(req);
    await storage.logout(body.sessionToken);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Endpoint not found" });
}

async function main() {
  const storage = await createStorage();
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
      if (pathname.startsWith("/api/")) {
        await handleApi(req, res, storage);
        return;
      }
      serveStatic(req, res);
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || "Server error" });
    }
  });

  server.listen(PORT, () => {
    console.log(`Storage: ${storage.name}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
    console.log(`Public site: http://localhost:${PORT}/`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
