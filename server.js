const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

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

app.post('/api/register', (req, res) => {
    const { email, nickname, password } = req.body;
    if (!email || !nickname || !password) return res.status(400).json({ error: 'Заполните все поля' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    const db = loadDB();
    if (db.users.find(u => u.email === email)) return res.status(400).json({ error: 'Email занят' });
    if (db.users.find(u => u.nickname.toLowerCase() === nickname.toLowerCase())) return res.status(400).json({ error: 'Никнейм занят' });
    const uid = db.nextUid++;
    const user = { uid, email, nickname, password: crypto.createHash('sha256').update(password).digest('hex'), role: uid === 1 ? 'admin' : 'user', hwid: null, banned: false, createdAt: new Date().toISOString(), lastLogin: null, sessions: 0, playTime: 0 };
    db.users.push(user);
    saveDB(db);
    res.json({ success: true, uid, nickname, role: user.role });
});

app.post('/api/login', (req, res) => {
    const { uid, password } = req.body;
    if (!uid || !password) return res.status(400).json({ error: 'Введите данные' });
    const db = loadDB();
    const uidNum = parseInt(uid);
    const user = db.users.find(u => u.uid === uidNum || u.email === uid || u.nickname === uid);
    if (!user) return res.status(404).json({ error: 'Не найден' });
    if (user.banned) return res.status(403).json({ error: 'Заблокирован' });
    const passHash = crypto.createHash('sha256').update(password).digest('hex');
    if (user.password !== passHash) return res.status(401).json({ error: 'Неверный пароль' });
    user.lastLogin = new Date().toISOString();
    user.sessions++;
    saveDB(db);
    res.json({ success: true, uid: user.uid, nickname: user.nickname, role: user.role });
});

app.post('/api/verify', (req, res) => {
    const { uid } = req.body;
    const db = loadDB();
    const user = db.users.find(u => u.uid === parseInt(uid));
    if (!user) return res.status(401).json({ valid: false });
    if (user.banned) return res.status(403).json({ valid: false });
    res.json({ valid: true, nickname: user.nickname });
});

app.get('/api/next-uid', (req, res) => {
    const db = loadDB();
    res.json({ nextUid: db.nextUid });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Laset API on port ${PORT}`));
