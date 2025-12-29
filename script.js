// Particles
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
document.getElementById('particles').appendChild(canvas);

let particles = [];
const particleCount = 50;

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
function createParticles() {
    particles = [];
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * canvas.width, y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
            size: Math.random() * 2 + 1, alpha: Math.random() * 0.3 + 0.1
        });
    }
}
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(90, 130, 255, ${p.alpha})`; ctx.fill();
        particles.slice(i + 1).forEach(p2 => {
            const dx = p.x - p2.x, dy = p.y - p2.y, dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 120) {
                ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = `rgba(90, 130, 255, ${0.1 * (1 - dist / 120)})`; ctx.stroke();
            }
        });
    });
    requestAnimationFrame(animate);
}
window.addEventListener('resize', () => { resize(); createParticles(); });
resize(); createParticles(); animate();

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
        if (a.getAttribute('href') === '#') return;
        e.preventDefault();
        const target = document.querySelector(a.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
});

// API - автоматически определяет URL
const API_URL = window.location.origin;
let selectedVersion = '1.21.4';
let currentUser = null;

// Check login on load
window.addEventListener('load', () => {
    const saved = localStorage.getItem('laset_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        updateAccountBtn();
    }
    fetchNextUid();
});

function updateAccountBtn() {
    const btn = document.getElementById('accountBtn');
    if (currentUser) {
        btn.textContent = currentUser.nickname;
        btn.classList.add('logged-in');
    } else {
        btn.textContent = 'Войти';
        btn.classList.remove('logged-in');
    }
}

async function fetchNextUid() {
    try {
        const res = await fetch(`${API_URL}/api/next-uid`);
        const data = await res.json();
        document.getElementById('nextUid').textContent = data.nextUid;
    } catch { document.getElementById('nextUid').textContent = '?'; }
}

function showAuth(version) {
    if (currentUser) { startDownload(version); return; }
    selectedVersion = version;
    document.getElementById('authModal').classList.add('show');
    fetchNextUid();
}

function showAccount() {
    if (currentUser) { showDashboard(); }
    else { document.getElementById('authModal').classList.add('show'); }
}

function closeModal() {
    document.getElementById('authModal').classList.remove('show');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('authSuccess').classList.add('hidden');
    document.getElementById('loginError').textContent = '';
    document.getElementById('regError').textContent = '';
    switchAuthTab('login');
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach((t, i) => {
        t.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'register' && i === 1));
    });
    document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
    if (tab === 'register') fetchNextUid();
}

// Login
document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const uid = document.getElementById('loginUid').value;
    const pass = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    
    try {
        const res = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, password: pass })
        });
        const data = await res.json();
        
        if (data.success) {
            currentUser = { uid: data.uid, nickname: data.nickname, email: data.email, sessions: data.sessions, playTime: data.playTime, createdAt: data.createdAt };
            localStorage.setItem('laset_user', JSON.stringify(currentUser));
            localStorage.setItem('laset_pass', pass);
            updateAccountBtn();
            showSuccess(data.uid, data.nickname);
        } else {
            errEl.textContent = data.error || 'Ошибка входа';
        }
    } catch (err) {
        errEl.textContent = 'Сервер недоступен';
    }
});

// Register
document.getElementById('registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('regEmail').value;
    const nickname = document.getElementById('regNick').value;
    const password = document.getElementById('regPass').value;
    const errEl = document.getElementById('regError');
    errEl.textContent = '';
    
    if (password.length < 6) { errEl.textContent = 'Пароль минимум 6 символов'; return; }
    if (!/^[a-zA-Z0-9_]+$/.test(nickname)) { errEl.textContent = 'Никнейм: только буквы, цифры, _'; return; }
    
    try {
        const res = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, nickname, password })
        });
        const data = await res.json();
        
        if (data.success) {
            currentUser = { uid: data.uid, nickname: data.nickname, email, sessions: 0, playTime: 0, createdAt: new Date().toISOString() };
            localStorage.setItem('laset_user', JSON.stringify(currentUser));
            localStorage.setItem('laset_pass', password);
            updateAccountBtn();
            showSuccess(data.uid, data.nickname);
        } else {
            errEl.textContent = data.error || 'Ошибка регистрации';
        }
    } catch (err) {
        errEl.textContent = 'Сервер недоступен';
    }
});

function showSuccess(uid, nickname) {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('authSuccess').classList.remove('hidden');
    document.getElementById('finalUid').textContent = uid;
    document.getElementById('downloadVersion').textContent = selectedVersion;
    
    const btn = document.getElementById('downloadBtn');
    btn.onclick = () => startDownload(selectedVersion);
}

function startDownload(version) {
    closeModal();
    if (version === '1.21.4') {
        window.location.href = 'https://github.com/laset/releases/download/launcher/LasetLauncher.exe';
    } else {
        window.location.href = 'https://github.com/laset/releases/download/1.16.5/Laset-1.16.5.jar';
    }
}

// Dashboard
function showDashboard() {
    if (!currentUser) return;
    document.getElementById('dashNickname').textContent = currentUser.nickname;
    document.getElementById('dashUid').textContent = currentUser.uid;
    document.getElementById('userAvatar').textContent = currentUser.nickname.charAt(0).toUpperCase();
    document.getElementById('dashSessions').textContent = currentUser.sessions || 0;
    document.getElementById('dashPlayTime').textContent = Math.floor((currentUser.playTime || 0) / 60) + 'ч';
    document.getElementById('dashCreated').textContent = currentUser.createdAt ? new Date(currentUser.createdAt).toLocaleDateString('ru') : '-';
    document.getElementById('newNickname').value = '';
    document.getElementById('currentPass').value = '';
    document.getElementById('newPass').value = '';
    document.getElementById('dashMsg').textContent = '';
    document.getElementById('dashboardModal').classList.add('show');
}

function closeDashboard() {
    document.getElementById('dashboardModal').classList.remove('show');
}

function logout() {
    currentUser = null;
    localStorage.removeItem('laset_user');
    localStorage.removeItem('laset_pass');
    updateAccountBtn();
    closeDashboard();
}

function showDashMsg(msg, isError) {
    const el = document.getElementById('dashMsg');
    el.textContent = msg;
    el.className = 'dash-msg ' + (isError ? 'error' : 'success');
    setTimeout(() => el.textContent = '', 3000);
}

async function updateNickname() {
    const newNick = document.getElementById('newNickname').value.trim();
    const pass = localStorage.getItem('laset_pass');
    if (!newNick) { showDashMsg('Введите никнейм', true); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(newNick)) { showDashMsg('Только буквы, цифры, _', true); return; }
    
    try {
        const res = await fetch(`${API_URL}/api/user/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: currentUser.uid, password: pass, newNickname: newNick })
        });
        const data = await res.json();
        if (data.success) {
            currentUser.nickname = data.nickname;
            localStorage.setItem('laset_user', JSON.stringify(currentUser));
            document.getElementById('dashNickname').textContent = data.nickname;
            document.getElementById('userAvatar').textContent = data.nickname.charAt(0).toUpperCase();
            updateAccountBtn();
            showDashMsg('Никнейм изменён!', false);
            document.getElementById('newNickname').value = '';
        } else {
            showDashMsg(data.error, true);
        }
    } catch { showDashMsg('Ошибка сервера', true); }
}

