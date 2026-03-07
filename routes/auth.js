const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../database/db');
const licenseStore = require('../license-store');

const router = express.Router();

const PLAN_TO_SUBSCRIPTION = {
    '30d': { type: '30days', days: 30 },
    '90d': { type: '90days', days: 90 },
    '365d': { type: '365days', days: 365 },
    lifetime: { type: 'lifetime', days: null }
};

function toSubscriptionFromPlan(plan) {
    return PLAN_TO_SUBSCRIPTION[plan] || null;
}

function calculateDaysLeft(expiresAt) {
    if (!expiresAt) {
        return null;
    }
    const expires = new Date(expiresAt);
    const msLeft = expires.getTime() - Date.now();
    return Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
}

function formatLicenseText(license) {
    if (!license) {
        return 'License - none';
    }
    if (license.plan === 'lifetime') {
        return 'License - Forever';
    }
    const daysLeft = typeof license.daysLeft === 'number' ? license.daysLeft : license.durationDays;
    return `License - ${daysLeft} days`;
}

function enrichUserWithLicense(user) {
    const license = licenseStore.getLicenseForUser(user.id);
    return {
        ...user,
        license: license || null,
        license_key: license?.key || null,
        license_plan: license?.plan || null,
        license_plan_label: license?.planLabel || null,
        license_days_left: license?.daysLeft ?? calculateDaysLeft(user.subscription_expires),
        license_hwid: license?.hwid || null,
        license_text: formatLicenseText(license)
    };
}

