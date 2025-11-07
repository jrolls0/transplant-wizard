const { Pool } = require('pg');
require('dotenv').config();

async function addROIConsents() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('🔍 Finding users named Amanda or Sam...');
        
        // Find all users with these first names
        const usersResult = await pool.query(`
            SELECT u.first_name, u.last_name, u.email, p.id as patient_id
            FROM users u
            JOIN patients p ON u.id = p.user_id
            WHERE LOWER(u.first_name) IN ('amanda', 'sam')
        `);

        console.log('📋 Found users:', usersResult.rows);

        if (usersResult.rows.length === 0) {
            console.log('❌ No users found with names Amanda or Sam');
            return;
        }

        for (const user of usersResult.rows) {
            // Check if ROI consent already exists
            const existingROI = await pool.query(`
                SELECT id, signed_at FROM roi_consents WHERE patient_id = $1
            `, [user.patient_id]);

            if (existingROI.rows.length === 0) {
                // Insert ROI consent
                await pool.query(`
                    INSERT INTO roi_consents (
                        patient_id, consent_text, digital_signature, signed_at, ip_address, user_agent, created_at
                    ) VALUES ($1, $2, $3, NOW(), '127.0.0.1', 'manual-script', NOW())
                `, [
                    user.patient_id,
                    'Patient has consented to Release of Information for transplant coordination',
                    `${user.first_name} ${user.last_name}`
                ]);

                console.log(`✅ Added ROI consent for ${user.first_name} ${user.last_name} (${user.email})`);
            } else {
                console.log(`ℹ️  ROI consent already exists for ${user.first_name} ${user.last_name} (${user.email}) - signed at ${existingROI.rows[0].signed_at}`);
            }
        }

        await pool.end();
        console.log('✅ ROI consent check completed');
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

addROIConsents();