async function updatePassword() {
    const currentPass = document.getElementById('currentPass').value;
    const newPass = document.getElementById('newPass').value;
    if (!currentPass || !newPass) { showDashMsg('Заполните оба поля', true); return; }
    if (newPass.length < 6) { showDashMsg('Новый пароль минимум 6 символов', true); return; }
    
    try {
        const res = await fetch(`${API_URL}/api/user/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: currentUser.uid, password: currentPass, newPassword: newPass })
        });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('laset_pass', newPass);
            showDashMsg('Пароль изменён!', false);
            document.getElementById('currentPass').value = '';
            document.getElementById('newPass').value = '';
        } else {
            showDashMsg(data.error, true);
        }
    } catch { showDashMsg('Ошибка сервера', true); }
}

async function resetHwid() {
    const pass = localStorage.getItem('laset_pass');
    if (!confirm('Сбросить привязку HWID?')) return;
    
    try {
        const res = await fetch(`${API_URL}/api/reset-hwid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: currentUser.uid, password: pass })
        });
        const data = await res.json();
        if (data.success) {
            showDashMsg('HWID сброшен!', false);
        } else {
            showDashMsg(data.error, true);
        }
    } catch { showDashMsg('Ошибка сервера', true); }
}

// Modal close handlers
document.getElementById('authModal').addEventListener('click', e => { if (e.target.id === 'authModal') closeModal(); });
document.getElementById('dashboardModal').addEventListener('click', e => { if (e.target.id === 'dashboardModal') closeDashboard(); });
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeDashboard(); }
});
