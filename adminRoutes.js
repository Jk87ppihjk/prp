// ! Arquivo: adminRoutes.js
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { protectAdmin } = require('./adminAuthMiddleware'); // <-- Importa a proteção de Admin

// ! Configuração do Banco de Dados
const dbConfig = { 
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
}; 
const pool = mysql.createPool(dbConfig);

// -------------------------------------------------------------------
// ROTAS DE CIDADES (CRUD Admin)
// -------------------------------------------------------------------

// CRIAR Nova Cidade (POST /api/admin/cities)
router.post('/admin/cities', protectAdmin, async (req, res) => {
    const { name, state_province } = req.body;
    if (!name || !state_province) {
        return res.status(400).json({ success: false, message: 'Nome e Estado são obrigatórios.' });
    }
    try {
        const [result] = await pool.execute(
            'INSERT INTO cities (name, state_province) VALUES (?, ?)',
            [name, state_province]
        );
        res.status(201).json({ success: true, message: 'Cidade criada com sucesso.', city_id: result.insertId });
    } catch (error) {
        if (error.errno === 1062) {
            return res.status(409).json({ success: false, message: 'Esta cidade já existe.' });
        }
        console.error('Erro ao criar cidade:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar cidade.' });
    }
});

// ATUALIZAR Cidade (PUT /api/admin/cities/:id)
router.put('/admin/cities/:id', protectAdmin, async (req, res) => {
    const cityId = req.params.id;
    const { name, state_province, is_active } = req.body;

    try {
        const [result] = await pool.execute(
            'UPDATE cities SET name=?, state_province=?, is_active=? WHERE id=?',
            [name, state_province, is_active, cityId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Cidade não encontrada.' });
        }
        res.status(200).json({ success: true, message: 'Cidade atualizada com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar cidade:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao atualizar cidade.' });
    }
});

// DELETAR/Inativar Cidade (DELETE /api/admin/cities/:id)
router.delete('/admin/cities/:id', protectAdmin, async (req, res) => {
    const cityId = req.params.id;

    try {
        const [result] = await pool.execute(
            'UPDATE cities SET is_active = FALSE WHERE id = ?',
            [cityId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Cidade não encontrada.' });
        }
        res.status(200).json({ success: true, message: 'Cidade inativada com sucesso.' });
    } catch (error) {
        console.error('Erro ao inativar cidade:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao inativar cidade.' });
    }
});

// -------------------------------------------------------------------
// ROTAS DE BAIRROS (CRUD Admin)
// -------------------------------------------------------------------

// CRIAR Novo Bairro (POST /api/admin/districts)
router.post('/admin/districts', protectAdmin, async (req, res) => {
    const { city_id, name } = req.body;
    if (!city_id || !name) {
        return res.status(400).json({ success: false, message: 'ID da Cidade e Nome do Bairro são obrigatórios.' });
    }
    try {
        const [result] = await pool.execute(
            'INSERT INTO districts (city_id, name) VALUES (?, ?)',
            [city_id, name]
        );
        res.status(201).json({ success: true, message: 'Bairro criado com sucesso.', district_id: result.insertId });
    } catch (error) {
        if (error.errno === 1062) {
            return res.status(409).json({ success: false, message: 'Este bairro já existe nesta cidade.' });
        }
        console.error('Erro ao criar bairro:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar bairro.' });
    }
});

// ATUALIZAR Bairro (PUT /api/admin/districts/:id)
router.put('/admin/districts/:id', protectAdmin, async (req, res) => {
    const districtId = req.params.id;
    const { name, is_active } = req.body;

    try {
        const [result] = await pool.execute(
            'UPDATE districts SET name=?, is_active=? WHERE id=?',
            [name, is_active, districtId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Bairro não encontrado.' });
        }
        res.status(200).json({ success: true, message: 'Bairro atualizado com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar bairro:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao atualizar bairro.' });
    }
});

// DELETAR/Inativar Bairro (DELETE /api/admin/districts/:id)
router.delete('/admin/districts/:id', protectAdmin, async (req, res) => {
    const districtId = req.params.id;

    try {
        const [result] = await pool.execute(
            'UPDATE districts SET is_active = FALSE WHERE id = ?',
            [districtId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Bairro não encontrado.' });
        }
        res.status(200).json({ success: true, message: 'Bairro inativado com sucesso.' });
    } catch (error) {
        console.error('Erro ao inativar bairro:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao inativar bairro.' });
    }
});

// -------------------------------------------------------------------
// ROTA PÚBLICA: Listar Cidades Disponíveis (Usada pelo Frontend)
// -------------------------------------------------------------------

router.get('/cities', async (req, res) => {
    try {
        // Busca todas as cidades ativas, retornando ID, Nome e Estado
        const [cities] = await pool.execute(
            'SELECT id, name, state_province FROM cities WHERE is_active = TRUE ORDER BY name'
        );
        
        res.status(200).json({ success: true, data: cities });

    } catch (error) {
        console.error('Erro ao buscar lista de cidades:', error);
        res.status(500).json({ success: false, message: 'Erro ao carregar cidades.' });
    }
});

module.exports = router;
