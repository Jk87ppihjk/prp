// ! Arquivo: storeRoutes.js
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { protectSeller } = require('./sellerAuthMiddleware'); // Protege acesso apenas a lojistas

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
// ROTAS DE GESTÃO DA LOJA (PROTEGIDAS POR protectSeller)
// -------------------------------------------------------------------

// 1. CRIAR Loja (POST /api/stores)
router.post('/stores', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    const { name, bio, address_line1, logo_url, banner_url } = req.body;

    if (!name || !address_line1) {
        return res.status(400).json({ success: false, message: 'Nome e Endereço da loja são obrigatórios.' });
    }

    try {
        // Checa se a loja já existe para evitar duplicidade
        const [existingStore] = await pool.execute('SELECT id FROM stores WHERE seller_id = ?', [seller_id]);
        if (existingStore.length > 0) {
            return res.status(409).json({ success: false, message: 'Você já possui uma loja cadastrada. Use a rota PUT para atualizar.' });
        }

        // Insere a nova loja
        const [result] = await pool.execute(
            `INSERT INTO stores (seller_id, name, bio, address_line1, logo_url, banner_url) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [seller_id, name, bio, address_line1, logo_url, banner_url]
        );

        res.status(201).json({ 
            success: true, 
            message: 'Loja cadastrada com sucesso! Agora você pode criar produtos.',
            store_id: result.insertId 
        });

    } catch (error) {
        console.error('Erro ao criar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar a loja.' });
    }
});


// 2. LER/OBTER os dados da Loja do Lojista (GET /api/stores/mine)
router.get('/stores/mine', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    
    try {
        const [store] = await pool.execute('SELECT * FROM stores WHERE seller_id = ?', [seller_id]);

        if (store.length === 0) {
            // Este é o status 404 que o frontend no painel.html usa para saber que deve CRIAR a loja.
            return res.status(404).json({ success: false, message: 'Loja não encontrada para este usuário.' });
        }

        res.status(200).json({ success: true, store: store[0] });

    } catch (error) {
        console.error('Erro ao buscar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar a loja.' });
    }
});


// 3. ATUALIZAR a Loja (PUT /api/stores/:id)
router.put('/stores/:id', protectSeller, async (req, res) => {
    const store_id = req.params.id;
    const seller_id = req.user.id; // Garante que o usuário logado é o dono da loja

    const { name, bio, address_line1, logo_url, banner_url } = req.body;

    if (!name || !address_line1) {
        return res.status(400).json({ success: false, message: 'Nome e Endereço da loja são obrigatórios.' });
    }

    try {
        // Atualiza a loja, verificando o ID da loja E do lojista
        const [result] = await pool.execute(
            `UPDATE stores 
             SET name=?, bio=?, address_line1=?, logo_url=?, banner_url=?, updated_at=NOW()
             WHERE id=? AND seller_id=?`,
            [name, bio, address_line1, logo_url, banner_url, store_id, seller_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Loja não encontrada ou você não tem permissão para editar.' });
        }

        res.status(200).json({ success: true, message: 'Loja atualizada com sucesso.' });

    } catch (error) {
        console.error('Erro ao atualizar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao atualizar a loja.' });
    }
});


// 4. Rota para LISTAR TODAS as Lojas (PÚBLICA)
router.get('/stores', async (req, res) => {
    // Note: Esta rota é pública e não usa middleware de proteção
    try {
        const [stores] = await pool.execute(
            `SELECT id, name, bio, address_line1, logo_url, banner_url 
             FROM stores 
             WHERE is_active = TRUE`
        );
        
        res.status(200).json({ success: true, stores: stores });

    } catch (error) {
        console.error('Erro ao buscar lista de lojas:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar lista de lojas.' });
    }
});

module.exports = router;
