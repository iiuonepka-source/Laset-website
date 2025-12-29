const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (frontend)
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

function saveDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Register
app.post('/api/register', (req, res) => {
    const { email, nickname, password } = req.body;
    if (!email || !nickname || !password) return res.status(400).json({ error: 'Заполните все поля' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    
    const db = loadDB();
    if (db.users.find(u => u.email === email)) return res.status(400).json({ error: 'Email уже зарегистрирован' });
    if (db.users.find(u => u.nickname.toLowerCase() === nickname.toLowerCase())) return res.status(400).json({ error: 'Никнейм занят' });
    
    const uid = db.nextUid++;
    const user = {
        uid, email, nickname,
        password: crypto.createHash('sha256').update(password).digest('hex'),
        hwid: null, createdAt: new Date().toISOString(), lastLogin: null, sessions: 0, playTime: 0
    };
    db.users.push(user);
    saveDB(db);
    res.json({ success: true, uid, nickname });
});

// Login
app.post('/api/login', (req, res) => {
    const { uid, password, hwid } = req.body;
    if (!uid || !password) return res.status(400).json({ error: 'Введите UID и пароль' });
    
    const db = loadDB();
    const uidNum = parseInt(uid);
    const user = db.users.find(u => u.uid === uidNum || u.email === uid || u.nickname === uid);
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    
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
    res.json({ success: true, uid: user.uid, nickname: user.nickname, email: user.email, sessions: user.sessions, playTime: user.playTime || 0, createdAt: user.createdAt });
});

// Get user
app.get('/api/user/:uid', (req, res) => {
    const db = loadDB();
    const user = db.users.find(u => u.uid === parseInt(req.params.uid));
    if (!user) return res.status(404).json({ error: 'Не найден' });
    res.json({ uid: user.uid, nickname: user.nickname, email: user.email, sessions: user.sessions, playTime: user.playTime || 0, createdAt: user.createdAt, lastLogin: user.lastLogin });
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

// Verify (for launcher)
app.post('/api/verify', (req, res) => {
    const { uid, hwid } = req.body;
    const db = loadDB();
    const user = db.users.find(u => u.uid === parseInt(uid));
    if (!user) return res.status(401).json({ valid: false, error: 'Неверный UID' });
    
    if (hwid) {
        const hwidHash = crypto.createHash('sha256').update(hwid).digest('hex').substring(0, 32);
        if (user.hwid && user.hwid !== hwidHash) return res.status(403).json({ valid: false, error: 'HWID не совпадает' });
    }
    res.json({ valid: true, nickname: user.nickname });
});

// Next UID
app.get('/api/next-uid', (req, res) => {
    const db = loadDB();
    res.json({ nextUid: db.nextUid });
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Laset running on port ${PORT}`));
