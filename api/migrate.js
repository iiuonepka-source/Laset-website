const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'laset',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
});

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;
const JSON_FILE = path.join(__dirname, 'users.json');

async function migrate() {
    console.log('🔄 Starting migration from JSON to PostgreSQL...\n');

    try {
        // Check if JSON file exists
        if (!fs.existsSync(JSON_FILE)) {
            console.log('⚠️  No users.json found. Skipping migration.');
            console.log('✅ Database is ready for new users.');
            process.exit(0);
        }

        // Load JSON data
        const jsonData = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
        const users = jsonData.users || [];

        if (users.length === 0) {
            console.log('⚠️  No users to migrate.');
            process.exit(0);
        }

        console.log(`📊 Found ${users.length} users to migrate\n`);

        // Check if users already exist
        const existingCount = await pool.query('SELECT COUNT(*) FROM users');
        if (parseInt(existingCount.rows[0].count) > 0) {
            console.log('⚠️  Database already contains users!');
            console.log('   To prevent duplicates, migration is skipped.');
            console.log('   If you want to re-migrate, clear the database first.');
            process.exit(1);
        }

        let migrated = 0;
        let failed = 0;

        for (const user of users) {
            try {
                // Convert old SHA256 hash to bcrypt
                // Note: We can't recover original passwords, so we'll set a temporary one
                // Users will need to reset their passwords
                const tempPassword = crypto.randomBytes(16).toString('hex');
                const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

                await pool.query(
                    `INSERT INTO users 
                    (uid, email, nickname, password_hash, role, hwid, banned, created_at, last_login, sessions, play_time)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                    [
                        user.uid,
                        user.email,
                        user.nickname,
                        passwordHash,
                        user.role || 'user',
                        user.hwid || null,
                        user.banned || false,
                        user.createdAt || new Date().toISOString(),
                        user.lastLogin || null,
                        user.sessions || 0,
                        user.playTime || 0
                    ]
                );

                console.log(`✅ Migrated user: ${user.nickname} (UID: ${user.uid})`);
                migrated++;
            } catch (err) {
                console.error(`❌ Failed to migrate user ${user.nickname}:`, err.message);
                failed++;
            }
        }

        // Update sequence to continue from max UID
        const maxUid = await pool.query('SELECT MAX(uid) FROM users');
        if (maxUid.rows[0].max) {
            await pool.query(`SELECT setval('users_uid_seq', $1)`, [maxUid.rows[0].max]);
        }

        console.log('\n📊 Migration Summary:');
        console.log(`   ✅ Migrated: ${migrated}`);
        console.log(`   ❌ Failed: ${failed}`);
        console.log(`   📝 Total: ${users.length}`);

        if (migrated > 0) {
            console.log('\n⚠️  IMPORTANT: Password Migration Notice');
            console.log('   Old SHA256 hashes cannot be converted to bcrypt.');
            console.log('   All users have been assigned temporary random passwords.');
            console.log('   Users will need to use "Forgot Password" feature or contact admin.');
            
            // Backup old JSON file
            const backupFile = JSON_FILE + '.backup.' + Date.now();
            fs.copyFileSync(JSON_FILE, backupFile);
            console.log(`\n💾 Original JSON backed up to: ${backupFile}`);
        }

        console.log('\n✅ Migration completed!');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Migration failed:', err);
        process.exit(1);
    }
}

// Run migration
migrate();
