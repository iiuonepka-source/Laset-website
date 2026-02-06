const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const { initDatabase } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('Starting Lasted Premium server...');
console.log('Port:', PORT);
console.log('Database URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
console.log('JWT Secret:', process.env.JWT_SECRET ? 'Set' : 'Not set');

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// Routes
app.use('/api/auth', authRoutes);

// Serve HTML files with clean URLs (without .html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'language-select.html'));
});

app.get('/home', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/auth', (req, res) => {
    res.sendFile(path.join(__dirname, 'auth.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin-auth', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-auth.html'));
});

app.get('/purchase', (req, res) => {
    res.sendFile(path.join(__dirname, 'purchase.html'));
});

app.get('/soon', (req, res) => {
    res.sendFile(path.join(__dirname, 'soon.html'));
});

// Initialize database and start server
async function startServer() {
    let retries = 10;
    
    while (retries > 0) {
        try {
            console.log(`Attempting to connect to database (${retries} retries left)...`);
            await initDatabase();
            
            app.listen(PORT, '0.0.0.0', () => {
                console.log(`Server running on port ${PORT}`);
            });
            return;
        } catch (err) {
            retries--;
            console.error(`Database connection failed: ${err.message}`);
            
            if (retries === 0) {
                console.error('Failed to connect to database after all retries');
                process.exit(1);
            }
            
            console.log(`Waiting 3 seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
}

startServer();
