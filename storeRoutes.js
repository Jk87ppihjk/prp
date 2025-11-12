// ! Arquivo: storeRoutes.js
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { protectSeller } = require('./sellerAuthMiddleware'); 

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
// ROTA PÚBLICA: Detalhes de uma Loja E Seus Produtos
// -------------------------------------------------------------------

// 4. LER Detalhes da Loja e Produtos (GET /api/stores/:id)
router.get('/stores/:id', async (req, res) => {
    const store_id = req.params.id;

    try {
        // 1. Buscar os detalhes da loja
        const [storeRows] = await pool.execute('SELECT * FROM stores WHERE id = ? AND is_active = TRUE', [store_id]);

        if (storeRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Loja não encontrada ou inativa.' });
        }

        const store = storeRows[0];

        // 2. Buscar todos os produtos ativos dessa loja (usando o seller_id)
        const [products] = await pool.execute(
            'SELECT id, name, description, price, stock_quantity, image_url FROM products WHERE seller_id = ? AND is_active = TRUE',
            [store.seller_id]
        );

        // 3. Combinar e retornar os dados
        res.status(200).json({ 
            success: true, 
            store: store,
            products: products 
        });

    } catch (error) {
        console.error('Erro ao buscar detalhes da loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar detalhes da loja.' });
    }
});

// -------------------------------------------------------------------
// ROTAS DE GESTÃO DA LOJA (PROTEGIDAS)
// -------------------------------------------------------------------

// 1. CRIAR Loja (POST /api/stores)
router.post('/stores', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    const { name, bio, address_line1, logo_url, banner_url } = req.body;

    if (!name || !address_line1) {
        return res.status(400).json({ success: false, message: 'Nome e Endereço da loja são obrigatórios.' });
    }

    try {
        const [existingStore] = await pool.execute('SELECT id FROM stores WHERE seller_id = ?', [seller_id]);
        if (existingStore.length > 0) {
            return res.status(409).json({ success: false, message: 'Você já possui uma loja cadastrada. Use a rota PUT para atualizar.' });
        }

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
    const seller_id = req.user.id; 

    const { name, bio, address_line1, logo_url, banner_url } = req.body;

    if (!name || !address_line1) {
        return res.status(400).json({ success: false, message: 'Nome e Endereço da loja são obrigatórios.' });
    }

    try {
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


// 5. Rota para LISTAR TODAS as Lojas (PÚBLICA)
router.get('/stores', async (req, res) => {
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