// Register
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, behaviorData } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Advanced bot detection
        if (behaviorData) {
            const { timeTaken, mouseMovements, keystrokes, focusChanges, botScore } = behaviorData;
            
            // Server-side bot score validation
            if (botScore > 60) {
                console.log(`Bot detected: Score ${botScore}, IP: ${req.ip}`);
                return res.status(400).json({ error: 'Suspicious activity detected' });
            }
            
            // Additional server-side checks
            if (timeTaken < 5000) {
                return res.status(400).json({ error: 'Registration too fast. Please try again.' });
            }
            
            if (mouseMovements < 5 && keystrokes < 10) {
                return res.status(400).json({ error: 'Unusual behavior detected' });
            }
        }

        // Rate limiting by IP
        const clientIp = req.ip || req.connection.remoteAddress;
        
        // Check recent registrations from this IP (you can implement Redis for production)
        try {
            const recentRegistrations = await pool.query(
                `SELECT COUNT(*) as count FROM users 
                 WHERE created_at > NOW() - INTERVAL '1 hour'`
            );
            
            if (recentRegistrations.rows[0].count > 5) {
                return res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
            }
        } catch (dbError) {
            console.error('Rate limit check failed:', dbError.message);
            // Continue anyway if rate limit check fails
        }

        // Check if user exists
        const userExists = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR username = $2',
            [email, username]
        );

        if (userExists.rows.length > 0) {
            const existingUser = userExists.rows[0];
            if (existingUser.email === email) {
                return res.status(400).json({ error: 'Email already registered' });
            }
            if (existingUser.username === username) {
                return res.status(400).json({ error: 'Username already taken' });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const result = await pool.query(
            'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
            [username, email, hashedPassword, username === 'DEV' ? 'admin' : 'user']
        );

        const user = result.rows[0];

        // Create token
        const token = jwt.sign(
            { userId: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Find user
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Create token
        const token = jwt.sign(
            { userId: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                subscription_type: user.subscription_type,
                subscription_expires: user.subscription_expires
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Verify token
router.get('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const result = await pool.query(
            'SELECT id, username, email, role, subscription_type, subscription_expires, hwid, status, created_at, last_login FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = enrichUserWithLicense(result.rows[0]);
        res.json({ success: true, user });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Activate license key from dashboard
router.post('/license/activate', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { licenseKey } = req.body;

        const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [decoded.userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const activation = licenseStore.activateKeyForUser(licenseKey, decoded.userId);
        if (!activation.ok) {
            const messageMap = {
                invalid_key: 'Invalid key format',
                key_not_found: 'License key not found',
                key_already_used: 'This key is already used by another account'
            };
            return res.status(activation.status || 400).json({
                success: false,
                error: messageMap[activation.reason] || activation.reason || 'Failed to activate key'
            });
        }

        const subscription = toSubscriptionFromPlan(activation.record.plan);
        if (!subscription) {
            return res.status(500).json({ success: false, error: 'Unknown key plan' });
        }

        let expiresAt = null;
        if (subscription.days === null) {
            expiresAt = new Date('2038-01-01T00:00:00Z');
        } else if (activation.record.expiresAt) {
            expiresAt = new Date(Number(activation.record.expiresAt));
        } else {
            expiresAt = new Date(Date.now() + subscription.days * 24 * 60 * 60 * 1000);
        }

        await pool.query(
            'UPDATE users SET subscription_type = $1, subscription_expires = $2, status = $3 WHERE id = $4',
            [subscription.type, expiresAt, 'active', decoded.userId]
        );

        const updatedUserResult = await pool.query(
            'SELECT id, username, email, role, subscription_type, subscription_expires, hwid, status, created_at, last_login FROM users WHERE id = $1',
            [decoded.userId]
        );

        const user = enrichUserWithLicense(updatedUserResult.rows[0]);

        res.json({
            success: true,
            message: user.license_text,
            user,
            license: user.license
        });
    } catch (error) {
        console.error('License activate error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Bind HWID on first game launch with activated key
router.post('/license/game-login', async (req, res) => {
    try {
        const { licenseKey, hwid } = req.body;
        const normalizedHwid = String(hwid || '').trim();
        const license = licenseStore.getLicenseByKey(licenseKey);

        if (!license) {
            return res.status(404).json({
                success: false,
                reason: 'key_not_found',
                error: 'License key not found',
                shouldCrash: true,
                action: 'crash'
            });
        }

        if (!license.used || !license.activatedByUserId) {
            return res.status(409).json({
                success: false,
                reason: 'key_not_activated',
                error: 'Key must be activated on website first',
                shouldCrash: true,
                action: 'crash'
            });
        }

        if (license.expired) {
            return res.status(403).json({
                success: false,
                reason: 'license_expired',
                error: 'License has expired',
                shouldCrash: true,
                action: 'crash'
            });
        }

        if (!normalizedHwid) {
            return res.status(400).json({
                success: false,
                reason: 'hwid_required',
                error: 'HWID is required',
                shouldCrash: true,
                action: 'crash'
            });
        }

        const ownerUserId = license.activatedByUserId;
        const userResult = await pool.query(
            'SELECT id, hwid, status, subscription_expires FROM users WHERE id = $1',
            [ownerUserId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                reason: 'user_not_found',
                error: 'User not found for activated key',
                shouldCrash: true,
                action: 'crash'
            });
        }

        const user = userResult.rows[0];

        if (user.status === 'leaked' || user.status === 'banned') {
            return res.status(403).json({
                success: false,
                reason: user.status,
                error: 'Account is blocked',
                shouldCrash: true,
                action: 'crash'
            });
        }

        if (user.subscription_expires && new Date(user.subscription_expires) < new Date()) {
            return res.status(403).json({
                success: false,
                reason: 'subscription_expired',
                error: 'Subscription expired',
                shouldCrash: true,
                action: 'crash'
            });
        }

        if (user.hwid && user.hwid !== normalizedHwid) {
            await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['leaked', ownerUserId]);
            return res.status(409).json({
                success: false,
                reason: 'hwid_mismatch',
                error: 'HWID mismatch detected for this key',
                shouldCrash: true,
                action: 'crash'
            });
        }

        const bindResult = licenseStore.bindHwidByKey(licenseKey, normalizedHwid);
        if (!bindResult.ok) {
            const messageMap = {
                invalid_key: 'Invalid key format',
                hwid_required: 'HWID is required',
                key_not_found: 'License key not found',
                key_not_activated: 'Key must be activated on website first',
                hwid_mismatch: 'Key is already bound to another HWID'
            };

            return res.status(bindResult.status || 400).json({
                success: false,
                reason: bindResult.reason,
                error: messageMap[bindResult.reason] || bindResult.reason || 'Failed to verify key',
                shouldCrash: true,
                action: 'crash'
            });
        }

        if (!user.hwid) {
            await pool.query(
                'UPDATE users SET hwid = $1, last_login = NOW(), status = $2 WHERE id = $3',
                [normalizedHwid, 'active', ownerUserId]
            );
        } else {
            await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [ownerUserId]);
        }

        res.json({
            success: true,
            valid: true,
            message: 'HWID verified',
            userId: ownerUserId,
            license: bindResult.record
        });
    } catch (error) {
        console.error('Game login license check error:', error);
        res.status(500).json({
            success: false,
            reason: 'server_error',
            error: 'Server error',
            shouldCrash: true,
            action: 'crash'
        });
    }
});
// Admin: Get all users
router.get('/admin/users', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const adminCheck = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.userId]);
        if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await pool.query(
            'SELECT id, username, email, role, subscription_type, subscription_expires, hwid, status, created_at, last_login FROM users ORDER BY created_at DESC'
        );

        const users = result.rows.map(enrichUserWithLicense);
        res.json({ success: true, users });
    } catch (error) {
        console.error('Admin get users error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Generate license keys
router.post('/admin/license/generate', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const adminCheck = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.userId]);

        if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { plan, count } = req.body;
        const generated = licenseStore.generateKeys(plan, count);

        if (!generated.ok) {
            const messageMap = {
                invalid_plan: 'Invalid plan. Use 30d, 90d, 365d or lifetime',
                invalid_count: 'Invalid count. Use number from 1 to 5000',
                key_generation_failed: 'Failed to generate unique keys'
            };

            return res.status(generated.status || 400).json({
                success: false,
                error: messageMap[generated.reason] || generated.reason || 'Failed to generate keys'
            });
        }

        const textLines = generated.keys.map((key) => `${generated.plan} | ${key}`);

        res.json({
            success: true,
            plan: generated.plan,
            planLabel: generated.planLabel,
            count: generated.count,
            keys: generated.keys,
            text: textLines.join('\n')
        });
    } catch (error) {
        console.error('Admin key generation error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
// Admin: Update user role
router.post('/admin/update-role', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const adminCheck = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.userId]);
        
        if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { userId, role } = req.body;
        if (!userId || !role || !['user', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid data' });
        }

        await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Update subscription
router.post('/admin/update-subscription', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const adminCheck = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.userId]);
        
        if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { userId, subscriptionType, days } = req.body;
        let expiresDate = null;
        
        if (subscriptionType === 'lifetime') {
            // Set to year 2038 (max for 32-bit timestamp)
            expiresDate = new Date('2038-01-01T00:00:00Z');
        } else if (subscriptionType !== 'none' && days) {
            expiresDate = new Date();
            expiresDate.setDate(expiresDate.getDate() + parseInt(days));
        }

        await pool.query(
            'UPDATE users SET subscription_type = $1, subscription_expires = $2 WHERE id = $3',
            [subscriptionType, expiresDate, userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Update subscription error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Anti-Leak: Check account status
router.post('/antileak/check', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, reason: 'No token' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { hwid, clientType = 'web' } = req.body;
        const normalizedClientType = String(clientType || 'web').toLowerCase();
        const isGameClient = normalizedClientType === 'game';

        const result = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.json({ success: false, reason: 'User not found' });
        }

        const user = result.rows[0];
        // Check if account is leaked or banned
        if (user.status === 'leaked') {
            return res.json({
                success: false,
                reason: 'This account has been flagged as leaked. Contact support for assistance.',
                shouldCrash: isGameClient,
                action: isGameClient ? 'crash' : undefined
            });
        }

        if (user.status === 'banned') {
            return res.json({
                success: false,
                reason: 'This account has been banned.',
                shouldCrash: isGameClient,
                action: isGameClient ? 'crash' : undefined
            });
        }

        // Check subscription
        if (user.subscription_expires && new Date(user.subscription_expires) < new Date()) {
            return res.json({
                success: false,
                reason: 'Your subscription has expired. Please renew to continue.',
                shouldCrash: isGameClient,
                action: isGameClient ? 'crash' : undefined
            });
        }

        if (isGameClient) {
            const normalizedHwid = String(hwid || '').trim();
            if (!normalizedHwid) {
                return res.json({
                    success: false,
                    reason: 'HWID is required for game client',
                    shouldCrash: true,
                    action: 'crash'
                });
            }

            const bindResult = licenseStore.bindHwidByUserId(decoded.userId, normalizedHwid);
            if (!bindResult.ok && bindResult.reason === 'license_not_found') {
                return res.json({
                    success: false,
                    reason: 'No activated license for this account',
                    shouldCrash: true,
                    action: 'crash'
                });
            }

            if (!bindResult.ok && bindResult.reason === 'hwid_mismatch') {
                await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['leaked', decoded.userId]);
                return res.json({
                    success: false,
                    reason: 'HWID mismatch detected. Account has been flagged for security review.',
                    shouldCrash: true,
                    action: 'crash'
                });
            }

            if (!user.hwid) {
                await pool.query('UPDATE users SET hwid = $1 WHERE id = $2', [normalizedHwid, decoded.userId]);
            }

            if (user.hwid && user.hwid !== normalizedHwid) {
                await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['leaked', decoded.userId]);
                return res.json({
                    success: false,
                    reason: 'HWID mismatch detected. Account has been flagged for security review.',
                    shouldCrash: true,
                    action: 'crash'
                });
            }
        }
        // Update last login
        await pool.query(
            'UPDATE users SET last_login = NOW() WHERE id = $1',
            [decoded.userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Anti-leak check error:', error);
        res.json({ success: false, reason: 'Security check failed' });
    }
});

// Anti-Leak: Report suspicious activity
router.post('/antileak/report', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { activity, hwid, timestamp } = req.body;

        // Log suspicious activity (you can store this in a separate table)
        console.log(`[ANTI-LEAK] User ${decoded.userId} - Activity: ${activity} - HWID: ${hwid} - Time: ${new Date(timestamp)}`);

        res.json({ success: true });
    } catch (error) {
        console.error('Report activity error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Verify password
router.post('/admin/verify-password', async (req, res) => {
    try {
        const { password } = req.body;
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'SpookyBuy2026';
        
        if (password === ADMIN_PASSWORD) {
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, error: 'Invalid password' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Update user HWID and status
router.post('/admin/update-user', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const adminCheck = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.userId]);
        
        if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { userId, hwid, status } = req.body;

        await pool.query(
            'UPDATE users SET hwid = $1, status = $2 WHERE id = $3',
            [hwid, status, userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Clear leaked accounts
router.delete('/admin/clear-leaked', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const adminCheck = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.userId]);
        
        if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        await pool.query("DELETE FROM users WHERE status = 'leaked'");

        res.json({ success: true });
    } catch (error) {
        console.error('Clear leaked error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Delete user
router.delete('/admin/delete-user/:userId', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const adminCheck = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.userId]);
        
        if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        await pool.query('DELETE FROM users WHERE id = $1', [req.params.userId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Reset user password
router.post('/admin/reset-password', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const adminCheck = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.userId]);
        
        if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { userId, newPassword } = req.body;
        
        if (!userId || !newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'Invalid password' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);
        
        res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;



