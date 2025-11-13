const express = require('express');
const router = express.Router();
const { protectSeller } = require('./sellerAuthMiddleware'); 
const pool = require('./config/db'); 

// -------------------------------------------------------------------
// Rotas de Loja
// -------------------------------------------------------------------

// 1. Rota para CRIAR uma nova loja (POST /api/stores) - PROTEGIDA
router.post('/stores', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    
    // Verifica se o vendedor já tem uma loja
    const [existingStore] = await pool.execute('SELECT id FROM stores WHERE seller_id = ?', [seller_id]);
    if (existingStore.length > 0) {
        return res.status(409).json({ success: false, message: 'Este vendedor já possui uma loja cadastrada.' });
    }

    // CAMPOS DE CRIAÇÃO (AGORA INCLUI category_id)
    const { name, bio, address_line1, logo_url, banner_url, category_id } = req.body; 

    if (!name || !address_line1) {
        return res.status(400).json({ success: false, message: 'Nome e Endereço são obrigatórios para a loja.' });
    }

    try {
        // Insere a loja no DB, incluindo category_id (pode ser NULL se não for fornecido)
        const [result] = await pool.execute(
            `INSERT INTO stores 
            (seller_id, name, bio, address_line1, logo_url, banner_url, category_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [seller_id, name, bio || null, address_line1, logo_url || null, banner_url || null, category_id || null]
        );
        
        console.log(`[STORES] Loja ID ${result.insertId} criada com sucesso para o vendedor ${seller_id}.`);

        res.status(201).json({ 
            success: true, 
            message: 'Loja criada com sucesso. Bem-vindo!', 
            store_id: result.insertId 
        });

    } catch (error) {
        console.error('[STORES] ERRO ao criar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar loja.' });
    }
});


// 2. Rota para LER o perfil da loja (GET /api/stores/:id) - PÚBLICA (Para store_profile.html)
router.get('/stores/:id', async (req, res) => {
    const storeId = req.params.id;
    console.log(`[STORES/:ID] Buscando perfil da loja ID: ${storeId}`);

    try {
        // 1. Busca os detalhes da loja, incluindo a Categoria
        const [storeRows] = await pool.execute(
            `SELECT s.*, u.full_name AS seller_name, c.name AS category_name
             FROM stores s
             JOIN users u ON s.seller_id = u.id
             LEFT JOIN categories c ON s.category_id = c.id -- NOVO JOIN para a categoria
             WHERE s.id = ?`,
            [storeId]
        );

        const store = storeRows[0];

        if (!store) {
            return res.status(404).json({ success: false, message: 'Loja não encontrada.' });
        }
        
        // 2. Busca os produtos ativos desta loja (para a vitrine)
        const [productRows] = await pool.execute(
            'SELECT id, name, description, price, image_url FROM products WHERE seller_id = ? AND is_active = TRUE ORDER BY created_at DESC',
            [store.seller_id]
        );

        console.log(`[STORES/:ID] Sucesso: Loja encontrada com ${productRows.length} produtos.`);

        // Retorna os detalhes da loja e a lista de produtos (vitrine)
        res.status(200).json({ 
            success: true, 
            store: store, 
            products: productRows 
        });

    } catch (error) {
        console.error('[STORES/:ID] ERRO ao buscar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao carregar perfil da loja.' });
    }
});


// 3. Rota para ATUALIZAR a loja (PUT /api/stores/:id) - PROTEGIDA
router.put('/stores/:id', protectSeller, async (req, res) => {
    const storeId = req.params.id;
    const seller_id = req.user.id;
    
    // CAMPOS DE ATUALIZAÇÃO (AGORA INCLUI category_id)
    const { name, bio, address_line1, logo_url, banner_url, category_id } = req.body; 

    try {
        // Atualiza a loja no DB, incluindo category_id
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


// 4. Rota para LER a loja do vendedor autenticado (GET /api/stores/mine) - PROTEGIDA
router.get('/stores/mine', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    console.log(`[STORES/MINE] Buscando loja do vendedor ID: ${seller_id}`);
    
    try {
        // Busca os detalhes da loja, incluindo a Categoria
        const [rows] = await pool.execute(
             `SELECT s.*, u.full_name AS seller_name, c.name AS category_name
             FROM stores s
             JOIN users u ON s.seller_id = u.id
             LEFT JOIN categories c ON s.category_id = c.id -- NOVO JOIN para a categoria
             WHERE s.seller_id = ?`,
            [seller_id]
        );

        const store = rows[0];

        if (!store) {
            return res.status(404).json({ success: false, message: 'Loja não encontrada para este vendedor.' });
        }

        res.status(200).json({ success: true, store });

    } catch (error) {
        console.error('[STORES/MINE] ERRO ao buscar minha loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao carregar dados da loja.' });
    }
});

// 5. Rota para DELETAR a loja (DELETE /api/stores/:id) - PROTEGIDA
router.delete('/stores/:id', protectSeller, async (req, res) => {
    const storeId = req.params.id;
    const seller_id = req.user.id; 

    try {
        // ATENÇÃO: Deletar a loja deve, idealmente, inativar (soft delete) ou desvincular todos os produtos e vídeos Fy dela.
        
        // 1. Excluir os vídeos Fy do lojista (Opcional, dependendo da regra de negócio)
        // await pool.execute('DELETE FROM fy_videos WHERE seller_id = ?', [seller_id]);
        
        // 2. Inativar todos os produtos (Soft Delete)
        await pool.execute('UPDATE products SET is_active = FALSE WHERE seller_id = ?', [seller_id]);
        
        // 3. Deletar a loja
        const [result] = await pool.execute(
            'DELETE FROM stores WHERE id = ? AND seller_id = ?',
            [storeId, seller_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Loja não encontrada ou acesso negado.' });
        }

        res.status(200).json({ success: true, message: 'Loja e seus produtos inativados/excluídos com sucesso.' });

    } catch (error) {
        console.error('[STORES] Erro ao deletar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao deletar loja.' });
    }
});


module.exports = router;
