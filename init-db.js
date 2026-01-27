const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Railway автоматически предоставляет DATABASE_URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.DB_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
    console.log('🔄 Checking database schema...');
    
    try {
        // Проверяем существует ли таблица users
        const checkTable = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'users'
            );
        `);
        
        if (checkTable.rows[0].exists) {
            console.log('✅ Database already initialized');
            process.exit(0);
            return;
        }
        
        console.log('📊 Initializing database schema...');
        
        // Читаем и выполняем schema.sql
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        await pool.query(schema);
        
        console.log('✅ Database schema initialized successfully!');
        console.log('📝 Tables created: users, sessions, audit_log');
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Database initialization failed:', err.message);
        console.error('   This is normal on first deploy. Schema will be created on next restart.');
        // Не падаем с ошибкой, чтобы не блокировать деплой
        process.exit(0);
    }
}

// Запускаем только если вызван напрямую
if (require.main === module) {
    initDB();
}

module.exports = initDB;
