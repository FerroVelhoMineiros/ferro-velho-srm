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
                    const numero_nota = String(row['Número'] || row['Numero Nota'] || row['numero_nota']);
                    if (!numero_nota || numero_nota === 'undefined') continue;

                    let dataTemp = row['Emissão'] || row['Data Emissao'] || row['data_emissao'];
                    // O excel as vezes retorna a data em formato serial
                    let data_emissao = new Date();
                    if (typeof dataTemp === 'number') data_emissao = new Date(Math.round((dataTemp - 25569) * 86400 * 1000));
                    else if (dataTemp) {
                        const partes = String(dataTemp).split('/');
                        if (partes.length === 3) data_emissao = new Date(`${partes[2]}-${partes[1]}-${partes[0]}T12:00:00Z`);
                        else data_emissao = new Date(dataTemp);
                    }

                    const fornecedor = row['Razão Social'] || row['Fornecedor'] || row['fornecedor'] || 'Desconhecido';
                    const origem_material = row['Origem'] || row['origem_material'] || 'Fornecedor';

                    const produto = row['Produto'] || row['produto'] || 'Sucata Fe'; // Sygecom original as vezes foca só no tipo genérico
                    const peso = parseFloat(row['Total QTD'] || row['Peso'] || row['peso']) || 0;
                    const valor_total = parseFloat(row['Vlr Bruto'] || row['Total R$ NF'] || row['Valor Total'] || row['valor_total']) || 0;
                    const valor_por_kg = peso > 0 ? (valor_total / peso) : 0;

                    // Verifica se a Nota já existe.
                    const notaExists = await client.query('SELECT fornecedor FROM notas_fiscais WHERE numero_nota = $1', [numero_nota]);

                    if (notaExists.rows.length === 0) {
                        await client.query(
                            'INSERT INTO notas_fiscais (numero_nota, data_emissao, fornecedor, origem_material, valor_total) VALUES ($1, $2, $3, $4, $5)',
                            [numero_nota, data_emissao, fornecedor, origem_material, valor_total]
                        );
                    } else if (notaExists.rows[0].fornecedor === 'Pendente Sygecom') {
                        // Se era uma nota "fantasma" criada pela Gerdau, atualiza com os dados reais do Sygecom agora
                        await client.query(
                            'UPDATE notas_fiscais SET data_emissao = $1, fornecedor = $2, origem_material = $3, valor_total = $4 WHERE numero_nota = $5',
                            [data_emissao, fornecedor, origem_material, valor_total, numero_nota]
                        );
                    }

                    // Insere os itens apenas se ainda não existirem exatos (anti-duplicação)
                    const itemExists = await client.query('SELECT 1 FROM itens_nota_sygecom WHERE numero_nota = $1 AND produto = $2 AND peso = $3', [numero_nota, produto, peso]);

                    if (itemExists.rows.length === 0) {
                        await client.query(
                            'INSERT INTO itens_nota_sygecom (numero_nota, produto, peso, valor_por_kg, valor_total) VALUES ($1, $2, $3, $4, $5)',
                            [numero_nota, produto, peso, valor_por_kg, valor_total]
                        );
                    }
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
                    // Helper para encontrar valores independente de espaços extras nos títulos do Excel e respeitar a ordem de prioridade
                    const getCol = (possibleNames) => {
                        for (const name of possibleNames) {
                            for (const k in row) {
                                if (k.trim() === name) return row[k];
                            }
                        }
                        return undefined;
                    };

                    // Ignora complementos
                    const motivo = getCol(['Motivo']) || '';
                    if (motivo === 'NF Complementar') continue;

                    // Mapeamento esperado da planilha Gerdau
                    let numero_nota_raw = String(getCol(['Nº Nota fiscal do fornecedor', 'Nota Fiscal', 'numero_nota']) || '');
                    if (!numero_nota_raw || numero_nota_raw === 'undefined') continue;

                    // Gerdau manda a nota como 52507-1, precisamos limpar o traço
                    const numero_nota = numero_nota_raw.replace(/-\d+$/, '');

                    const produto_recebido = getCol(['Material', 'produto_recebido']) || 'Sucata Fe MIGO';
                    // Tratando espaços extras que possam vir na coluna Volume Gerdau
                    const rawVolumeStr = getCol(['Volume Gerdau', 'Peso Liquido', 'peso_recebido']);
                    const peso_recebido = parseFloat(rawVolumeStr) || 0;

                    const imposto_gerdau = parseFloat(getCol(['Imposto'])) || 0;

                    // O Valor da Nota do Fornecedor na planilha MIGO
                    const valor_total = parseFloat(getCol(['Valor Gerdau', 'Valor Liquido', 'valor_total'])) || 0;
                    const valor_por_kg = peso_recebido > 0 ? (valor_total / peso_recebido) : 0;

                    let dataMigoRaw = getCol(['MIGO', 'Data', 'Data de Lançamento', 'Data Migo', 'data_recebimento']);
                    let data_recebimento = null;
                    if (typeof dataMigoRaw === 'number') {
                        data_recebimento = new Date(Math.round((dataMigoRaw - 25569) * 86400 * 1000));
                    } else if (dataMigoRaw) {
                        data_recebimento = new Date(dataMigoRaw);
                    }

                    // Previne quebra de chave estrangeira se o usuário importar GERDAU antes de importar o SYGECOM base
                    const notaExists = await client.query('SELECT 1 FROM notas_fiscais WHERE numero_nota = $1', [numero_nota]);
                    if (notaExists.rows.length === 0) {
                        await client.query(
                            'INSERT INTO notas_fiscais (numero_nota, data_emissao, fornecedor, origem_material, valor_total) VALUES ($1, $2, $3, $4, $5)',
                            [numero_nota, new Date(), 'Pendente Sygecom', 'Indefinida', 0]
                        );
                    }

                    // Insere os itens recebidos (com verificação anti-duplicação)
                    const itemExists = await client.query('SELECT 1 FROM itens_recebidos_gerdau WHERE numero_nota = $1 AND produto_recebido = $2 AND peso_recebido = $3', [numero_nota, produto_recebido, peso_recebido]);

                    if (itemExists.rows.length === 0) {
                        await client.query(
                            'INSERT INTO itens_recebidos_gerdau (numero_nota, produto_recebido, peso_recebido, valor_por_kg, valor_total, imposto, data_recebimento) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                            [numero_nota, produto_recebido, peso_recebido, valor_por_kg, valor_total, imposto_gerdau, data_recebimento]
                        );
                    }
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
            const { mes } = req.query; // Padrão esperado 'YYYY-MM'

            let whereClause = '';
            let params = [];

            if (mes) {
                // Filtra pelo mes especificado na data_emissao da nota OU na data_recebimento da Gerdau (Formato YYYY-MM)
                whereClause = `WHERE TO_CHAR(nf.data_emissao, 'YYYY-MM') = $1 
                               OR TO_CHAR(g.data_recebimento, 'YYYY-MM') = $1`;
                params.push(mes);
            }

            // Este query gigantesco cruza os dados do Sygecom com o que a Gerdau reportou.
            // Para notas com 1 item vs N itens, ele soma (SUM) o total de pesos dos itens atrelados à mesma NF.
            const query = `
                WITH sygecom_totals AS (
                    SELECT numero_nota, SUM(peso) as peso_enviado, SUM(valor_total) as valor_esperado
                    FROM itens_nota_sygecom GROUP BY numero_nota
                ),
                gerdau_totals AS (
                    SELECT numero_nota, SUM(peso_recebido) as peso_recebido, SUM(valor_total) as valor_pago, SUM(imposto) as imposto_gerdau, MAX(data_recebimento) as data_recebimento
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
                    nf.baixa_manual,
                    g.data_recebimento as data_recebimento_gerdau,
                    COALESCE(s.peso_enviado, 0) as peso_enviado,
                    CASE WHEN nf.baixa_manual THEN COALESCE(s.peso_enviado, 0) ELSE COALESCE(g.peso_recebido, 0) END as peso_recebido,
                    COALESCE(i.desconto, 0) as impurezas,
                    CASE 
                        WHEN nf.baixa_manual THEN 0 
                        ELSE (COALESCE(s.peso_enviado, 0) - COALESCE(g.peso_recebido, 0) + COALESCE(i.desconto, 0)) 
                    END as diferenca_peso,
                    COALESCE(s.valor_esperado, 0) as valor_sygecom_sem_imposto,
                    CASE WHEN nf.baixa_manual THEN COALESCE(s.valor_esperado, 0) ELSE COALESCE(g.valor_pago, 0) END as valor_gerdau_com_imposto,
                    CASE WHEN nf.baixa_manual THEN 0 ELSE COALESCE(g.imposto_gerdau, 0) END as imposto_gerdau_icms,
                    CASE 
                        WHEN nf.baixa_manual THEN 'Baixa Manual'
                        WHEN s.peso_enviado IS NULL THEN 'Falta no Sygecom'
                        WHEN g.peso_recebido IS NULL THEN 'Pendente Gerdau'
                        WHEN (COALESCE(s.peso_enviado, 0) - COALESCE(g.peso_recebido, 0) + COALESCE(i.desconto, 0)) > 50 THEN 'Divergência'
                        ELSE 'Conciliada'
                    END as status_conciliacao
                FROM notas_fiscais nf
                LEFT JOIN sygecom_totals s ON nf.numero_nota = s.numero_nota
                LEFT JOIN gerdau_totals g ON nf.numero_nota = g.numero_nota
                LEFT JOIN impurezas_totais i ON nf.numero_nota = i.numero_nota
                ${whereClause}
                ORDER BY nf.data_emissao DESC, nf.created_at DESC;
            `;

            const result = await pool.query(query, params);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao gerar análise de conciliação' });
        }
    });

    // --- LANÇAMENTO DE IMPUREZAS ---
    router.post('/impureza', async (req, res) => {
        const { numero_nota, kg_desconto, observacao } = req.body;

        if (!numero_nota || isNaN(kg_desconto)) {
            return res.status(400).json({ error: 'Faltando campos obrigatórios: nota e peso.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Remove impurezas antigas do mesmo fornecedor/nota para sobrescrever
            await client.query('DELETE FROM impurezas WHERE numero_nota = $1', [numero_nota]);

            if (parseFloat(kg_desconto) > 0) {
                await client.query(
                    'INSERT INTO impurezas (numero_nota, percentual_impureza, peso_descontado, observacoes) VALUES ($1, 0, $2, $3)',
                    [numero_nota, parseFloat(kg_desconto), observacao || 'Lançamento Manual Módulo CRM']
                );
            }

            await client.query('COMMIT');
            res.json({ message: 'Impureza atualizada com sucesso!' });
        } catch (e) {
            await client.query('ROLLBACK');
            res.status(500).json({ error: e.message });
        } finally {
            client.release();
        }
    });

    // --- ROTA DE BAIXA MANUAL (OVERRIDE GERDAU) ---
    router.post('/baixa-manual', async (req, res) => {
        const { numero_nota } = req.body;

        if (!numero_nota) {
            return res.status(400).json({ error: 'Faltando o número da nota.' });
        }

        try {
            await pool.query('UPDATE notas_fiscais SET baixa_manual = true WHERE numero_nota = $1', [numero_nota]);
            res.json({ message: 'Baixa manual com pagamento Integral concedida com sucesso!' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Falha gravando a baixa manual.' });
        }
    });

    // --- ROTA PARA REVERTER BAIXA MANUAL ---
    router.post('/reverter-baixa-manual', async (req, res) => {
        const { numero_nota } = req.body;

        if (!numero_nota) {
            return res.status(400).json({ error: 'Faltando o número da nota.' });
        }

        try {
            await pool.query('UPDATE notas_fiscais SET baixa_manual = false WHERE numero_nota = $1', [numero_nota]);
            res.json({ message: 'Baixa manual revertida com sucesso!' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Falha revertendo a baixa manual.' });
        }
    });

    // --- CONFIGURAÇÕES GLOBAIS E MENSAIS ---

    router.get('/configuracao', async (req, res) => {
        const { mes } = req.query; // Formato YYYY-MM ou vazio para todos
        try {
            if (mes) {
                const query = `SELECT chave, valor FROM configuracoes_gerdau WHERE chave = 'preco_kg_impureza' AND mes = $1`;
                const result = await pool.query(query, [mes]);
                if (result.rows.length > 0) {
                    return res.json({ preco_kg_impureza: parseFloat(result.rows[0].valor) });
                } else {
                    // Se não existir para o mês, busca o GLOBAL ou padrão
                    const fallback = await pool.query(`SELECT valor FROM configuracoes_gerdau WHERE chave = 'preco_kg_impureza' AND mes = 'GLOBAL'`);
                    const val = fallback.rows.length > 0 ? parseFloat(fallback.rows[0].valor) : 0.50;
                    return res.json({ preco_kg_impureza: val });
                }
            } else {
                // Retorna todos os preços para cálculo de média no Front
                const query = `SELECT mes, valor FROM configuracoes_gerdau WHERE chave = 'preco_kg_impureza'`;
                const result = await pool.query(query);
                const configs = {};
                result.rows.forEach(r => {
                    configs[r.mes] = parseFloat(r.valor);
                });
                res.json(configs);
            }
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao buscar configurações' });
        }
    });

    router.put('/configuracao', async (req, res) => {
        const { preco_kg_impureza, mes } = req.body;
        const finalMes = mes || 'GLOBAL';

        if (preco_kg_impureza === undefined || isNaN(preco_kg_impureza)) {
            return res.status(400).json({ error: 'Faltando o valor numérico do preco_kg_impureza.' });
        }

        try {
            await pool.query(
                `INSERT INTO configuracoes_gerdau (chave, mes, valor, atualizado_em) 
                 VALUES ('preco_kg_impureza', $1, $2, CURRENT_TIMESTAMP) 
                 ON CONFLICT (chave, mes) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = CURRENT_TIMESTAMP`,
                [finalMes, String(preco_kg_impureza)]
            );
            res.json({ message: 'Configuração atualizada com sucesso!', mes: finalMes });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao salvar configuração' });
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

    // --- CRUD NOTAS FISCAIS MANUAIS ---

    router.get('/notas', async (req, res) => {
        try {
            const query = `
                SELECT numero_nota, data_emissao, fornecedor, origem_material, valor_total 
                FROM notas_fiscais 
                ORDER BY data_emissao DESC, created_at DESC 
                LIMIT 500
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao buscar notas fiscais' });
        }
    });

    router.post('/notas', async (req, res) => {
        const { numero_nota, data_emissao, fornecedor, origem_material, valor_total } = req.body;
        try {
            const result = await pool.query(
                'INSERT INTO notas_fiscais (numero_nota, data_emissao, fornecedor, origem_material, valor_total) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                [numero_nota, data_emissao, fornecedor, origem_material, valor_total]
            );
            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao inserir nota fiscal', msg: err.message });
        }
    });

    router.put('/notas/:id', async (req, res) => {
        const id = req.params.id;
        const { data_emissao, fornecedor, origem_material, valor_total } = req.body;
        try {
            const result = await pool.query(
                'UPDATE notas_fiscais SET data_emissao = $1, fornecedor = $2, origem_material = $3, valor_total = $4 WHERE numero_nota = $5 RETURNING *',
                [data_emissao, fornecedor, origem_material, valor_total, id]
            );
            if (result.rows.length === 0) return res.status(404).json({ error: 'Nota não encontrada' });
            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao atualizar nota fiscal' });
        }
    });

    router.delete('/notas/:id', async (req, res) => {
        const id = req.params.id;
        try {
            // Devido a chave estrangeira precisamos DELETAR OS ITENS nas tabelas filhas primeiro
            await pool.query('DELETE FROM itens_nota_sygecom WHERE numero_nota = $1', [id]);
            await pool.query('DELETE FROM itens_recebidos_gerdau WHERE numero_nota = $1', [id]);
            await pool.query('DELETE FROM impurezas WHERE numero_nota = $1', [id]);

            // Depois limpa a NF principal
            const result = await pool.query('DELETE FROM notas_fiscais WHERE numero_nota = $1 RETURNING *', [id]);
            res.json({ message: 'Nota removida com sucesso', deleted: result.rows[0] });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao deletar nota fiscal' });
        }
    });

    // --- CRUD CAMINHÕES (FROTA E TERCEIROS) ---

    router.get('/caminhoes', async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM caminhoes ORDER BY proprietario ASC, placa ASC');
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao buscar caminhões' });
        }
    });

    router.post('/caminhoes', async (req, res) => {
        const { placa, proprietario, capacidade_kg, status } = req.body;
        try {
            const result = await pool.query(
                'INSERT INTO caminhoes (placa, proprietario, capacidade_kg, status) VALUES ($1, $2, $3, $4) RETURNING *',
                [placa.toUpperCase(), proprietario, capacidade_kg || 0, status || 'Ativo']
            );
            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            if (err.code === '23505') return res.status(400).json({ error: 'Placa já cadastrada' });
            res.status(500).json({ error: 'Erro ao inserir caminhão', msg: err.message });
        }
    });

    router.put('/caminhoes/:placa', async (req, res) => {
        const currentPlaca = req.params.placa;
        const { placa, proprietario, capacidade_kg, status } = req.body;

        try {
            const result = await pool.query(
                'UPDATE caminhoes SET placa = $1, proprietario = $2, capacidade_kg = $3, status = $4 WHERE placa = $5 RETURNING *',
                [placa.toUpperCase(), proprietario, capacidade_kg || 0, status, currentPlaca]
            );
            if (result.rows.length === 0) return res.status(404).json({ error: 'Caminhão não encontrado' });
            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            if (err.code === '23505') return res.status(400).json({ error: 'Nova Placa já existe em outro caminhão' });
            res.status(500).json({ error: 'Erro ao atualizar caminhão' });
        }
    });

    router.delete('/caminhoes/:placa', async (req, res) => {
        const placa = req.params.placa;
        try {
            const result = await pool.query('DELETE FROM caminhoes WHERE placa = $1 RETURNING *', [placa]);
            if (result.rows.length === 0) return res.status(404).json({ error: 'Caminhão não encontrado' });
            res.json({ message: 'Caminhão removido' });
        } catch (err) {
            console.error(err);
            // Proteção contra exclusão se tiver viagens atreladas (Foreign Key Constraint)
            if (err.code === '23503') return res.status(400).json({ error: 'Caminhão possui Viagens gravadas, não pode ser excluído.' });
            res.status(500).json({ error: 'Erro ao deletar caminhão' });
        }
    });

    // --- CRUD VIAGENS / FRETES LOGÍSTICOS ---

    router.get('/viagens', async (req, res) => {
        try {
            const query = `
                SELECT v.id, v.placa, c.proprietario, v.data_viagem, v.destino, v.valor_frete, v.status_pagamento, v.observacoes
                FROM viagens v
                LEFT JOIN caminhoes c ON v.placa = c.placa
                ORDER BY v.data_viagem DESC, v.id DESC;
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao buscar viagens' });
        }
    });

    router.post('/viagens', async (req, res) => {
        const { placa, data_viagem, destino, valor_frete, status_pagamento, observacoes } = req.body;
        try {
            const result = await pool.query(
                'INSERT INTO viagens (placa, data_viagem, destino, valor_frete, status_pagamento, observacoes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                [placa.toUpperCase(), data_viagem, destino, valor_frete || 0, status_pagamento, observacoes]
            );
            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            if (err.code === '23503') return res.status(400).json({ error: 'Placa não cadastrada na Frota.' });
            res.status(500).json({ error: 'Erro ao inserir viagem', msg: err.message });
        }
    });

    router.put('/viagens/:id', async (req, res) => {
        const id = req.params.id;
        const { placa, data_viagem, destino, valor_frete, status_pagamento, observacoes } = req.body;
        try {
            const result = await pool.query(
                'UPDATE viagens SET placa = $1, data_viagem = $2, destino = $3, valor_frete = $4, status_pagamento = $5, observacoes = $6 WHERE id = $7 RETURNING *',
                [placa.toUpperCase(), data_viagem, destino, valor_frete || 0, status_pagamento, observacoes, id]
            );
            if (result.rows.length === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            if (err.code === '23503') return res.status(400).json({ error: 'Placa não cadastrada na Frota.' });
            res.status(500).json({ error: 'Erro ao atualizar viagem' });
        }
    });

    router.delete('/viagens/:id', async (req, res) => {
        const id = req.params.id;
        try {
            const result = await pool.query('DELETE FROM viagens WHERE id = $1 RETURNING *', [id]);
            if (result.rows.length === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
            res.json({ message: 'Viagem removida com sucesso' });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao deletar viagem' });
        }
    });

    // --- CONTA CORRENTE GERDAU ---

    // Auto-cria a tabela se não existir
    pool.query(`
        CREATE TABLE IF NOT EXISTS conta_corrente_gerdau (
            id SERIAL PRIMARY KEY,
            data_lancamento DATE NOT NULL,
            tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('adiantamento', 'abatimento_nf', 'complemento', 'saldo_inicial')),
            descricao TEXT,
            numero_nota VARCHAR(50),
            valor NUMERIC(15, 2) NOT NULL,
            valor_gerdau NUMERIC(15, 2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `).catch(e => console.error('Erro criando tabela conta_corrente_gerdau:', e.message));

    router.get('/conta-corrente', async (req, res) => {
        try {
            // UNION entre lançamentos manuais e abatimentos automáticos vindo das NFs pagas pela Gerdau
            const query = `
                SELECT * FROM (
                    -- Lançamentos Manuais
                    SELECT 
                        id, 
                        data_lancamento, 
                        tipo, 
                        descricao, 
                        numero_nota, 
                        valor, 
                        valor_gerdau, 
                        true as manual
                    FROM conta_corrente_gerdau

                    UNION ALL

                    -- Abatimentos Automáticos (NFs que constam no sistema Gerdau ou Baixa Manual)
                    SELECT 
                        0 as id,
                        nf.data_emissao as data_lancamento,
                        'abatimento_nf' as tipo,
                        'Abatimento Automático (NF Gerdau)' as descricao,
                        nf.numero_nota,
                        CASE 
                            WHEN nf.baixa_manual THEN COALESCE(s.valor_esperado, 0)
                            ELSE COALESCE(g.valor_total, 0)
                        END as valor,
                        COALESCE(g.valor_total, 0) as valor_gerdau,
                        false as manual
                    FROM notas_fiscais nf
                    LEFT JOIN (
                        SELECT numero_nota, SUM(valor_total) as valor_esperado 
                        FROM itens_nota_sygecom GROUP BY numero_nota
                    ) s ON nf.numero_nota = s.numero_nota
                    LEFT JOIN (
                        SELECT numero_nota, SUM(valor_total) as valor_total 
                        FROM itens_recebidos_gerdau GROUP BY numero_nota
                    ) g ON nf.numero_nota = g.numero_nota
                    WHERE 
                        g.valor_total IS NOT NULL -- Se tem valor na Gerdau, abate automático
                        OR nf.baixa_manual = true  -- Se foi baixada manual, abate o valor esperado
                ) combined
                ORDER BY data_lancamento ASC, id ASC
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao buscar conta corrente' });
        }
    });

    router.post('/conta-corrente', async (req, res) => {
        const { tipo, data_lancamento, valor, descricao, numero_nota, valor_gerdau } = req.body;
        if (!tipo || !data_lancamento || valor === undefined || isNaN(valor)) {
            return res.status(400).json({ error: 'Campos obrigatórios: tipo, data_lancamento, valor' });
        }
        try {
            const result = await pool.query(
                `INSERT INTO conta_corrente_gerdau (tipo, data_lancamento, valor, descricao, numero_nota, valor_gerdau)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [tipo, data_lancamento, valor, descricao || null, numero_nota || null, valor_gerdau || null]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao salvar lançamento' });
        }
    });

    router.delete('/conta-corrente/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const result = await pool.query(
                'DELETE FROM conta_corrente_gerdau WHERE id = $1 RETURNING *', [id]
            );
            if (result.rows.length === 0) return res.status(404).json({ error: 'Lançamento não encontrado' });
            res.json({ message: 'Lançamento excluído com sucesso' });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao excluir lançamento' });
        }
    });

    return router;
};
