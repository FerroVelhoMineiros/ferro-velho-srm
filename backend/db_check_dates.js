const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        const res = await pool.query('SELECT numero_nota, data_recebimento FROM itens_recebidos_gerdau WHERE data_recebimento IS NOT NULL LIMIT 10');
        console.log('Resultados com data preenchida:');
        console.table(res.rows);

        const resNull = await pool.query('SELECT count(*) FROM itens_recebidos_gerdau WHERE data_recebimento IS NULL');
        console.log('Total com data NULL:', resNull.rows[0].count);

        const resTotal = await pool.query('SELECT count(*) FROM itens_recebidos_gerdau');
        console.log('Total de registros:', resTotal.rows[0].count);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

check();
