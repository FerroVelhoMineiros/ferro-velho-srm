const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir arquivos do frontend
const path = require('path');
app.use(express.static(path.join(__dirname, '../')));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Importar e acoplar as rotas da Conciliação (Sygecom e Gerdau)
const conciliacaoRoutes = require('./routes_conciliacao')(pool);
app.use('/api/conciliacao', conciliacaoRoutes);

// GET all items from a collection (Frota)
app.get('/api/:collection', async (req, res) => {
    const { collection } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM ferrovelho_data WHERE collection_name = $1 ORDER BY created_at DESC',
            [collection]
        );

        // Map to return just the data payload mixed with id
        const items = result.rows.map(row => ({
            id: row.id,
            ...row.data,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));

        res.json(items);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar dados' });
    }
});

// GET specific item
app.get('/api/:collection/:id', async (req, res) => {
    const { collection, id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM ferrovelho_data WHERE collection_name = $1 AND id = $2',
            [collection, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Item não encontrado' });
        }

        const row = result.rows[0];
        res.json({
            id: row.id,
            ...row.data,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar item' });
    }
});

// POST new item
app.post('/api/:collection', async (req, res) => {
    const { collection } = req.params;
    const data = req.body;

    // Use a pseudo-random ID similar to previous localstorage logic or rely on a UUID.
    // We'll generate a simple one like previous `Date.now().toString(36) + Math.random().toString(36).substr(2)`
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2);
    const now = new Date();

    try {
        await pool.query(
            'INSERT INTO ferrovelho_data (id, collection_name, data, created_at) VALUES ($1, $2, $3, $4)',
            [id, collection, data, now]
        );

        res.status(201).json({
            id,
            ...data,
            createdAt: now.toISOString()
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao criar item' });
    }
});

// PUT update item
app.put('/api/:collection/:id', async (req, res) => {
    const { collection, id } = req.params;
    const data = req.body;
    const now = new Date();

    try {
        // First get existing data to merge
        const existing = await pool.query(
            'SELECT data FROM ferrovelho_data WHERE collection_name = $1 AND id = $2',
            [collection, id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Item não encontrado para atualizar' });
        }

        const mergedData = { ...existing.rows[0].data, ...data };

        await pool.query(
            'UPDATE ferrovelho_data SET data = $1, updated_at = $2 WHERE collection_name = $3 AND id = $4',
            [mergedData, now, collection, id]
        );

        res.json({
            id,
            ...mergedData,
            updatedAt: now.toISOString()
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar item' });
    }
});

// DELETE item
app.delete('/api/:collection/:id', async (req, res) => {
    const { collection, id } = req.params;
    try {
        await pool.query(
            'DELETE FROM ferrovelho_data WHERE collection_name = $1 AND id = $2',
            [collection, id]
        );
        res.json({ message: 'Deletado com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao deletar item' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend rodando na porta ${PORT}`);
});
