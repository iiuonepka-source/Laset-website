const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STORE_DIR = process.env.LICENSE_STORE_DIR
    ? path.resolve(process.env.LICENSE_STORE_DIR)
    : path.join(__dirname, '..');
const TXT_PATH = path.join(STORE_DIR, 'site-license-keys.txt');
const JSON_PATH = path.join(STORE_DIR, 'site-license-keys.json');

const PLAN_TO_DAYS = {
    '30d': 30,
    '90d': 90,
    '365d': 365,
    lifetime: null
};

const PLAN_ORDER = {
    '30d': 1,
    '90d': 2,
    '365d': 3,
    lifetime: 4
};

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizePlan(rawPlan) {
    if (!rawPlan) return null;
    const plan = String(rawPlan).trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(PLAN_TO_DAYS, plan) ? plan : null;
}

function normalizeKey(rawKey) {
    if (!rawKey) return '';
    return String(rawKey).trim().toUpperCase();
}

function ensureStoreShape(store) {
    if (!store || typeof store !== 'object') {
        return { keys: {} };
    }
    if (!store.keys || typeof store.keys !== 'object') {
        store.keys = {};
    }
    return store;
}

function ensureStoreDir() {
    if (!fs.existsSync(STORE_DIR)) {
        fs.mkdirSync(STORE_DIR, { recursive: true });
    }
}

function createBaseRecord(key, plan) {
    const normalizedPlan = normalizePlan(plan);
    const safeKey = normalizeKey(key);

    return {
        key: safeKey,
        plan: normalizedPlan,
        durationDays: PLAN_TO_DAYS[normalizedPlan],
        used: false,
        activatedByUserId: null,
        activatedAt: null,
        expiresAt: null,
        hwid: null
    };
}

function parseTxtLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith('#')) {
        return null;
    }

    const parts = trimmed.split('|');
    if (parts.length < 2) {
        return null;
    }

    const plan = normalizePlan(parts[0]);
    const key = normalizeKey(parts.slice(1).join('|'));
    if (!plan || !key) {
        return null;
    }

    return { plan, key };
}

function toTxtLine(record) {
    return `${record.plan} | ${record.key}`;
}

function sortRecordsForTxt(a, b) {
    const orderA = PLAN_ORDER[a.plan] || 999;
    const orderB = PLAN_ORDER[b.plan] || 999;
    if (orderA !== orderB) {
        return orderA - orderB;
    }
    return a.key.localeCompare(b.key);
}

function buildStoreFromTxt() {
    if (!fs.existsSync(TXT_PATH)) {
        return { keys: {} };
    }

    const lines = fs.readFileSync(TXT_PATH, 'utf8').split(/\r?\n/);
    const keys = {};

    for (const line of lines) {
        const parsed = parseTxtLine(line);
        if (!parsed) {
            continue;
        }
        keys[parsed.key] = createBaseRecord(parsed.key, parsed.plan);
    }

    return { keys };
}

function normalizeExistingRecord(key, existing, txtRecord) {
    const result = createBaseRecord(key, txtRecord.plan);
    if (!existing || typeof existing !== 'object') {
        return result;
    }

    const existingPlan = normalizePlan(existing.plan);
    if (existingPlan !== txtRecord.plan) {
        return result;
    }

    result.used = Boolean(existing.used);
    result.activatedByUserId = existing.activatedByUserId != null
        ? Number(existing.activatedByUserId)
        : null;
    result.activatedAt = existing.activatedAt != null
        ? Number(existing.activatedAt)
        : null;
    result.expiresAt = existing.expiresAt != null
        ? Number(existing.expiresAt)
        : null;
    result.hwid = existing.hwid ? String(existing.hwid) : null;

    if (!Number.isFinite(result.activatedByUserId)) {
        result.activatedByUserId = null;
    }
    if (!Number.isFinite(result.activatedAt)) {
        result.activatedAt = null;
    }
    if (!Number.isFinite(result.expiresAt)) {
        result.expiresAt = null;
    }

    if (result.used && result.activatedByUserId === null) {
        result.used = false;
    }

    if (!result.used) {
        result.activatedByUserId = null;
        result.activatedAt = null;
        result.expiresAt = null;
        result.hwid = null;
        return result;
    }

    if (result.plan === 'lifetime') {
        result.expiresAt = null;
    } else if (!result.expiresAt && result.activatedAt) {
        result.expiresAt = result.activatedAt + Number(result.durationDays || 0) * 24 * 60 * 60 * 1000;
    }

    return result;
}

