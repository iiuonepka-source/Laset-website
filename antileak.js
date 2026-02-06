// Anti-Leak Protection System
const API_URL = window.location.origin + '/api/auth';

class AntiLeakProtection {
    constructor() {
        this.hwid = null;
        this.fingerprint = null;
        this.checkInterval = null;
    }

    async initialize() {
        await this.generateFingerprint();
        await this.checkAccountStatus();
        this.startMonitoring();
        this.addWatermark();
    }

    async generateFingerprint() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('AntiLeak', 2, 2);
        
        const canvasData = canvas.toDataURL();
        
        const fingerprint = {
            canvas: await this.hashString(canvasData),
            screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: navigator.language,
            platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: navigator.deviceMemory || 'unknown',
            userAgent: navigator.userAgent,
            timestamp: Date.now()
        };

        this.fingerprint = await this.hashString(JSON.stringify(fingerprint));
        this.hwid = this.fingerprint;
        
        return this.hwid;
    }

    async hashString(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async checkAccountStatus() {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const response = await fetch(`${API_URL}/antileak/check`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    hwid: this.hwid,
                    fingerprint: this.fingerprint
                })
            });

            const data = await response.json();

            if (!data.success) {
                this.blockAccess(data.reason || 'Account security check failed');
            }

        } catch (error) {
            console.error('Anti-leak check failed:', error);
        }
    }

    startMonitoring() {
        this.checkInterval = setInterval(() => {
            this.checkAccountStatus();
        }, 30000);

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkAccountStatus();
            }
        });
    }

    addWatermark() {
        const watermark = document.createElement('div');
        watermark.id = 'antileak-watermark';
        watermark.textContent = `Protected by Anti-Leak | ${new Date().toLocaleString()}`;
        watermark.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            font-size: 10px;
            color: rgba(157, 0, 255, 0.2);
            pointer-events: none;
            z-index: 9999;
            font-family: monospace;
            user-select: none;
        `;
        document.body.appendChild(watermark);

        setInterval(() => {
            watermark.textContent = `Protected by Anti-Leak | ${new Date().toLocaleString()}`;
        }, 1000);
    }

    blockAccess(reason) {
        localStorage.clear();
        sessionStorage.clear();

        document.body.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                background: #050507;
                color: #ff4444;
                font-family: 'Outfit', sans-serif;
                text-align: center;
                padding: 2rem;
            ">
                <div style="font-size: 80px; margin-bottom: 2rem;">🚫</div>
                <h1 style="font-size: 3rem; margin-bottom: 1rem;">Access Blocked</h1>
                <p style="font-size: 1.2rem; color: #a0a0a0; max-width: 600px;">
                    ${reason}
                </p>
                <p style="margin-top: 2rem; color: #666;">
                    Contact support if you believe this is an error.
                </p>
            </div>
        `;

        history.pushState(null, null, location.href);
        window.onpopstate = function() {
            history.go(1);
        };
    }
}

const antiLeak = new AntiLeakProtection();

if (window.location.pathname.includes('dashboard') || 
    window.location.pathname.includes('admin') ||
    window.location.pathname.includes('purchase')) {
    
    window.addEventListener('load', () => {
        antiLeak.initialize();
    });
}

window.AntiLeakProtection = antiLeak;
