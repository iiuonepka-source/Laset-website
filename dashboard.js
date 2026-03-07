const API_URL = window.location.origin + '/api/auth';

function isSubscriptionActive(user) {
    if (!user || !user.subscription_type || user.subscription_type === 'none') {
        return false;
    }

    if (user.subscription_type === 'lifetime') {
        return true;
    }

    if (!user.subscription_expires) {
        return false;
    }

    return new Date(user.subscription_expires) > new Date();
}

function updateSubscriptionUi(user) {
    const badge = document.getElementById('statusBadge');
    const subType = document.getElementById('subType');
    const subExpires = document.getElementById('subExpires');
    const licenseLabel = document.getElementById('licenseLabel');
    const downloadBtn = document.getElementById('downloadBtn');

    const active = isSubscriptionActive(user);

    badge.classList.remove('active', 'expired');
    if (active) {
        badge.textContent = 'Active';
        badge.classList.add('active');
    } else if (user.subscription_type && user.subscription_type !== 'none') {
        badge.textContent = 'Expired';
        badge.classList.add('expired');
    } else {
        badge.textContent = 'No Active Subscription';
    }

    const planLabel = user.license_plan_label || user.subscription_type || '-';
    subType.textContent = `Plan: ${planLabel}`;

    if (user.subscription_type === 'lifetime') {
        subExpires.textContent = 'Expires: Never';
    } else if (user.subscription_expires) {
        const expiresDate = new Date(user.subscription_expires);
        subExpires.textContent = `Expires: ${expiresDate.toLocaleDateString()}`;
    } else {
        subExpires.textContent = 'Expires: -';
    }

    licenseLabel.textContent = user.license_text || 'License - none';

    if (active) {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = '<i data-lucide="download"></i> Download Client';
        downloadBtn.onclick = downloadClient;
    } else {
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<i data-lucide="lock"></i> Requires Active Subscription';
        downloadBtn.onclick = null;
    }
}

function updateLicenseUi(user) {
    const keyValue = user.license_key || 'No active license';
    const hwidValue = user.license_hwid || user.hwid || 'Not bound';

    document.getElementById('licenseKey').textContent = keyValue;
    document.getElementById('licenseHwid').textContent = hwidValue;

    const copyBtn = document.getElementById('copyBtn');
    copyBtn.disabled = !user.license_key;
}

function showKeyHint(message, isError = false) {
    const hint = document.getElementById('keyHint');
    hint.textContent = message;
    hint.classList.toggle('error', isError);
    hint.classList.toggle('success', !isError);
}

async function loadDashboard() {
    const token = localStorage.getItem('token');

    if (!token) {
        window.location.href = 'auth.html';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/verify`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Invalid token');
        }

        const data = await response.json();
        const user = data.user;

        document.getElementById('username').textContent = user.username;
        document.getElementById('dashUsername').textContent = user.username;
        document.getElementById('dashEmail').textContent = user.email;
        document.getElementById('dashCreated').textContent = new Date(user.created_at).toLocaleDateString();

        if (user.role === 'admin') {
            const adminLink = document.getElementById('adminLink');
            if (adminLink) {
                adminLink.style.display = 'inline-flex';
            }
        }

        updateSubscriptionUi(user);
        updateLicenseUi(user);
        lucide.createIcons();
    } catch (error) {
        console.error('Dashboard load error:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'auth.html';
    }
}

async function activateLicenseKey() {
    const token = localStorage.getItem('token');
    const input = document.getElementById('licenseInput');
    const button = document.getElementById('activateKeyBtn');

    if (!token) {
        window.location.href = 'auth.html';
        return;
    }

    const licenseKey = (input.value || '').trim();
    if (!licenseKey) {
        showKeyHint('Enter a license key first.', true);
        return;
    }

    button.disabled = true;
    button.innerHTML = '<i data-lucide="loader"></i> Activating...';
    lucide.createIcons();

    try {
        const response = await fetch(`${API_URL}/license/activate`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ licenseKey })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            showKeyHint(data.error || 'Failed to activate key.', true);
            return;
        }

        input.value = '';
        showKeyHint(data.message || 'License activated successfully.', false);
        await loadDashboard();
    } catch (error) {
        console.error('Activate key error:', error);
        showKeyHint('Server error during activation.', true);
    } finally {
        button.disabled = false;
        button.innerHTML = '<i data-lucide="shield-check"></i> Activate';
        lucide.createIcons();
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'language-select.html';
}

function downloadClient() {
    alert('Download link will be provided here. Contact support for the latest version.');
}

function copyLicenseKey() {
    const licenseKey = document.getElementById('licenseKey').textContent;
    if (!licenseKey || licenseKey === 'No active license') {
        return;
    }

    navigator.clipboard.writeText(licenseKey).then(() => {
        const copyBtn = document.getElementById('copyBtn');
        copyBtn.innerHTML = '<i data-lucide="check"></i> Copied!';
        setTimeout(() => {
            copyBtn.innerHTML = '<i data-lucide="copy"></i> Copy Key';
            lucide.createIcons();
        }, 1500);
    });
}

window.addEventListener('load', async () => {
    await loadDashboard();

    const activateBtn = document.getElementById('activateKeyBtn');
    const keyInput = document.getElementById('licenseInput');

    if (activateBtn) {
        activateBtn.addEventListener('click', activateLicenseKey);
    }

    if (keyInput) {
        keyInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                activateLicenseKey();
            }
        });
    }

    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyLicenseKey);
    }
});