const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function seed() {
    const client = await pool.connect();
    try {
        console.log('🌱 Connected to database...');

        // 1. Create Admins Table
        await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        admin_id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'editor',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ Admins table created/verified');

        // 2. Create Users Table
        await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        phone VARCHAR(20),
        firebase_uid VARCHAR(128) UNIQUE,
        email VARCHAR(255),
        name VARCHAR(255),
        profile_image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ Users table created/verified');

        // 3. Create Default Admin
        const email = 'admin@example.com';
        const password = 'password123';
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const checkAdmin = await client.query('SELECT * FROM admins WHERE email = $1', [email]);
        if (checkAdmin.rows.length === 0) {
            await client.query(
                'INSERT INTO admins (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
                ['Admin User', email, hash, 'superadmin']
            );
            console.log(`👤 Default admin created: ${email} / ${password}`);
        } else {
            console.log('👤 Default admin already exists');
        }

    } catch (err) {
        console.error('❌ Error seeding database:', err);
    } finally {
        client.release();
        pool.end();
    }
}

seed();
