// Particles
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
document.getElementById('particles').appendChild(canvas);
let particles = [];
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
function createParticles() {
    particles = [];
    for (let i = 0; i < 40; i++) particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, size: Math.random() * 2 + 1, alpha: Math.random() * 0.3 + 0.1 });
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
            const dist = Math.sqrt((p.x - p2.x) ** 2 + (p.y - p2.y) ** 2);
            if (dist < 120) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y); ctx.strokeStyle = `rgba(90, 130, 255, ${0.1 * (1 - dist / 120)})`; ctx.stroke(); }
        });
    });
    requestAnimationFrame(animate);
}
window.addEventListener('resize', () => { resize(); createParticles(); });
resize(); createParticles(); animate();

const API_URL = window.location.origin;
let selectedVersion = '1.21.4';
let currentUser = null;
let allUsers = [];

window.addEventListener('load', () => {
    const saved = localStorage.getItem('laset_user');
    if (saved) { currentUser = JSON.parse(saved); updateAccountBtn(); }
    fetchNextUid();
});

function updateAccountBtn() {
    const btn = document.getElementById('accountBtn');
    if (currentUser) { btn.textContent = currentUser.nickname; btn.classList.add('logged-in'); }
    else { btn.textContent = 'Войти'; btn.classList.remove('logged-in'); }
}

async function fetchNextUid() {
    try { const res = await fetch(`${API_URL}/api/next-uid`); const data = await res.json(); document.getElementById('nextUid').textContent = data.nextUid; } catch { document.getElementById('nextUid').textContent = '?'; }
}

function showAuth(version) { if (currentUser) { startDownload(version); return; } selectedVersion = version; document.getElementById('authModal').classList.add('show'); fetchNextUid(); }
function showAccount() { if (currentUser) showDashboard(); else document.getElementById('authModal').classList.add('show'); }
function closeModal() { document.getElementById('authModal').classList.remove('show'); document.getElementById('loginForm').classList.remove('hidden'); document.getElementById('registerForm').classList.add('hidden'); document.getElementById('authSuccess').classList.add('hidden'); switchAuthTab('login'); }
function switchAuthTab(tab) { document.querySelectorAll('.auth-tab').forEach((t, i) => t.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'register' && i === 1))); document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login'); document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register'); if (tab === 'register') fetchNextUid(); }

// Login
document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const uid = document.getElementById('loginUid').value;
    const pass = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    try {
        const res = await fetch(`${API_URL}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, password: pass }) });
        const data = await res.json();
        if (data.success) {
            currentUser = { uid: data.uid, nickname: data.nickname, email: data.email, role: data.role, sessions: data.sessions, createdAt: data.createdAt };
            localStorage.setItem('laset_user', JSON.stringify(currentUser));
            localStorage.setItem('laset_pass', pass);
            updateAccountBtn();
            showSuccess(data.uid, data.nickname);
        } else errEl.textContent = data.error || 'Ошибка';
    } catch { errEl.textContent = 'Сервер недоступен'; }
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
    try {
        const res = await fetch(`${API_URL}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, nickname, password }) });
        const data = await res.json();
        if (data.success) {
            currentUser = { uid: data.uid, nickname: data.nickname, email, role: data.role, sessions: 0, createdAt: new Date().toISOString() };
            localStorage.setItem('laset_user', JSON.stringify(currentUser));
            localStorage.setItem('laset_pass', password);
            updateAccountBtn();
            showSuccess(data.uid, data.nickname);
        } else errEl.textContent = data.error || 'Ошибка';
    } catch { errEl.textContent = 'Сервер недоступен'; }
});

function showSuccess(uid, nickname) {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('authSuccess').classList.remove('hidden');
    document.getElementById('finalUid').textContent = uid;
    document.getElementById('downloadBtn').onclick = () => startDownload(selectedVersion);
}

function startDownload(version) { closeModal(); window.location.href = version === '1.21.4' ? 'https://github.com/laset/releases/download/launcher/LasetLauncher.exe' : 'https://github.com/laset/releases/download/1.16.5/Laset-1.16.5.jar'; }

// Dashboard
function showDashboard() {
    if (!currentUser) return;
    document.getElementById('dashNickname').textContent = currentUser.nickname;
    document.getElementById('dashUid').textContent = currentUser.uid;
    document.getElementById('dashRole').textContent = currentUser.role;
    document.getElementById('userAvatar').textContent = currentUser.nickname.charAt(0).toUpperCase();
    document.getElementById('dashSessions').textContent = currentUser.sessions || 0;
    document.getElementById('dashCreated').textContent = currentUser.createdAt ? new Date(currentUser.createdAt).toLocaleDateString('ru') : '-';
    document.getElementById('dashMsg').textContent = '';
    document.getElementById('adminSection').classList.toggle('hidden', currentUser.role !== 'admin');
    document.getElementById('dashboardModal').classList.add('show');
}
function closeDashboard() { document.getElementById('dashboardModal').classList.remove('show'); }
function logout() { currentUser = null; localStorage.removeItem('laset_user'); localStorage.removeItem('laset_pass'); updateAccountBtn(); closeDashboard(); }
function showDashMsg(msg, isError) { const el = document.getElementById('dashMsg'); el.textContent = msg; el.className = 'dash-msg ' + (isError ? 'error' : 'success'); setTimeout(() => el.textContent = '', 3000); }

