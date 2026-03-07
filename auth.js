const API_URL = window.location.origin + '/api/auth';

let mathAnswer = 0;
let formInteractions = {
    mouseMovements: 0,
    keystrokes: 0,
    focusChanges: 0,
    startTime: 0,
    fieldsFilled: new Set()
};

function generateMathCaptcha() {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    mathAnswer = num1 + num2;
    document.getElementById('mathQuestion').textContent = `${num1} + ${num2} = ?`;
}

// Track user behavior to detect bots
function initBehaviorTracking() {
    formInteractions.startTime = Date.now();
    
    // Track mouse movements
    document.addEventListener('mousemove', () => {
        formInteractions.mouseMovements++;
    }, { once: false, passive: true });
    
    // Track keystrokes
    const inputs = document.querySelectorAll('#registerForm input[type="text"], #registerForm input[type="email"], #registerForm input[type="password"]');
    inputs.forEach(input => {
        input.addEventListener('keydown', () => {
            formInteractions.keystrokes++;
        });
        
        input.addEventListener('focus', () => {
            formInteractions.focusChanges++;
        });
        
        input.addEventListener('input', () => {
            formInteractions.fieldsFilled.add(input.id);
        });
    });
}

function calculateBotScore() {
    const timeTaken = Date.now() - formInteractions.startTime;
    let score = 0;
    
    // Too fast = bot (less than 5 seconds)
    if (timeTaken < 5000) score += 50;
    else if (timeTaken < 10000) score += 20;
    
    // No mouse movement = bot
    if (formInteractions.mouseMovements < 5) score += 30;
    else if (formInteractions.mouseMovements < 20) score += 10;
    
    // Too few keystrokes = bot (copy-paste)
    if (formInteractions.keystrokes < 10) score += 20;
    
    // No focus changes = bot
    if (formInteractions.focusChanges < 2) score += 20;
    
    // Fields filled too uniformly = bot
    if (formInteractions.fieldsFilled.size < 3) score += 15;
    
    return score;
}

function switchTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabs = document.querySelectorAll('.auth-tab');
    
    tabs.forEach(t => t.classList.remove('active'));
    
    if (tab === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        tabs[0].classList.add('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        tabs[1].classList.add('active');
        generateMathCaptcha();
        initBehaviorTracking();
    }
    
    lucide.createIcons();
}

// Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // Check if there's a redirect URL
            const redirectUrl = sessionStorage.getItem('redirectAfterLogin');
            sessionStorage.removeItem('redirectAfterLogin');
            
            window.location.href = redirectUrl || 'language-select.html';
        } else {
            errorDiv.textContent = data.error || 'Login failed';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'Connection error. Please try again.';
        errorDiv.style.display = 'block';
    }
});

// Register
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const honeypot = document.getElementById('website').value;
    const captchaAnswer = parseInt(document.getElementById('captchaAnswer').value);
    const errorDiv = document.getElementById('registerError');
    
    // Honeypot check (bots will fill this field)
    if (honeypot) {
        errorDiv.textContent = 'Bot detected. Registration blocked.';
        errorDiv.style.display = 'block';
        return;
    }
    
    // Math captcha check
    if (captchaAnswer !== mathAnswer) {
        errorDiv.textContent = 'Incorrect answer to security question';
        errorDiv.style.display = 'block';
        generateMathCaptcha();
        document.getElementById('captchaAnswer').value = '';
        return;
    }
    
    // Calculate bot score
    const botScore = calculateBotScore();
    
    if (botScore > 60) {
        errorDiv.textContent = 'Suspicious activity detected. Please try again more naturally.';
        errorDiv.style.display = 'block';
        generateMathCaptcha();
        document.getElementById('captchaAnswer').value = '';
        // Reset tracking
        formInteractions = {
            mouseMovements: 0,
            keystrokes: 0,
            focusChanges: 0,
            startTime: Date.now(),
            fieldsFilled: new Set()
        };
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username, 
                email, 
                password,
                behaviorData: {
                    timeTaken: Date.now() - formInteractions.startTime,
                    mouseMovements: formInteractions.mouseMovements,
                    keystrokes: formInteractions.keystrokes,
                    focusChanges: formInteractions.focusChanges,
                    botScore: botScore
                }
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // Check if there's a redirect URL
            const redirectUrl = sessionStorage.getItem('redirectAfterLogin');
            sessionStorage.removeItem('redirectAfterLogin');
            
            window.location.href = redirectUrl || 'language-select.html';
        } else {
            errorDiv.textContent = data.error || 'Registration failed';
            errorDiv.style.display = 'block';
            generateMathCaptcha();
            document.getElementById('captchaAnswer').value = '';
        }
    } catch (error) {
        errorDiv.textContent = 'Connection error. Please try again.';
        errorDiv.style.display = 'block';
        generateMathCaptcha();
        document.getElementById('captchaAnswer').value = '';
    }
});

// Check if already logged in
window.addEventListener('load', async () => {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const response = await fetch(`${API_URL}/verify`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                window.location.href = 'language-select.html';
            }
        } catch (error) {
            console.error('Token verification failed');
        }
    }
});
