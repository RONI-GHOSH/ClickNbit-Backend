const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function updateAdmin() {
    const client = await pool.connect();
    try {
        console.log('🌱 Connected to database...');

        const email = 'admin@digontom.com';
        const password = 'password1234';
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const checkAdmin = await client.query('SELECT * FROM admins WHERE email = $1', [email]);

        if (checkAdmin.rows.length === 0) {
            console.log('👤 Creating new admin user...');
            await client.query(
                'INSERT INTO admins (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
                ['Digontom Admin', email, hash, 'superadmin']
            );
            console.log(`✅ Admin created: ${email}`);
        } else {
            console.log('👤 Updating existing admin user...');
            await client.query(
                'UPDATE admins SET password_hash = $1 WHERE email = $2',
                [hash, email]
            );
            console.log(`✅ Admin password updated: ${email}`);
        }

    } catch (err) {
        console.error('❌ Error updating admin:', err);
    } finally {
        client.release();
        pool.end();
    }
}

updateAdmin();
