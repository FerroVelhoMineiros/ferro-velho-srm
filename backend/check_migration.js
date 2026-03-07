const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
    try {
        // Check columns
        const cols = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'configuracoes_gerdau'");
        console.log('COLUMNS:', JSON.stringify(cols.rows.map(r => r.column_name)));

        // Check constraints
        const pk = await p.query("SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = 'configuracoes_gerdau'");
        console.log('CONSTRAINTS:', JSON.stringify(pk.rows));

        // Check data
        const data = await p.query("SELECT * FROM configuracoes_gerdau");
        console.log('DATA:', JSON.stringify(data.rows));

    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        await p.end();
    }
}
run();
