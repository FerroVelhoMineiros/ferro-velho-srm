const { Pool } = require('pg');
require('dotenv').config();

async function update() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    try {
        console.log('Updating CC constraint...');
        await pool.query('ALTER TABLE conta_corrente_gerdau DROP CONSTRAINT IF EXISTS conta_corrente_gerdau_tipo_check');
        await pool.query(`ALTER TABLE conta_corrente_gerdau ADD CONSTRAINT conta_corrente_gerdau_tipo_check 
            CHECK (tipo IN ('adiantamento', 'abatimento_nf', 'complemento', 'saldo_inicial', 'conferencia', 'abatimento_impureza', 'abatimento_resultado'))`);
        console.log('Constraint updated successfully');
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

update();
