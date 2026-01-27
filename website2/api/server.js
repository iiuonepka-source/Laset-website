const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// Try PostgreSQL first, fallback to JSON
let usePostgres = false;
let pool = null;

if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    pool.query('SELECT NOW()', (err) => {
        if (err) {
            console.log('⚠️ PostgreSQL unavailable, using JSON file');
            usePostgres = false;
        } else {
            console.log('✅ PostgreSQL connected');
            usePostgres = true;
        }
    });
} else {
    console.log('📁 Using JSON file database');
}

const BCRYPT_ROUNDS = 12;

// Helper: Hash HWID
function hashHwid(hwid) {
    return crypto.createHash('sha256').update(hwid).digest('hex').substring(0, 32);
}

// Register
app.post('/api/register', async (req, res) => {
    const { email, nickname, password } = req.body;
    
    if (!email || !nickname || !password) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    }
    if (nickname.length > 16) {
        return res.status(400).json({ error: 'Никнейм максимум 16 символов' });
    }

    try {
        if (usePostgres) {
            // PostgreSQL version
            const existing = await pool.query(
                'SELECT uid FROM users WHERE email = $1 OR LOWER(nickname) = LOWER($2)',
                [email, nickname]
            );
            
            if (existing.rows.length > 0) {
                const existingUser = await pool.query(
                    'SELECT email, nickname FROM users WHERE email = $1 OR LOWER(nickname) = LOWER($2)',
                    [email, nickname]
                );
                if (existingUser.rows[0].email === email) {
                    return res.status(400).json({ error: 'Email занят' });
                }
                return res.status(400).json({ error: 'Никнейм занят' });
            }

            const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
            const userCount = await pool.query('SELECT COUNT(*) FROM users');
            const isFirstUser = parseInt(userCount.rows[0].count) === 0;

            const result = await pool.query(
                `INSERT INTO users (email, nickname, password_hash, role) 
                 VALUES ($1, $2, $3, $4) 
                 RETURNING uid, nickname, role`,
                [email, nickname, passwordHash, isFirstUser ? 'admin' : 'user']
            );

            const user = result.rows[0];
            res.json({ 
                success: true, 
                uid: user.uid, 
                nickname: user.nickname, 
                role: user.role 
            });
        }
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { uid, password, hwid } = req.body;
    
    if (!uid || !password) {
        return res.status(400).json({ error: 'Введите данные' });
    }

    try {
        if (usePostgres) {
            const result = await pool.query(
                `SELECT * FROM users 
                 WHERE uid = $1 OR email = $2 OR LOWER(nickname) = LOWER($3)`,
                [isNaN(uid) ? -1 : parseInt(uid), uid, uid]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Не найден' });
            }

            const user = result.rows[0];

            if (user.banned) {
                return res.status(403).json({ error: 'Аккаунт заблокирован' });
            }

            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Неверный пароль' });
            }

            if (hwid) {
                const hwidHash = hashHwid(hwid);
                if (user.hwid && user.hwid !== hwidHash) {
                    return res.status(403).json({ error: 'HWID не совпадает' });
                }
                if (!user.hwid) {
                    await pool.query('UPDATE users SET hwid = $1 WHERE uid = $2', [hwidHash, user.uid]);
                }
            }

            await pool.query(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP, sessions = sessions + 1 WHERE uid = $1',
                [user.uid]
            );

            res.json({
                success: true,
                uid: user.uid,
                nickname: user.nickname,
                email: user.email,
                role: user.role,
                sessions: user.sessions + 1,
                playTime: user.play_time || 0,
                createdAt: user.created_at
            });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Verify
app.post('/api/verify', async (req, res) => {
    const { uid, hwid } = req.body;

    try {
        if (usePostgres) {
            const result = await pool.query(
                'SELECT uid, nickname, role, banned, hwid FROM users WHERE uid = $1',
                [parseInt(uid)]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({ valid: false, error: 'Неверный UID' });
            }

            const user = result.rows[0];

            if (user.banned) {
                return res.status(403).json({ valid: false, error: 'Заблокирован' });
            }

            if (hwid && user.hwid) {
                const hwidHash = hashHwid(hwid);
                if (user.hwid !== hwidHash) {
                    return res.status(403).json({ valid: false, error: 'HWID' });
                }
            }

            res.json({ 
                valid: true, 
                nickname: user.nickname, 
                role: user.role 
            });
        }
    } catch (err) {
        console.error('Verify error:', err);
        res.status(500).json({ valid: false, error: 'Ошибка сервера' });
    }
});

// Update profile
app.post('/api/user/update', async (req, res) => {
    const { uid, password, newNickname, newPassword } = req.body;

    try {
        if (usePostgres) {
            const result = await pool.query(
                'SELECT password_hash FROM users WHERE uid = $1',
                [parseInt(uid)]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Не найден' });
            }

            const user = result.rows[0];
            const validPassword = await bcrypt.compare(password, user.password_hash);
            
            if (!validPassword) {
                return res.status(401).json({ error: 'Неверный пароль' });
            }

            if (newNickname) {
                const existing = await pool.query(
                    'SELECT uid FROM users WHERE LOWER(nickname) = LOWER($1) AND uid != $2',
                    [newNickname, parseInt(uid)]
                );
                if (existing.rows.length > 0) {
                    return res.status(400).json({ error: 'Никнейм занят' });
                }
                await pool.query('UPDATE users SET nickname = $1 WHERE uid = $2', [newNickname, parseInt(uid)]);
            }

            if (newPassword && newPassword.length >= 6) {
                const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
                await pool.query('UPDATE users SET password_hash = $1 WHERE uid = $2', [newPasswordHash, parseInt(uid)]);
            }

            const updated = await pool.query('SELECT nickname FROM users WHERE uid = $1', [parseInt(uid)]);
            res.json({ success: true, nickname: updated.rows[0].nickname });
        }
    } catch (err) {
        console.error('Update error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Reset HWID
app.post('/api/reset-hwid', async (req, res) => {
    const { uid, password } = req.body;

    try {
        if (usePostgres) {
            const result = await pool.query(
                'SELECT password_hash FROM users WHERE uid = $1',
                [parseInt(uid)]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Не найден' });
            }

            const validPassword = await bcrypt.compare(password, result.rows[0].password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Неверный пароль' });
            }

            await pool.query('UPDATE users SET hwid = NULL WHERE uid = $1', [parseInt(uid)]);
            res.json({ success: true });
        }
    } catch (err) {
        console.error('Reset HWID error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Get next UID
app.get('/api/next-uid', async (req, res) => {
    try {
        if (usePostgres) {
            const result = await pool.query('SELECT COALESCE(MAX(uid), 0) + 1 as next_uid FROM users');
            res.json({ nextUid: result.rows[0].next_uid });
        } else {
            res.json({ nextUid: 1 });
        }
    } catch (err) {
        console.error('Next UID error:', err);
        res.json({ nextUid: 1 });
    }
});

// Admin: Get all users
app.post('/api/admin/users', async (req, res) => {
    const { uid, password } = req.body;

    try {
        if (usePostgres) {
            const admin = await pool.query(
                'SELECT password_hash, role FROM users WHERE uid = $1',
                [parseInt(uid)]
            );

            if (admin.rows.length === 0 || admin.rows[0].role !== 'admin') {
                return res.status(403).json({ error: 'Нет доступа' });
            }

            const validPassword = await bcrypt.compare(password, admin.rows[0].password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Неверный пароль' });
            }

            const users = await pool.query(
                `SELECT uid, nickname, email, role, banned, sessions, created_at, last_login 
                 FROM users ORDER BY uid ASC`
            );

            res.json({ users: users.rows });
        }
    } catch (err) {
        console.error('Admin users error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Admin: Set role
app.post('/api/admin/set-role', async (req, res) => {
    const { uid, password, targetUid, role } = req.body;

    if (!['user', 'admin', 'youtube', 'tiktok', 'vip', 'beta'].includes(role)) {
        return res.status(400).json({ error: 'Неверная роль' });
    }

    try {
        if (usePostgres) {
            const admin = await pool.query(
                'SELECT password_hash, role FROM users WHERE uid = $1',
                [parseInt(uid)]
            );

            if (admin.rows.length === 0 || admin.rows[0].role !== 'admin') {
                return res.status(403).json({ error: 'Нет доступа' });
            }

            const validPassword = await bcrypt.compare(password, admin.rows[0].password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Неверный пароль' });
            }

            await pool.query('UPDATE users SET role = $1 WHERE uid = $2', [role, parseInt(targetUid)]);
            res.json({ success: true });
        }
    } catch (err) {
        console.error('Set role error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Admin: Ban/Unban
app.post('/api/admin/ban', async (req, res) => {
    const { uid, password, targetUid, banned } = req.body;

    try {
        if (usePostgres) {
            const admin = await pool.query(
                'SELECT password_hash, role FROM users WHERE uid = $1',
                [parseInt(uid)]
            );

            if (admin.rows.length === 0 || admin.rows[0].role !== 'admin') {
                return res.status(403).json({ error: 'Нет доступа' });
            }

            const validPassword = await bcrypt.compare(password, admin.rows[0].password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Неверный пароль' });
            }

            const target = await pool.query('SELECT role FROM users WHERE uid = $1', [parseInt(targetUid)]);
            if (target.rows.length > 0 && target.rows[0].role === 'admin') {
                return res.status(400).json({ error: 'Нельзя банить админа' });
            }

            await pool.query('UPDATE users SET banned = $1 WHERE uid = $2', [banned, parseInt(targetUid)]);
            res.json({ success: true });
        }
    } catch (err) {
        console.error('Ban error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Admin: Delete user
app.post('/api/admin/delete', async (req, res) => {
    const { uid, password, targetUid } = req.body;

    try {
        if (usePostgres) {
            const admin = await pool.query(
                'SELECT password_hash, role FROM users WHERE uid = $1',
                [parseInt(uid)]
            );

            if (admin.rows.length === 0 || admin.rows[0].role !== 'admin') {
                return res.status(403).json({ error: 'Нет доступа' });
            }

            const validPassword = await bcrypt.compare(password, admin.rows[0].password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Неверный пароль' });
            }

            const target = await pool.query('SELECT role FROM users WHERE uid = $1', [parseInt(targetUid)]);
            if (target.rows.length > 0 && target.rows[0].role === 'admin') {
                return res.status(400).json({ error: 'Нельзя удалить админа' });
            }

            await pool.query('DELETE FROM users WHERE uid = $1', [parseInt(targetUid)]);
            res.json({ success: true });
        }
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', database: usePostgres ? 'PostgreSQL' : 'JSON', timestamp: new Date().toISOString() });
});

// Catch-all route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Laset API running on port ${PORT}`);
    console.log(`📊 Database: ${usePostgres ? 'PostgreSQL' : 'JSON file'}`);
});
