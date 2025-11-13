// ! Arquivo: storeRoutes.js (CORREÇÃO FINAL DE CATEGORIAS E ORDEM)
const express = require('express');
const router = express.Router();
const { protectSeller } = require('./sellerAuthMiddleware'); 
const pool = require('./config/db'); // Importa o pool central

// -------------------------------------------------------------------
// ROTAS PRIVADAS (para painel.html)
// -------------------------------------------------------------------

/**
 * 1. Rota para BUSCAR a loja do lojista logado (GET /api/stores/mine) - Ordem Correta
 */
router.get('/stores/mine', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    
    try {
        // Inclui LEFT JOIN para pegar o nome da categoria atual
        const [rows] = await pool.execute(
            `SELECT s.*, c.name AS category_name
             FROM stores s
             LEFT JOIN categories c ON s.category_id = c.id
             WHERE s.seller_id = ? LIMIT 1`,
            [seller_id]
        );

        const store = rows[0];

        if (!store) {
            return res.status(404).json({ success: false, message: 'Nenhuma loja encontrada para este lojista.' });
        }
        
        res.status(200).json({ success: true, store: store });

    } catch (error) {
        console.error('[STORES/MINE] ERRO FATAL ao buscar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar dados da loja.' });
    }
});

/**
 * 2. Rota para CRIAR uma nova loja (POST /api/stores) - Inclui category_id
 */
router.post('/stores', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    // Campo category_id adicionado aqui:
    const { name, bio, address_line1, logo_url, banner_url, category_id } = req.body; 

    if (!name || !address_line1) {
        return res.status(400).json({ success: false, message: 'Nome e Endereço são obrigatórios para a loja.' });
    }

    try {
        const [existingStore] = await pool.execute('SELECT id FROM stores WHERE seller_id = ?', [seller_id]);
        if (existingStore.length > 0) {
            return res.status(409).json({ success: false, message: 'Este vendedor já possui uma loja cadastrada.' });
        }

        const [result] = await pool.execute(
            `INSERT INTO stores (seller_id, name, bio, address_line1, logo_url, banner_url, category_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [seller_id, name, bio || null, address_line1, logo_url || null, banner_url || null, category_id || null]
        );
        
        res.status(201).json({ success: true, message: 'Loja criada com sucesso. Bem-vindo!', store_id: result.insertId });

    } catch (error) {
        console.error('[STORES] ERRO ao criar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar loja.' });
    }
});

/**
 * 3. Rota para ATUALIZAR a loja (PUT /api/stores/:id) - Inclui category_id
 */
router.put('/stores/:id', protectSeller, async (req, res) => {
    const storeId = req.params.id;
    const seller_id = req.user.id;
    // Campo category_id adicionado aqui:
    const { name, bio, address_line1, logo_url, banner_url, category_id } = req.body; 

    try {
        const [result] = await pool.execute(
            `UPDATE stores SET 
             name = ?, bio = ?, address_line1 = ?, logo_url = ?, banner_url = ?, category_id = ? 
             WHERE id = ? AND seller_id = ?`,
            [name, bio || null, address_line1, logo_url || null, banner_url || null, category_id || null, storeId, seller_id] 
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Loja não encontrada ou acesso negado.' });
        }

        res.status(200).json({ success: true, message: 'Loja atualizada com sucesso.' });

    } catch (error) {
        console.error('[STORES] Erro ao atualizar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao atualizar loja.' });
    }
});


// -------------------------------------------------------------------
// ROTA PÚBLICA (para store_profile.html)
// -------------------------------------------------------------------
/**
 * 4. Rota para LER o perfil da loja (GET /api/stores/:id) - PÚBLICA (Ordem Correta)
 */
router.get('/stores/:id', async (req, res) => {
    const storeId = req.params.id;

    try {
        const [storeRows] = await pool.execute(
            `SELECT s.*, c.name AS category_name
             FROM stores s
             LEFT JOIN categories c ON s.category_id = c.id
             WHERE s.id = ? LIMIT 1`,
            [storeId]
        );

        if (storeRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Loja não encontrada.' });
        }
        
        const store = storeRows[0];
        
        const [productRows] = await pool.execute(
            'SELECT id, name, description, price, image_url FROM products WHERE seller_id = ? AND is_active = TRUE ORDER BY created_at DESC',
            [store.seller_id]
        );

        res.status(200).json({ success: true, store: store, products: productRows });

    } catch (error) {
        console.error('[STORES/:ID] ERRO ao buscar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao carregar perfil da loja.' });
    }
});

module.exports = router;
