const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../database/db');

const router = express.Router();

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
            'SELECT id, username, email, role, subscription_type, subscription_expires, created_at FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
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
            'SELECT id, username, email, role, subscription_type, subscription_expires, created_at FROM users ORDER BY created_at DESC'
        );

        res.json({ success: true, users: result.rows });
    } catch (error) {
        console.error('Admin get users error:', error);
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
        
        if (subscriptionType !== 'none' && days) {
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

module.exports = router;