function syncStoreWithTxt(store) {
    const safeStore = ensureStoreShape(store);

    if (!fs.existsSync(TXT_PATH)) {
        return { store: safeStore, changed: false };
    }

    const txtStore = buildStoreFromTxt();
    const txtKeys = txtStore.keys || {};
    const txtKeyList = Object.keys(txtKeys);

    if (txtKeyList.length === 0) {
        // Do not wipe JSON when txt is empty/malformed.
        return { store: safeStore, changed: false };
    }

    const merged = { keys: {} };
    for (const key of txtKeyList) {
        merged.keys[key] = normalizeExistingRecord(key, safeStore.keys[key], txtKeys[key]);
    }

    const changed = JSON.stringify(safeStore.keys) !== JSON.stringify(merged.keys);
    return { store: merged, changed };
}

function writeStore(store) {
    ensureStoreDir();
    const safeStore = ensureStoreShape(store);
    fs.writeFileSync(JSON_PATH, JSON.stringify(safeStore, null, 2), 'utf8');
}

function writeTxtFromStore(store) {
    ensureStoreDir();
    const safeStore = ensureStoreShape(store);
    const records = Object.values(safeStore.keys).sort(sortRecordsForTxt);
    const lines = records.map(toTxtLine);
    const payload = lines.length ? `${lines.join('\n')}\n` : '';
    fs.writeFileSync(TXT_PATH, payload, 'utf8');
}

