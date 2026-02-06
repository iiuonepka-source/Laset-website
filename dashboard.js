const API_URL = window.location.origin + '/api/auth';

async function loadDashboard() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        window.location.href = 'auth.html';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/verify`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Invalid token');
        }

        const data = await response.json();
        const user = data.user;

        // Update user info
        document.getElementById('username').textContent = user.username;
        document.getElementById('dashUsername').textContent = user.username;
        document.getElementById('dashEmail').textContent = user.email;
        
        const createdDate = new Date(user.created_at).toLocaleDateString();
        document.getElementById('dashCreated').textContent = createdDate;
        
        // Show admin panel link if admin
        if (user.role === 'admin') {
            const adminLink = document.getElementById('adminLink');
            if (adminLink) {
                adminLink.style.display = 'inline-flex';
            }
        }

        // Update subscription info
        if (user.subscription_type && user.subscription_type !== 'none') {
            const expiresDate = new Date(user.subscription_expires);
            const isActive = expiresDate > new Date();

            if (isActive) {
                document.getElementById('statusBadge').textContent = 'Active';
                document.getElementById('statusBadge').classList.add('active');
                document.getElementById('subType').textContent = `Plan: ${user.subscription_type}`;
                document.getElementById('subExpires').textContent = `Expires: ${expiresDate.toLocaleDateString()}`;
                
                // Enable download button
                const downloadBtn = document.getElementById('downloadBtn');
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = '<i data-lucide="download"></i> Download Client';
                downloadBtn.onclick = downloadClient;

                // Show license key
                document.getElementById('licenseKey').textContent = user.license_key || 'Generating...';
                const copyBtn = document.getElementById('copyBtn');
                copyBtn.disabled = false;
                copyBtn.onclick = copyLicenseKey;
            } else {
                document.getElementById('statusBadge').textContent = 'Expired';
                document.getElementById('statusBadge').classList.add('expired');
                document.getElementById('subType').textContent = `Previous Plan: ${user.subscription_type}`;
                document.getElementById('subExpires').textContent = `Expired: ${expiresDate.toLocaleDateString()}`;
            }
        }

        lucide.createIcons();
    } catch (error) {
        console.error('Dashboard load error:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'auth.html';
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
    navigator.clipboard.writeText(licenseKey).then(() => {
        const copyBtn = document.getElementById('copyBtn');
        copyBtn.innerHTML = '<i data-lucide="check"></i> Copied!';
        setTimeout(() => {
            copyBtn.innerHTML = '<i data-lucide="copy"></i> Copy Key';
            lucide.createIcons();
        }, 2000);
    });
}

window.addEventListener('load', loadDashboard);
