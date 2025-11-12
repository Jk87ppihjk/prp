// ! Arquivo: adminRoutes.js (CRUD COMPLETO E CORRIGIDO)
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { protectAdmin } = require('./adminAuthMiddleware'); 

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
// ROTA PÚBLICA PARA LISTAR CIDADES (Usada no Login/Cadastro)
// -------------------------------------------------------------------
// Esta rota é PÚBLICA e responde em GET /api/cities
router.get('/cities', async (req, res) => {
    try {
        // Seleciona apenas cidades ativas para o frontend
        const [cities] = await pool.execute(
            'SELECT id, name, state_province FROM cities WHERE is_active = TRUE ORDER BY name'
        );
        res.status(200).json({ success: true, data: cities });
    } catch (error) {
        console.error('Erro ao listar cidades públicas:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao listar cidades.' });
    }
});


// -------------------------------------------------------------------
// ROTAS DE GESTÃO DE CIDADES (CRUD) - PROTEGIDAS
// -------------------------------------------------------------------

// CREATE (Criação existente)
// Responde em POST /api/admin/cities
router.post('/admin/cities', protectAdmin, async (req, res) => {
    const { name, state_province } = req.body;
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

// READ (Listar todas as cidades para o painel de gestão)
// Responde em GET /api/admin/cities
router.get('/admin/cities', protectAdmin, async (req, res) => {
    try {
        const [cities] = await pool.execute('SELECT * FROM cities ORDER BY name');
        res.status(200).json({ success: true, data: cities });
    } catch (error) T_
        console.error('Erro ao listar cidades:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao listar cidades.' });
    }
});

// UPDATE (Editar cidade)
// Responde em PUT /api/admin/cities/:id
router.put('/admin/cities/:id', protectAdmin, async (req, res) => {
    const cityId = req.params.id;
    const { name, state_province, is_active } = req.body; // is_active é opcional
    try {
        const [result] = await pool.execute(
            'UPDATE cities SET name = ?, state_province = ?, is_active = COALESCE(?, is_active) WHERE id = ?',
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

// DELETE (Excluir cidade)
// Responde em DELETE /api/admin/cities/:id
router.delete('/admin/cities/:id', protectAdmin, async (req, res) => {
    const cityId = req.params.id;
    try {
        const [result] = await pool.execute('DELETE FROM cities WHERE id = ?', [cityId]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Cidade não encontrada.' });
        }
        res.status(200).json({ success: true, message: 'Cidade excluída com sucesso.' });
    } catch (error) {
        // Erro 1451: Restrição de chave estrangeira (ainda há bairros ou usuários linkados)
        if (error.errno === 1451) {
             return res.status(409).json({ success: false, message: 'Não é possível excluir: existem Bairros ou Usuários vinculados a esta cidade.' });
        }
        console.error('Erro ao excluir cidade:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao excluir cidade.' });
    }
});

// -------------------------------------------------------------------
// ROTAS DE GESTÃO DE BAIRROS (CRUD) - PROTEGIDAS
// -------------------------------------------------------------------

// CREATE (Criação existente)
router.post('/admin/districts', protectAdmin, async (req, res) => {
    const { city_id, name } = req.body;
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

// READ (Listar todos os bairros para o painel de gestão - com nome da cidade)
router.get('/admin/districts', protectAdmin, async (req, res) => {
    try {
        const [districts] = await pool.execute(
            `SELECT d.*, c.name AS city_name, c.state_province 
             FROM districts d
             JOIN cities c ON d.city_id = c.id
             ORDER BY c.name, d.name`
        );
        res.status(200).json({ success: true, data: districts });
    } catch (error) {
        console.error('Erro ao listar bairros:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao listar bairros.' });
    }
});

// UPDATE (Editar bairro)
router.put('/admin/districts/:id', protectAdmin, async (req, res) => {
    const districtId = req.params.id;
    const { name, city_id } = req.body;
    try {
        const [result] = await pool.execute(
            'UPDATE districts SET name = ?, city_id = ? WHERE id = ?',
            [name, city_id, districtId]
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

// DELETE (Excluir bairro)
router.delete('/admin/districts/:id', protectAdmin, async (req, res) => {
    const districtId = req.params.id;
    try {
        const [result] = await pool.execute('DELETE FROM districts WHERE id = ?', [districtId]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Bairro não encontrado.' });
        }
        res.status(200).json({ success: true, message: 'Bairro excluído com sucesso.' });
    } catch (error) {
        console.error('Erro ao excluir bairro:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao excluir bairro.' });
    }
});

module.exports = router;
