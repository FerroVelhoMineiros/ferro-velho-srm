const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initializeDatabase() {
    console.log("Iniciando criação das tabelas no PostgreSQL da Render...");

    const createTableQuery = `
    CREATE TABLE IF NOT EXISTS ferrovelho_data (
      id VARCHAR(50) PRIMARY KEY,
      collection_name VARCHAR(50) NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_collection_name ON ferrovelho_data(collection_name);
  `;

    try {
        await pool.query(createTableQuery);
        console.log("Tabela 'ferrovelho_data' criada com sucesso no PostgreSQL!");
    } catch (err) {
        console.error("Erro ao criar as tabelas:", err);
    } finally {
        pool.end();
    }
}

initializeDatabase();
