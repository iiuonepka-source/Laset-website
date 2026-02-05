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
        }
    } catch (error) {
        console.error('Auth check failed');
    }
}

// Check auth on page load
window.addEventListener('load', updateAuthButton);
