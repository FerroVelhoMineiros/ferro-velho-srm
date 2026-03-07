const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS configuracoes_gerdau (
                chave VARCHAR(50) PRIMARY KEY,
                valor TEXT NOT NULL,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Tabela configuracoes_gerdau criada!');
        await pool.query(`
            INSERT INTO configuracoes_gerdau (chave, valor)
            VALUES ('preco_kg_impureza', '0.50')
            ON CONFLICT (chave) DO NOTHING;
        `);
        console.log('Default Seed: 0.50 R$/kg');
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

run();
