const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 20,
    allowExitOnIdle: false
});

// Handle pool errors
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

async function initDatabase() {
    let retries = 5;
    while (retries > 0) {
        try {
            // Create table
            await pool.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    email VARCHAR(100) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    subscription_type VARCHAR(20) DEFAULT 'none',
                    subscription_expires TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Add role column if it doesn't exist
            await pool.query(`
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'
            `);
            
            // Set DEV user as admin by default
            await pool.query(`
                UPDATE users SET role = 'admin' WHERE username = 'DEV'
            `);
            
            console.log('Database initialized successfully');
            return;
        } catch (error) {
            retries--;
            console.error(`Database initialization error (${retries} retries left):`, error.message);
            if (retries === 0) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

module.exports = { pool, initDatabase };
