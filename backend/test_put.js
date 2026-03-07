const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
    try {
        const result = await p.query(
            `INSERT INTO configuracoes_gerdau (chave, mes, valor, atualizado_em) 
             VALUES ('preco_kg_impureza', $1, $2, CURRENT_TIMESTAMP) 
             ON CONFLICT (chave, mes) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = CURRENT_TIMESTAMP`,
            ['2026-03', '0.55']
        );
        console.log('OK rows:', result.rowCount);
    } catch (e) {
        console.error('ERR:', e.message, e.code);
    } finally {
        await p.end();
    }
}
run();
