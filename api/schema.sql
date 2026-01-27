-- Laset Database Schema for PostgreSQL

-- Users table
CREATE TABLE IF NOT EXISTS users (
    uid SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    nickname VARCHAR(16) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    hwid VARCHAR(64),
    banned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    sessions INTEGER DEFAULT 0,
    play_time INTEGER DEFAULT 0
);

-- Sessions table (для отслеживания активных сессий)
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    uid INTEGER REFERENCES users(uid) ON DELETE CASCADE,
    hwid VARCHAR(64),
    ip_address VARCHAR(45),
    user_agent TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    duration INTEGER DEFAULT 0
);

-- Audit log (для отслеживания действий админов)
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    admin_uid INTEGER REFERENCES users(uid),
    action VARCHAR(50) NOT NULL,
    target_uid INTEGER,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(LOWER(nickname));
CREATE INDEX IF NOT EXISTS idx_users_hwid ON users(hwid);
CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(uid);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_log(admin_uid);

-- View for user statistics
CREATE OR REPLACE VIEW user_stats AS
SELECT 
    u.uid,
    u.nickname,
    u.email,
    u.role,
    u.banned,
    u.created_at,
    u.last_login,
    u.sessions,
    u.play_time,
    COUNT(s.id) as total_sessions,
    COALESCE(SUM(s.duration), 0) as total_play_time
FROM users u
LEFT JOIN sessions s ON u.uid = s.uid
GROUP BY u.uid;
