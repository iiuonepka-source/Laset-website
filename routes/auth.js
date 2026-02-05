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
        const recentRegistrations = await pool.query(
            `SELECT COUNT(*) as count FROM users 
             WHERE created_at > NOW() - INTERVAL '1 hour'`
        );
        
        if (recentRegistrations.rows[0].count > 5) {
            return res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
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
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
            [username, email, hashedPassword]
        );

        const user = result.rows[0];

        // Create token
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
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
            { userId: user.id, username: user.username },
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
            'SELECT id, username, email, subscription_type, subscription_expires FROM users WHERE id = $1',
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

module.exports = router;
