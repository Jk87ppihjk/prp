// ! Arquivo: storeRoutes.js (VERSÃO CORRIGIDA E COMPLETA)
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { protectSeller } = require('./sellerAuthMiddleware'); // Proteção de Lojista

// ! Configuração do Banco de Dados
const dbConfig = { 
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
}; 
const pool = mysql.createPool(dbConfig);

/**
 * 1. Rota para BUSCAR a loja do lojista logado (GET /api/stores/mine)
 * Usado pelo painel.html para carregar os dados
 */
router.get('/stores/mine', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM stores WHERE seller_id = ? LIMIT 1', 
            [seller_id]
        );
        
        if (rows.length === 0) {
            // Isso não é um erro, é o estado "loja não criada" que o painel.html espera
            return res.status(404).json({ success: false, message: 'Nenhuma loja encontrada para este lojista.' });
        }
        
        res.status(200).json({ success: true, store: rows[0] });

    } catch (error) {
        console.error('[STORES] Erro ao buscar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar dados da loja.' });
    }
});

/**
 * 2. Rota para CRIAR uma nova loja (POST /api/stores)
 * Usado pelo painel.html se GET /mine der 404
 */
router.post('/stores', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    const { name, bio, address_line1, logo_url, banner_url } = req.body;

    if (!name || !address_line1) {
        return res.status(400).json({ success: false, message: 'Nome da loja e Endereço são obrigatórios.' });
    }

    try {
        // Verifica se já existe uma loja (Regra de Negócio)
        const [existing] = await pool.execute('SELECT id FROM stores WHERE seller_id = ?', [seller_id]);
        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: 'Este lojista já possui uma loja cadastrada.' });
        }

        const [result] = await pool.execute(
            `INSERT INTO stores (seller_id, name, bio, address_line1, logo_url, banner_url) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [seller_id, name, bio || null, address_line1, logo_url || null, banner_url || null]
        );
        
        res.status(201).json({ 
            success: true, 
            message: 'Loja cadastrada com sucesso!', 
            store_id: result.insertId 
        });

    } catch (error) {
        console.error('[STORES] Erro ao criar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar a loja.' });
    }
});

/**
 * 3. Rota para ATUALIZAR uma loja existente (PUT /api/stores/:id)
 * Usado pelo painel.html para salvar
 */
router.put('/stores/:id', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    const storeId = req.params.id;
    const { name, bio, address_line1, logo_url, banner_url } = req.body;

    if (!name || !address_line1) {
        return res.status(400).json({ success: false, message: 'Nome da loja e Endereço são obrigatórios.' });
    }

    try {
        const [result] = await pool.execute(
            `UPDATE stores SET 
                name = ?, bio = ?, address_line1 = ?, logo_url = ?, banner_url = ?
             WHERE id = ? AND seller_id = ?`, // Segurança: SÓ PODE ATUALIZAR A PRÓPRIA LOJA
            [name, bio || null, address_line1, logo_url || null, banner_url || null, storeId, seller_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Loja não encontrada ou você não tem permissão para editar.' });
        }

        res.status(200).json({ success: true, message: 'Loja atualizada com sucesso.' });

    } catch (error) {
        console.error('[STORES] Erro ao atualizar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao atualizar a loja.' });
    }
});

module.exports = router;
