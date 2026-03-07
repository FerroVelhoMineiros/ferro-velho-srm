const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function debug() {
    try {
        const query = `
            SELECT 
                nf.numero_nota,
                TO_CHAR(nf.data_emissao, 'YYYY-MM') as emissao_mes,
                TO_CHAR(g.data_recebimento, 'YYYY-MM') as recebimento_mes,
                nf.valor_total as vlr_syg,
                g.valor_total as vlr_gerdau,
                g.peso_recebido
            FROM notas_fiscais nf
            LEFT JOIN (
                SELECT numero_nota, SUM(valor_total) as valor_total, MAX(data_recebimento) as data_recebimento, SUM(peso_recebido) as peso_recebido
                FROM itens_recebidos_gerdau GROUP BY numero_nota
            ) g ON nf.numero_nota = g.numero_nota
            ORDER BY nf.data_emissao DESC;
        `;
        const res = await pool.query(query);
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

debug();
