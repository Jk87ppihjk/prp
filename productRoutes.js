// ! Arquivo: productRoutes.js (FINAL - ADICIONADA ROTA GET /products/:id)
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


// 2. Rota para LER a lista de produtos (PÚBLICA)
router.get('/products', async (req, res) => {
    try {
        console.log('[PRODUCTS] Buscando lista de produtos ativos...');
        
        // Query com JOIN para obter nome da loja e do vendedor
        const [products] = await pool.execute(
            `SELECT p.*, s.id AS store_id, s.name AS store_name, u.full_name AS seller_name, u.city 
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

// ! ==================================================================
// ! NOVA ROTA ADICIONADA: BUSCAR PRODUTO POR ID (PÚBLICA)
// ! ==================================================================
router.get('/products/:id', async (req, res) => {
    const productId = req.params.id;
    console.log(`[PRODUCTS/:ID] Buscando produto ID: ${productId}`);

    try {
        // Query com JOIN para obter nome da loja e do vendedor (apenas 1 produto)
        const [rows] = await pool.execute(
            `SELECT p.*, s.id AS store_id, s.name AS store_name, u.full_name AS seller_name, u.city 
             FROM products p
             JOIN stores s ON p.seller_id = s.seller_id
             JOIN users u ON p.seller_id = u.id
             WHERE p.id = ? AND p.is_active = TRUE LIMIT 1`,
            [productId]
        );

        const product = rows[0];

        if (!product) {
            console.warn(`[PRODUCTS/:ID] Produto ID ${productId} não encontrado ou inativo, retornando 404.`);
            return res.status(404).json({ success: false, message: 'Produto não encontrado ou inativo.' });
        }

        console.log(`[PRODUCTS/:ID] Sucesso: Retornando produto ID ${productId}.`);
        res.status(200).json({ success: true, product });

    } catch (error) {
        console.error('[PRODUCTS/:ID] ERRO ao buscar produto por ID:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao carregar o produto.' });
    }
});
// ! ==================================================================


// 4. Rota para LER os produtos DE UM LOJISTA (PROTEGIDA) - Para Painel
router.get('/products/store/:sellerId', protectSeller, async (req, res) => {
    const seller_id = req.params.sellerId;
    console.log(`[PRODUCTS/STORE] Buscando produtos para o Seller ID: ${seller_id}`);

    if (req.user.id.toString() !== seller_id) {
         console.warn(`[PRODUCTS/STORE] BLOQUEIO: Lojista ${req.user.id} tentando ver produtos do ${seller_id}.`);
         return res.status(403).json({ success: false, message: 'Acesso negado.' });
    }
    
    try {
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


// 5. Rota para ATUALIZAR um produto (PROTEGIDA)
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


// 6. Rota para DELETAR um produto (PROTEGIDA) - Inativação
router.delete('/products/:id', protectSeller, async (req, res) => {
    const productId = req.params.id;
    const seller_id = req.user.id; 

    try {
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
