// ! Arquivo: productRoutes.js (CORRIGIDO - ADICIONADA ROTA /store/:sellerId)
const express = require('express');
const router = express.Router();
const { protectSeller } = require('./sellerAuthMiddleware'); 
const { protect } = require('./authMiddleware'); 
const pool = require('./config/db'); // Importa o pool compartilhado

// -------------------------------------------------------------------
// Rotas de Produtos
// -------------------------------------------------------------------

// 1. Rota para CRIAR um novo produto (PROTEGIDA)
router.post('/products', protectSeller, async (req, res) => {
    const seller_id = req.user.id; 
    
    try {
        // --- REGRA DE NEGÓCIO: Verificação de Loja ---
        console.log(`[PRODUCTS] Verificando existência da loja para Seller ID: ${seller_id}`);
        const [storeCheck] = await pool.execute('SELECT id FROM stores WHERE seller_id = ?', [seller_id]);
        
        if (storeCheck.length === 0) {
            console.warn(`[PRODUCTS] BLOQUEIO: Loja não encontrada para Seller ID: ${seller_id}`);
            return res.status(403).json({ success: false, message: 'A criação de produtos requer que sua loja esteja cadastrada primeiro.' });
        }
        // --- FIM da Verificação ---

        const { name, description, price, stock_quantity, category, image_url } = req.body;

        if (!name || !price) {
            return res.status(400).json({ success: false, message: 'Nome e Preço são obrigatórios.' });
        }

        // Insere o produto no DB
        const [result] = await pool.execute(
            `INSERT INTO products 
            (seller_id, name, description, price, stock_quantity, category, image_url) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [seller_id, name, description, price, stock_quantity, category, image_url]
        );
        
        console.log(`[PRODUCTS] Produto ID ${result.insertId} criado com sucesso.`);

        res.status(201).json({ 
            success: true, 
            message: 'Produto criado com sucesso pelo lojista.', 
            product_id: result.insertId 
        });

    } catch (error) {
        console.error('[PRODUCTS] ERRO ao criar produto:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar produto.' });
    }
});


// ! ==================================================================
// ! NOVA ROTA ADICIONADA (Chamada pelo painel.html)
// ! ==================================================================
// 2. Rota para LER os produtos DE UM LOJISTA (PROTEGIDA)
router.get('/products/store/:sellerId', protectSeller, async (req, res) => {
    const seller_id = req.params.sellerId;
    console.log(`[PRODUCTS/STORE] Buscando produtos para o Seller ID: ${seller_id}`);

    // Verificação de segurança: garante que o lojista logado SÓ PODE ver os SEUS produtos
    if (req.user.id.toString() !== seller_id) {
         console.warn(`[PRODUCTS/STORE] BLOQUEIO: Lojista ${req.user.id} tentando ver produtos do ${seller_id}.`);
         return res.status(403).json({ success: false, message: 'Acesso negado.' });
    }
    
    try {
        // Busca todos os produtos (ativos e inativos) do lojista
        const [products] = await pool.execute(
            'SELECT * FROM products WHERE seller_id = ? ORDER BY created_at DESC',
            [seller_id]
        );
        console.log(`[PRODUCTS/STORE] Encontrados ${products.length} produtos.`);
        res.status(200).json({ success: true, products });
    } catch (error) {
        console.error('[PRODUCTS/STORE] Erro ao buscar produtos da loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar produtos.' });
    }
});
// ! ==================================================================


// 3. Rota para LER a lista de produtos (PÚBLICA)
router.get('/products', async (req, res) => {
    try {
        console.log('[PRODUCTS] Buscando lista de produtos ativos...');
        
        // Query com JOIN para obter nome da loja e do vendedor
        const [products] = await pool.execute(
            `SELECT p.*, s.name AS store_name, u.full_name AS seller_name, u.city 
             FROM products p
             JOIN stores s ON p.seller_id = s.seller_id
             JOIN users u ON p.seller_id = u.id
             WHERE p.is_active = TRUE`
        );
        
        if (products.length > 0) {
            console.log(`[PRODUCTS] Sucesso: Retornando ${products.length} produtos.`);
        } else {
             console.log('[PRODUCTS] Sucesso: Nenhuma produto encontrado.');
        }
        
        res.status(200).json({ success: true, count: products.length, products });

    } catch (error) {
        console.error('[PRODUCTS] ERRO ao buscar produtos:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao carregar produtos.' });
    }
});


// 4. Rota para ATUALIZAR um produto (PROTEGIDA)
router.put('/products/:id', protectSeller, async (req, res) => {
    const productId = req.params.id;
    const seller_id = req.user.id; 
    const { name, description, price, stock_quantity, category, image_url, is_active } = req.body;

    try {
        const [result] = await pool.execute(
            `UPDATE products SET 
             name=?, description=?, price=?, stock_quantity=?, category=?, image_url=?, is_active=?
             WHERE id=? AND seller_id=?`,
            [name, description, price, stock_quantity, category, image_url, is_active, productId, seller_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Produto não encontrado ou você não tem permissão para editar.' });
        }

        res.status(200).json({ success: true, message: 'Produto atualizado com sucesso.' });

    } catch (error) {
        console.error('[PRODUCTS] Erro ao atualizar produto:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao atualizar produto.' });
    }
});


// 5. Rota para DELETAR (inativar) um produto (PROTEGIDA)
router.delete('/products/:id', protectSeller, async (req, res) => {
    const productId = req.params.id;
    const seller_id = req.user.id; 

    try {
        // Soft delete (apenas marca como inativo)
        const [result] = await pool.execute(
            'UPDATE products SET is_active = FALSE WHERE id = ? AND seller_id = ?',
            [productId, seller_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Produto não encontrado ou você não tem permissão para inativar.' });
        }

        res.status(200).json({ success: true, message: 'Produto inativado (soft delete) com sucesso.' });

    } catch (error) {
        console.error('[PRODUCTS] Erro ao deletar produto:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao deletar produto.' });
    }
});

module.exports = router;
