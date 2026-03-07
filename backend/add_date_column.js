const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log('Adicionando coluna data_recebimento na tabela itens_recebidos_gerdau...');
        await pool.query(`
            ALTER TABLE itens_recebidos_gerdau 
            ADD COLUMN IF NOT EXISTS data_recebimento DATE;
        `);
        console.log('Sucesso!');
    } catch (e) {
        console.error('Erro:', e.message);
    } finally {
        pool.end();
    }
}

run();
