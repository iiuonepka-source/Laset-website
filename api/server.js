const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

const DB_FILE = path.join(__dirname, 'users.json');

function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], nextUid: 1 }));
    }
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.nextUid) db.nextUid = db.users.length + 1;
    return db;
}

function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

// Register
app.post('/api/register', (req, res) => {
    const { email, nickname, password } = req.body;
    if (!email || !nickname || !password) return res.status(400).json({ error: 'Заполните все поля' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    
    const db = loadDB();
    if (db.users.find(u => u.email === email)) return res.status(400).json({ error: 'Email занят' });
    if (db.users.find(u => u.nickname.toLowerCase() === nickname.toLowerCase())) return res.status(400).json({ error: 'Никнейм занят' });
    
    const uid = db.nextUid++;
    const user = {
        uid, email, nickname,
        password: crypto.createHash('sha256').update(password).digest('hex'),
        role: uid === 1 ? 'admin' : 'user', // Первый юзер - админ
        hwid: null, banned: false, createdAt: new Date().toISOString(), lastLogin: null, sessions: 0, playTime: 0
    };
    db.users.push(user);
    saveDB(db);
    res.json({ success: true, uid, nickname, role: user.role });
});

// Login
app.post('/api/login', (req, res) => {
    const { uid, password, hwid } = req.body;
    if (!uid || !password) return res.status(400).json({ error: 'Введите данные' });
    
    const db = loadDB();
    const uidNum = parseInt(uid);
    const user = db.users.find(u => u.uid === uidNum || u.email === uid || u.nickname === uid);
    if (!user) return res.status(401).json({ error: 'Не найден' });
    if (user.banned) return res.status(403).json({ error: 'Аккаунт заблокирован' });
    
    const passHash = crypto.createHash('sha256').update(password).digest('hex');
    if (user.password !== passHash) return res.status(401).json({ error: 'Неверный пароль' });
    
    if (hwid) {
        const hwidHash = crypto.createHash('sha256').update(hwid).digest('hex').substring(0, 32);
        if (user.hwid && user.hwid !== hwidHash) return res.status(403).json({ error: 'HWID не совпадает' });
        if (!user.hwid) user.hwid = hwidHash;
    }
    
    user.lastLogin = new Date().toISOString();
    user.sessions++;
    saveDB(db);
    res.json({ success: true, uid: user.uid, nickname: user.nickname, email: user.email, role: user.role, sessions: user.sessions, playTime: user.playTime || 0, createdAt: user.createdAt });
});

// Get all users (admin only)
app.post('/api/admin/users', (req, res) => {
    const { uid, password } = req.body;
    const db = loadDB();
    const admin = db.users.find(u => u.uid === parseInt(uid));
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
    
    const passHash = crypto.createHash('sha256').update(password).digest('hex');
    if (admin.password !== passHash) return res.status(401).json({ error: 'Неверный пароль' });
    
    const users = db.users.map(u => ({ uid: u.uid, nickname: u.nickname, email: u.email, role: u.role, banned: u.banned, sessions: u.sessions, createdAt: u.createdAt, lastLogin: u.lastLogin }));
    res.json({ users });
});

// Set role (admin only)
app.post('/api/admin/set-role', (req, res) => {
    const { uid, password, targetUid, role } = req.body;
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Неверная роль' });
    
    const db = loadDB();
    const admin = db.users.find(u => u.uid === parseInt(uid));
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
    
    const passHash = crypto.createHash('sha256').update(password).digest('hex');
    if (admin.password !== passHash) return res.status(401).json({ error: 'Неверный пароль' });
    
    const target = db.users.find(u => u.uid === parseInt(targetUid));
    if (!target) return res.status(404).json({ error: 'Юзер не найден' });
    
    target.role = role;
    saveDB(db);
    res.json({ success: true });
});

// Ban/unban (admin only)
app.post('/api/admin/ban', (req, res) => {
    const { uid, password, targetUid, banned } = req.body;
    const db = loadDB();
    const admin = db.users.find(u => u.uid === parseInt(uid));
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
    
    const passHash = crypto.createHash('sha256').update(password).digest('hex');
    if (admin.password !== passHash) return res.status(401).json({ error: 'Неверный пароль' });
    
    const target = db.users.find(u => u.uid === parseInt(targetUid));
    if (!target) return res.status(404).json({ error: 'Юзер не найден' });
    if (target.role === 'admin') return res.status(400).json({ error: 'Нельзя банить админа' });
    
    target.banned = banned;
    saveDB(db);
    res.json({ success: true });
});

// Delete user (admin only)
app.post('/api/admin/delete', (req, res) => {
    const { uid, password, targetUid } = req.body;
    const db = loadDB();
    const admin = db.users.find(u => u.uid === parseInt(uid));
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
    
    const passHash = crypto.createHash('sha256').update(password).digest('hex');
    if (admin.password !== passHash) return res.status(401).json({ error: 'Неверный пароль' });
    
    const idx = db.users.findIndex(u => u.uid === parseInt(targetUid));
    if (idx === -1) return res.status(404).json({ error: 'Не найден' });
    if (db.users[idx].role === 'admin') return res.status(400).json({ error: 'Нельзя удалить админа' });
    
    db.users.splice(idx, 1);
    saveDB(db);
    res.json({ success: true });
});

// Update profile
app.post('/api/user/update', (req, res) => {
    const { uid, password, newNickname, newPassword } = req.body;
    const db = loadDB();
    const user = db.users.find(u => u.uid === parseInt(uid));
    if (!user) return res.status(404).json({ error: 'Не найден' });
    
    const passHash = crypto.createHash('sha256').update(password).digest('hex');
    if (user.password !== passHash) return res.status(401).json({ error: 'Неверный пароль' });
    
    if (newNickname && newNickname !== user.nickname) {
        if (db.users.find(u => u.nickname.toLowerCase() === newNickname.toLowerCase() && u.uid !== parseInt(uid))) {
            return res.status(400).json({ error: 'Никнейм занят' });
        }
        user.nickname = newNickname;
    }
    if (newPassword && newPassword.length >= 6) {
        user.password = crypto.createHash('sha256').update(newPassword).digest('hex');
    }
    saveDB(db);
    res.json({ success: true, nickname: user.nickname });
});

// Reset HWID
app.post('/api/reset-hwid', (req, res) => {
    const { uid, password } = req.body;
    const db = loadDB();
    const user = db.users.find(u => u.uid === parseInt(uid));
    if (!user) return res.status(404).json({ error: 'Не найден' });
    
    const passHash = crypto.createHash('sha256').update(password).digest('hex');
    if (user.password !== passHash) return res.status(401).json({ error: 'Неверный пароль' });
    
    user.hwid = null;
    saveDB(db);
    res.json({ success: true });
});

// Verify
app.post('/api/verify', (req, res) => {
    const { uid, hwid } = req.body;
    const db = loadDB();
    const user = db.users.find(u => u.uid === parseInt(uid));
    if (!user) return res.status(401).json({ valid: false, error: 'Неверный UID' });
    if (user.banned) return res.status(403).json({ valid: false, error: 'Заблокирован' });
    
    if (hwid) {
        const hwidHash = crypto.createHash('sha256').update(hwid).digest('hex').substring(0, 32);
        if (user.hwid && user.hwid !== hwidHash) return res.status(403).json({ valid: false, error: 'HWID' });
    }
    res.json({ valid: true, nickname: user.nickname, role: user.role });
});

app.get('/api/next-uid', (req, res) => {
    const db = loadDB();
    res.json({ nextUid: db.nextUid });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Laset API on port ${PORT}`));
