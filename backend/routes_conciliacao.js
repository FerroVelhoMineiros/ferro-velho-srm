const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');

// Configuration for Multer (Receiving Files in Memory)
const upload = multer({ storage: multer.memoryStorage() });

// Needs the pool injected from server.js
module.exports = (pool) => {

    // --- IMPORTAÇÃO DE PLANILHAS (SYGECOM / GERDAU) ---

    router.post('/import/sygecom', upload.single('file'), async (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

        try {
            const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

            // Database transaction para garantir consistencia
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                for (const row of data) {
                    // Mapeamento esperado da planilha Sygecom
                    const numero_nota = String(row['Numero Nota'] || row['numero_nota']);
                    const data_emissao = row['Data Emissao'] || row['data_emissao'] || new Date();
                    const fornecedor = row['Fornecedor'] || row['fornecedor'] || 'Desconhecido';
                    const origem_material = row['Origem'] || row['origem_material'] || 'Fornecedor';

                    const produto = row['Produto'] || row['produto'];
                    const peso = parseFloat(row['Peso'] || row['peso']) || 0;
                    const valor_por_kg = parseFloat(row['Valor KG'] || row['valor_por_kg']) || 0;
                    const valor_total = parseFloat(row['Valor Total'] || row['valor_total']) || (peso * valor_por_kg);

                    // Verifica se a Nota já existe. Se não, cria.
                    const notaExists = await client.query('SELECT 1 FROM notas_fiscais WHERE numero_nota = $1', [numero_nota]);

                    if (notaExists.rows.length === 0) {
                        await client.query(
                            'INSERT INTO notas_fiscais (numero_nota, data_emissao, fornecedor, origem_material, valor_total) VALUES ($1, $2, $3, $4, $5)',
                            [numero_nota, new Date(data_emissao), fornecedor, origem_material, valor_total]
                        );
                    } else {
                        // Opcional: Atualizar o valor total da nota somando
                    }

                    // Insere os itens
                    await client.query(
                        'INSERT INTO itens_nota_sygecom (numero_nota, produto, peso, valor_por_kg, valor_total) VALUES ($1, $2, $3, $4, $5)',
                        [numero_nota, produto, peso, valor_por_kg, valor_total]
                    );
                }

                await client.query('COMMIT');
                res.json({ message: 'Arquivo Sygecom processado com sucesso!', linhas_processadas: data.length });
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro processando a planilha', details: err.message });
        }
    });

    router.post('/import/gerdau', upload.single('file'), async (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

        try {
            const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
            const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                for (const row of data) {
                    // Mapeamento esperado da planilha Gerdau
                    const numero_nota = String(row['Nota Fiscal'] || row['numero_nota']);
                    const produto_recebido = row['Material'] || row['produto_recebido'];
                    const peso_recebido = parseFloat(row['Peso Liquido'] || row['peso_recebido']) || 0;
                    const valor_por_kg = parseFloat(row['Preco Unitario'] || row['valor_por_kg']) || 0;
                    const valor_total = parseFloat(row['Valor Liquido'] || row['valor_total']) || (peso_recebido * valor_por_kg);

                    // Insere os itens recebidos vinculados à nota
                    await client.query(
                        'INSERT INTO itens_recebidos_gerdau (numero_nota, produto_recebido, peso_recebido, valor_por_kg, valor_total) VALUES ($1, $2, $3, $4, $5)',
                        [numero_nota, produto_recebido, peso_recebido, valor_por_kg, valor_total]
                    );
                }

                await client.query('COMMIT');
                res.json({ message: 'Arquivo Gerdau processado com sucesso!', linhas_processadas: data.length });
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro processando a planilha Gerdau', details: err.message });
        }
    });

    // --- CONCILIAÇÃO E ANÁLISE ---

    router.get('/analise/notas', async (req, res) => {
        try {
            // Este query gigantesco cruza os dados do Sygecom com o que a Gerdau reportou.
            // Para notas com 1 item vs N itens, ele soma (SUM) o total de pesos dos itens atrelados à mesma NF.
            const query = `
                WITH sygecom_totals AS (
                    SELECT numero_nota, SUM(peso) as peso_enviado, SUM(valor_total) as valor_esperado
                    FROM itens_nota_sygecom GROUP BY numero_nota
                ),
                gerdau_totals AS (
                    SELECT numero_nota, SUM(peso_recebido) as peso_recebido, SUM(valor_total) as valor_pago
                    FROM itens_recebidos_gerdau GROUP BY numero_nota
                ),
                impurezas_totais AS (
                    SELECT numero_nota, SUM(peso_descontado) as desconto
                    FROM impurezas GROUP BY numero_nota
                )
                
                SELECT 
                    nf.numero_nota,
                    nf.data_emissao,
                    nf.fornecedor,
                    COALESCE(s.peso_enviado, 0) as peso_enviado,
                    COALESCE(g.peso_recebido, 0) as peso_recebido,
                    COALESCE(i.desconto, 0) as impurezas,
                    (COALESCE(s.peso_enviado, 0) - COALESCE(g.peso_recebido, 0) - COALESCE(i.desconto, 0)) as diferenca_peso,
                    CASE 
                        WHEN s.peso_enviado IS NULL THEN 'Falta no Sygecom'
                        WHEN g.peso_recebido IS NULL THEN 'Pendente Gerdau'
                        WHEN (COALESCE(s.peso_enviado, 0) - COALESCE(g.peso_recebido, 0) - COALESCE(i.desconto, 0)) > 50 THEN 'Divergência'
                        ELSE 'Conciliada'
                    END as status_conciliacao
                FROM notas_fiscais nf
                LEFT JOIN sygecom_totals s ON nf.numero_nota = s.numero_nota
                LEFT JOIN gerdau_totals g ON nf.numero_nota = g.numero_nota
                LEFT JOIN impurezas_totais i ON nf.numero_nota = i.numero_nota
                ORDER BY nf.created_at DESC;
            `;

            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao gerar análise de conciliação' });
        }
    });

    // --- PREVISÃO DE IMPUREZAS (ANALYTICS BÁSICO) ---

    router.get('/previsao', async (req, res) => {
        const { fornecedor, origem } = req.query;
        try {
            // Algoritmo: Busca a media das impurezas daquele fornecedor nas ultimas NF dele
            const query = `
                SELECT AVG(i.percentual_impureza) as percentual_esperado
                FROM impurezas i
                JOIN notas_fiscais nf ON i.numero_nota = nf.numero_nota
                WHERE nf.fornecedor = $1 AND nf.origem_material = $2
            `;
            const result = await pool.query(query, [fornecedor, origem || 'Fornecedor']);

            res.json({
                fornecedor,
                historico_impureza_media: result.rows[0].percentual_esperado || 0
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao prever impurezas' });
        }
    });

    return router;
};
