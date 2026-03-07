const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initializeConciliacaoDB() {
    console.log("Iniciando criação das tabelas relacionais de Conciliação no PostgreSQL...");

    const createTablesQuery = `
    -- Tabelas Fiscais e Recebimento
    CREATE TABLE IF NOT EXISTS notas_fiscais (
      numero_nota VARCHAR(50) PRIMARY KEY,
      data_emissao TIMESTAMP NOT NULL,
      fornecedor VARCHAR(100) NOT NULL,
      origem_material VARCHAR(50) NOT NULL,
      valor_total DECIMAL(15,2) NOT NULL,
      baixa_manual BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS itens_nota_sygecom (
      id SERIAL PRIMARY KEY,
      numero_nota VARCHAR(50) REFERENCES notas_fiscais(numero_nota) ON DELETE CASCADE,
      produto VARCHAR(100) NOT NULL,
      peso DECIMAL(15,2) NOT NULL,
      valor_por_kg DECIMAL(10,4) NOT NULL,
      valor_total DECIMAL(15,2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS itens_recebidos_gerdau (
      id SERIAL PRIMARY KEY,
      numero_nota VARCHAR(50) REFERENCES notas_fiscais(numero_nota) ON DELETE CASCADE,
      produto_recebido VARCHAR(100) NOT NULL,
      peso_recebido DECIMAL(15,2) NOT NULL,
      valor_por_kg DECIMAL(10,4) NOT NULL,
      valor_total DECIMAL(15,2) NOT NULL,
      imposto DECIMAL(15,2) DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS impurezas (
      id SERIAL PRIMARY KEY,
      numero_nota VARCHAR(50) REFERENCES notas_fiscais(numero_nota) ON DELETE CASCADE,
      percentual_impureza DECIMAL(5,2) NOT NULL,
      peso_descontado DECIMAL(15,2) NOT NULL,
      observacoes TEXT
    );

    -- Tabelas Logísticas
    CREATE TABLE IF NOT EXISTS caminhoes (
      placa VARCHAR(20) PRIMARY KEY,
      motorista VARCHAR(100),
      tipo_caminhao VARCHAR(50),
      capacidade_toneladas DECIMAL(10,2)
    );

    CREATE TABLE IF NOT EXISTS viagens (
      id SERIAL PRIMARY KEY,
      numero_nota VARCHAR(50) REFERENCES notas_fiscais(numero_nota) ON DELETE SET NULL,
      placa_caminhao VARCHAR(20) REFERENCES caminhoes(placa) ON DELETE SET NULL,
      motorista VARCHAR(100),
      origem_carga VARCHAR(100),
      destino VARCHAR(100),
      data_saida TIMESTAMP,
      peso_estimado DECIMAL(15,2),
      observacoes TEXT
    );

    -- Tabelas Financeiras (Gerdau)
    CREATE TABLE IF NOT EXISTS adiantamentos_gerdau (
      id SERIAL PRIMARY KEY,
      data TIMESTAMP NOT NULL,
      valor DECIMAL(15,2) NOT NULL,
      descricao VARCHAR(200),
      observacoes TEXT
    );

    CREATE TABLE IF NOT EXISTS servicos_prestados (
      id SERIAL PRIMARY KEY,
      data TIMESTAMP NOT NULL,
      descricao_servico VARCHAR(200) NOT NULL,
      valor_servico DECIMAL(15,2) NOT NULL,
      observacoes TEXT
    );

    CREATE TABLE IF NOT EXISTS complementos_gerdau (
      id SERIAL PRIMARY KEY,
      numero_nota VARCHAR(50) REFERENCES notas_fiscais(numero_nota) ON DELETE CASCADE,
      valor_complemento DECIMAL(15,2) NOT NULL,
      motivo VARCHAR(200),
      data_lancamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS saldo_gerdau (
      data_consulta DATE PRIMARY KEY,
      saldo_portal_gerdau DECIMAL(15,2) NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

    try {
        await pool.query(createTablesQuery);
        console.log("Todas as 10 tabelas de Conciliação criadas com sucesso!");
    } catch (err) {
        console.error("Erro ao criar as tabelas:", err);
    } finally {
        pool.end();
    }
}

initializeConciliacaoDB();