function ensureStoreFile() {
    ensureStoreDir();
    let store;

    if (!fs.existsSync(JSON_PATH)) {
        store = buildStoreFromTxt();
    } else {
        try {
            store = ensureStoreShape(JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')));
        } catch (error) {
            store = buildStoreFromTxt();
        }
    }

    const synced = syncStoreWithTxt(store);
    if (!fs.existsSync(JSON_PATH) || synced.changed) {
        writeStore(synced.store);
    }
}

function loadStore() {
    ensureStoreFile();
    const parsed = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    const safeStore = ensureStoreShape(parsed);
    const synced = syncStoreWithTxt(safeStore);
    if (synced.changed) {
        writeStore(synced.store);
    }
    return synced.store;
}

function saveStore(store) {
    writeStore(store);
}

function saveStoreAndTxt(store) {
    writeTxtFromStore(store);
    writeStore(store);
}

function randomChunk(size) {
    const bytes = crypto.randomBytes(size);
    let chunk = '';
    for (let i = 0; i < size; i += 1) {
        chunk += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
    }
    return chunk;
}

function makeRandomKey() {
    return `SPKY-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`;
}

function generateUniqueKey(existingSet) {
    for (let i = 0; i < 2000; i += 1) {
        const candidate = makeRandomKey();
        if (!existingSet.has(candidate)) {
            return candidate;
        }
    }
    return null;
}

function findLatestLicenseForUser(store, userId) {
    const targetUserId = Number(userId);
    let latest = null;

    for (const record of Object.values(store.keys)) {
        if (Number(record.activatedByUserId) !== targetUserId) {
            continue;
        }
        if (!latest || Number(record.activatedAt || 0) > Number(latest.activatedAt || 0)) {
            latest = record;
        }
    }

    return latest;
}

function getPlanLabel(plan) {
    switch (plan) {
        case '30d':
            return '30 days';
        case '90d':
            return '90 days';
        case '365d':
            return '365 days';
        case 'lifetime':
            return 'Forever';
        default:
            return 'Unknown';
    }
}

function calculateDaysLeft(record) {
    if (!record) {
        return null;
    }
    if (record.plan === 'lifetime') {
        return null;
    }
    if (!record.expiresAt) {
        return null;
    }

    const msLeft = Number(record.expiresAt) - Date.now();
    return Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
}

function isLicenseExpired(record) {
    if (!record) {
        return true;
    }
    if (record.plan === 'lifetime') {
        return false;
    }
    if (!record.expiresAt) {
        return true;
    }
    return Number(record.expiresAt) <= Date.now();
}

function toLicenseInfo(record) {
    if (!record) {
        return null;
    }

    return {
        key: record.key,
        plan: record.plan,
        planLabel: getPlanLabel(record.plan),
        durationDays: record.durationDays,
        used: Boolean(record.used),
        activatedByUserId: record.activatedByUserId,
        activatedAt: record.activatedAt,
        expiresAt: record.expiresAt,
        hwid: record.hwid,
        daysLeft: calculateDaysLeft(record),
        expired: isLicenseExpired(record)
    };
}

function generateKeys(rawPlan, rawCount) {
    const plan = normalizePlan(rawPlan);
    const count = Number(rawCount);

    if (!plan) {
        return { ok: false, status: 400, reason: 'invalid_plan' };
    }
    if (!Number.isInteger(count) || count <= 0 || count > 5000) {
        return { ok: false, status: 400, reason: 'invalid_count' };
    }

    const store = loadStore();
    const existing = new Set(Object.keys(store.keys));
    const created = [];

    for (let i = 0; i < count; i += 1) {
        const key = generateUniqueKey(existing);
        if (!key) {
            return { ok: false, status: 500, reason: 'key_generation_failed' };
        }

        existing.add(key);
        store.keys[key] = createBaseRecord(key, plan);
        created.push(key);
    }

    saveStoreAndTxt(store);

    return {
        ok: true,
        plan,
        planLabel: getPlanLabel(plan),
        count: created.length,
        keys: created
    };
}

function activateKeyForUser(rawKey, userId) {
    const key = normalizeKey(rawKey);
    if (!key) {
        return { ok: false, status: 400, reason: 'invalid_key' };
    }

    const store = loadStore();
    const record = store.keys[key];
    if (!record) {
        return { ok: false, status: 404, reason: 'key_not_found' };
    }

    const targetUserId = Number(userId);
    if (record.used && Number(record.activatedByUserId) !== targetUserId) {
        return { ok: false, status: 409, reason: 'key_already_used' };
    }

    if (!record.used) {
        const now = Date.now();
        record.used = true;
        record.activatedByUserId = targetUserId;
        record.activatedAt = now;
        record.expiresAt = record.plan === 'lifetime'
            ? null
            : now + Number(record.durationDays || 0) * 24 * 60 * 60 * 1000;
        saveStore(store);
    }

    return { ok: true, record: toLicenseInfo(record) };
}

function getLicenseForUser(userId) {
    const store = loadStore();
    const latest = findLatestLicenseForUser(store, userId);
    return toLicenseInfo(latest);
}

function getLicenseByKey(rawKey) {
    const key = normalizeKey(rawKey);
    if (!key) {
        return null;
    }
    const store = loadStore();
    const record = store.keys[key];
    return toLicenseInfo(record || null);
}

function bindHwidByUserId(userId, rawHwid) {
    const hwid = String(rawHwid || '').trim();
    if (!hwid) {
        return { ok: false, status: 400, reason: 'hwid_required' };
    }

    const store = loadStore();
    const record = findLatestLicenseForUser(store, userId);
    if (!record) {
        return { ok: false, status: 404, reason: 'license_not_found' };
    }

    if (!record.hwid) {
        record.hwid = hwid;
        saveStore(store);
        return { ok: true, bound: true, record: toLicenseInfo(record) };
    }

    if (record.hwid !== hwid) {
        return { ok: false, status: 409, reason: 'hwid_mismatch', record: toLicenseInfo(record) };
    }

    return { ok: true, bound: false, record: toLicenseInfo(record) };
}

function bindHwidByKey(rawKey, rawHwid) {
    const key = normalizeKey(rawKey);
    const hwid = String(rawHwid || '').trim();

    if (!key) {
        return { ok: false, status: 400, reason: 'invalid_key' };
    }
    if (!hwid) {
        return { ok: false, status: 400, reason: 'hwid_required' };
    }

    const store = loadStore();
    const record = store.keys[key];

    if (!record) {
        return { ok: false, status: 404, reason: 'key_not_found' };
    }
    if (!record.used || !record.activatedByUserId) {
        return { ok: false, status: 409, reason: 'key_not_activated' };
    }

    if (!record.hwid) {
        record.hwid = hwid;
        saveStore(store);
        return { ok: true, bound: true, record: toLicenseInfo(record) };
    }

    if (record.hwid !== hwid) {
        return { ok: false, status: 409, reason: 'hwid_mismatch', record: toLicenseInfo(record) };
    }

    return { ok: true, bound: false, record: toLicenseInfo(record) };
}

function getStats() {
    const store = loadStore();
    const items = Object.values(store.keys);
    const byPlan = {
        '30d': 0,
        '90d': 0,
        '365d': 0,
        lifetime: 0
    };
    let used = 0;

    for (const item of items) {
        if (Object.prototype.hasOwnProperty.call(byPlan, item.plan)) {
            byPlan[item.plan] += 1;
        }
        if (item.used) {
            used += 1;
        }
    }

    return {
        total: items.length,
        used,
        available: items.length - used,
        byPlan
    };
}

module.exports = {
    activateKeyForUser,
    bindHwidByKey,
    bindHwidByUserId,
    generateKeys,
    getLicenseByKey,
    getLicenseForUser,
    getStats,
    isLicenseExpired,
    normalizeKey,
    normalizePlan
};

