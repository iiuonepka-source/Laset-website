const API_URL = window.location.origin + '/api/auth';

async function checkAuthAndRedirect() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        window.location.href = 'auth.html';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/verify`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            window.location.href = 'dashboard.html';
        } else {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'auth.html';
        }
    } catch (error) {
        window.location.href = 'auth.html';
    }
}

async function updateAuthButton() {
    const token = localStorage.getItem('token');
    const authBtnText = document.getElementById('authBtnText');
    
    if (!token || !authBtnText) return;

    try {
        const response = await fetch(`${API_URL}/verify`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            authBtnText.textContent = data.user.username;
            
            // Add admin panel link if user is admin
            if (data.user.role === 'admin') {
                const navLinks = document.querySelector('.nav-links');
                const adminLink = document.createElement('a');
                adminLink.href = 'admin.html';
                adminLink.className = 'admin-link';
                adminLink.innerHTML = '<i data-lucide="shield"></i> Admin';
                adminLink.style.color = '#ff4444';
                adminLink.style.fontWeight = '700';
                navLinks.insertBefore(adminLink, navLinks.querySelector('.login-btn'));
                lucide.createIcons();
            }
        }
    } catch (error) {
        console.error('Auth check failed');
    }
}

// Check auth on page load
window.addEventListener('load', updateAuthButton);