async function updateNickname() {
    const newNick = document.getElementById('newNickname').value.trim();
    const pass = localStorage.getItem('laset_pass');
    if (!newNick) return showDashMsg('Введите ник', true);
    try {
        const res = await fetch(`${API_URL}/api/user/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: currentUser.uid, password: pass, newNickname: newNick }) });
        const data = await res.json();
        if (data.success) { currentUser.nickname = data.nickname; localStorage.setItem('laset_user', JSON.stringify(currentUser)); document.getElementById('dashNickname').textContent = data.nickname; document.getElementById('userAvatar').textContent = data.nickname.charAt(0).toUpperCase(); updateAccountBtn(); showDashMsg('Сохранено!', false); document.getElementById('newNickname').value = ''; }
        else showDashMsg(data.error, true);
    } catch { showDashMsg('Ошибка', true); }
}

async function updatePassword() {
    const currentPass = document.getElementById('currentPass').value;
    const newPass = document.getElementById('newPass').value;
    if (!currentPass || !newPass) return showDashMsg('Заполните поля', true);
    if (newPass.length < 6) return showDashMsg('Минимум 6 символов', true);
    try {
        const res = await fetch(`${API_URL}/api/user/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: currentUser.uid, password: currentPass, newPassword: newPass }) });
        const data = await res.json();
        if (data.success) { localStorage.setItem('laset_pass', newPass); showDashMsg('Пароль изменён!', false); document.getElementById('currentPass').value = ''; document.getElementById('newPass').value = ''; }
        else showDashMsg(data.error, true);
    } catch { showDashMsg('Ошибка', true); }
}

async function resetHwid() {
    if (!confirm('Сбросить HWID?')) return;
    try {
        const res = await fetch(`${API_URL}/api/reset-hwid`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: currentUser.uid, password: localStorage.getItem('laset_pass') }) });
        const data = await res.json();
        showDashMsg(data.success ? 'HWID сброшен!' : data.error, !data.success);
    } catch { showDashMsg('Ошибка', true); }
}

// Admin Panel
async function showAdminPanel() {
    closeDashboard();
    document.getElementById('adminModal').classList.add('show');
    await loadUsers();
}
function closeAdmin() { document.getElementById('adminModal').classList.remove('show'); }

async function loadUsers() {
    try {
        const res = await fetch(`${API_URL}/api/admin/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: currentUser.uid, password: localStorage.getItem('laset_pass') }) });
        const data = await res.json();
        if (data.users) { allUsers = data.users; renderUsers(allUsers); renderAdminStats(allUsers); }
    } catch { console.error('Failed to load users'); }
}

function renderAdminStats(users) {
    const total = users.length;
    const admins = users.filter(u => u.role === 'admin').length;
    const banned = users.filter(u => u.banned).length;
    document.getElementById('adminStats').innerHTML = `
        <div class="dash-stat"><span class="dash-val">${total}</span><span class="dash-lbl">Всего</span></div>
        <div class="dash-stat"><span class="dash-val">${admins}</span><span class="dash-lbl">Админов</span></div>
        <div class="dash-stat"><span class="dash-val">${banned}</span><span class="dash-lbl">Забанено</span></div>
    `;
}

function renderUsers(users) {
    const container = document.getElementById('adminUsers');
    container.innerHTML = users.map(u => `
        <div class="admin-user ${u.banned ? 'banned' : ''}">
            <div class="admin-user-info">
                <h4>${u.nickname} <span class="role-badge ${u.role}">${u.role}</span></h4>
                <span>UID: ${u.uid} • ${u.email} ${u.banned ? '• 🚫 BANNED' : ''}</span>
            </div>
            <div class="admin-user-actions">
                <select onchange="setRole(${u.uid}, this.value); this.value='';" style="padding:6px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--white);margin-right:8px">
                    <option value="">Роль...</option>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="youtube">YouTube</option>
                    <option value="tiktok">TikTok</option>
                    <option value="vip">VIP</option>
                    <option value="beta">Beta</option>
                </select>
                ${u.role !== 'admin' ? (u.banned ? `<button class="unban-btn" onclick="banUser(${u.uid}, false)">Разбан</button>` : `<button class="ban-btn" onclick="banUser(${u.uid}, true)">Бан</button>`) : ''}
                ${u.role !== 'admin' ? `<button class="del-btn" onclick="deleteUser(${u.uid})">✕</button>` : ''}
            </div>
        </div>
    `).join('');
}

function filterUsers() {
    const q = document.getElementById('adminSearch').value.toLowerCase();
    const filtered = allUsers.filter(u => u.nickname.toLowerCase().includes(q) || u.uid.toString().includes(q) || u.email.toLowerCase().includes(q));
    renderUsers(filtered);
}

async function setRole(targetUid, role) {
    try {
        const res = await fetch(`${API_URL}/api/admin/set-role`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: currentUser.uid, password: localStorage.getItem('laset_pass'), targetUid, role }) });
        if ((await res.json()).success) loadUsers();
    } catch {}
}

async function banUser(targetUid, banned) {
    try {
        const res = await fetch(`${API_URL}/api/admin/ban`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: currentUser.uid, password: localStorage.getItem('laset_pass'), targetUid, banned }) });
        if ((await res.json()).success) loadUsers();
    } catch {}
}

async function deleteUser(targetUid) {
    if (!confirm('Удалить юзера?')) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: currentUser.uid, password: localStorage.getItem('laset_pass'), targetUid }) });
        if ((await res.json()).success) loadUsers();
    } catch {}
}

// Modal handlers
document.getElementById('authModal').addEventListener('click', e => { if (e.target.id === 'authModal') closeModal(); });
document.getElementById('dashboardModal').addEventListener('click', e => { if (e.target.id === 'dashboardModal') closeDashboard(); });
document.getElementById('adminModal').addEventListener('click', e => { if (e.target.id === 'adminModal') closeAdmin(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeDashboard(); closeAdmin(); } });
