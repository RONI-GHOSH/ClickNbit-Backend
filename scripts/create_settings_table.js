const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('🌱 Connected to database...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS system_settings (
                setting_key VARCHAR(50) PRIMARY KEY,
                setting_value TEXT NOT NULL,
                description TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Created system_settings table');

        await client.query(`
            INSERT INTO system_settings (setting_key, setting_value, description)
            VALUES ('ad_frequency', '5', 'Number of news items between advertisements')
            ON CONFLICT (setting_key) DO NOTHING;
        `);
        console.log('✅ Seeded default ad_frequency');

    } catch (err) {
        console.error('❌ Migration error:', err);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
