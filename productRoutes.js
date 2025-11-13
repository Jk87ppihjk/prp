// ! Arquivo: productRoutes.js (COM REGRAS DE PREÇO E SUBCATEGORIA)
const express = require('express');
const router = express.Router();
const { protectSeller } = require('./sellerAuthMiddleware'); 
const { protect } = require('./authMiddleware'); 
const pool = require('./config/db'); // Importa o pool compartilhado

// --- Constantes de Preço ---
const MARKETPLACE_FEE = 5.00; // Taxa do Marketplace (5%)
const DELIVERY_FEE = 5.00;     // Taxa de Entrega
const TOTAL_ADDITION = MARKETPLACE_FEE + DELIVERY_FEE; // R$ 10.00

// -------------------------------------------------------------------
// Rotas de Produtos
// -------------------------------------------------------------------

// 1. Rota para CRIAR um novo produto (PROTEGIDA)
router.post('/products', protectSeller, async (req, res) => {
    const seller_id = req.user.id; 
    
    try {
        const [storeCheck] = await pool.execute('SELECT id FROM stores WHERE seller_id = ?', [seller_id]);
        
        if (storeCheck.length === 0) {
            return res.status(403).json({ success: false, message: 'A criação de produtos requer que sua loja esteja cadastrada primeiro.' });
        }
        
        // Inclui subcategory_id no desestruturação
        const { name, description, price, stock_quantity, category, subcategory_id, image_url } = req.body;

        if (!name || !price) {
            return res.status(400).json({ success: false, message: 'Nome e Preço são obrigatórios.' });
        }
        
        // ***** LÓGICA DE PREÇO CORRIGIDA *****
        const basePrice = parseFloat(price);
        // Adiciona R$ 10.00 (5 Marketplace + 5 Entrega) ao preço antes de salvar
        const finalPrice = basePrice + TOTAL_ADDITION; 
        console.log(`[PRODUCTS/POST] Preço Base: R$${basePrice.toFixed(2)}. Preço Final no DB: R$${finalPrice.toFixed(2)}`);
        // ************************************

        const [result] = await pool.execute(
            `INSERT INTO products 
            (seller_id, name, description, price, stock_quantity, category, subcategory_id, image_url) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [seller_id, name, description, finalPrice, stock_quantity, category, subcategory_id || null, image_url]
        );
        
        res.status(201).json({ 
            success: true, 
            message: 'Produto criado com sucesso. O preço final inclui R$10.00 de taxa.', 
            product_id: result.insertId 
        });

    } catch (error) {
        console.error('[PRODUCTS] ERRO ao criar produto:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar produto.' });
    }
});


// 2. Rota para LER a lista de produtos (PÚBLICA - PARA index.html)
router.get('/products', async (req, res) => {
    const categoryId = req.query.category_id;
    const subcategoryId = req.query.subcategory_id;
    
    let whereClause = 'WHERE p.is_active = TRUE';
    const queryParams = [];

    // Filtro por Categoria Principal (Loja)
    if (categoryId) {
        whereClause += ' AND s.category_id = ?';
        queryParams.push(categoryId);
    }
    
    // Filtro por Subcategoria (Produto)
    if (subcategoryId) {
        whereClause += ' AND p.subcategory_id = ?';
        queryParams.push(subcategoryId);
    }

    try {
        const query = `
            SELECT p.*, s.id AS store_id, s.name AS store_name, u.full_name AS seller_name, u.city 
            FROM products p
            JOIN stores s ON p.seller_id = s.seller_id
            JOIN users u ON p.seller_id = u.id
            ${whereClause}
        `;
        
        const [products] = await pool.execute(query, queryParams);
        
        res.status(200).json({ success: true, count: products.length, products });

    } catch (error) {
        console.error('[PRODUCTS] ERRO ao buscar produtos públicos com filtros:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao carregar produtos.' });
    }
});


// 3. Rota para BUSCAR PRODUTO POR ID (PÚBLICA - PARA product_page.html)
router.get('/products/:id', async (req, res) => {
    const productId = req.params.id;

    try {
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
            return res.status(404).json({ success: false, message: 'Produto não encontrado ou inativo.' });
        }

        res.status(200).json({ success: true, product });

    } catch (error) {
        console.error('[PRODUCTS/:ID] ERRO ao buscar produto por ID:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao carregar o produto.' });
    }
});


// 4. Rota para LER os produtos DE UM LOJISTA (PROTEGIDA - PARA painel.html)
router.get('/products/store/:sellerId', protectSeller, async (req, res) => {
    const seller_id = req.params.sellerId;

    if (req.user.id.toString() !== seller_id) {
         return res.status(403).json({ success: false, message: 'Acesso negado. Você não tem permissão para ver estes produtos.' });
    }
    
    try {
        const [products] = await pool.execute(
            'SELECT * FROM products WHERE seller_id = ? ORDER BY created_at DESC',
            [seller_id]
        );
        
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
    // Inclui subcategory_id no desestruturação
    const { name, description, price, stock_quantity, category, subcategory_id, image_url, is_active } = req.body;
    
    // AQUI ASSUMIMOS QUE O PREÇO JÁ VEIO CORRIGIDO DO FRONTEND (preço final)
    const finalPrice = parseFloat(price);

    try {
        const [result] = await pool.execute(
            `UPDATE products SET 
             name=?, description=?, price=?, stock_quantity=?, category=?, subcategory_id=?, image_url=?, is_active=?
             WHERE id=? AND seller_id=?`,
            [name, description, finalPrice, stock_quantity, category, subcategory_id || null, image_url, is_active, productId, seller_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Produto não encontrado ou você não tem permissão para editar.' });
        }

        res.status(200).json({ success: true, message: 'Produto atualizado com sucesso.' });

    } catch (error) {
        console.error('[PRODUCTS] ERRO ao atualizar produto:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao atualizar produto.' });
    }
});


// 6. Rota para DELETAR (inativar) um produto (PROTEGIDA)
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
        console.error('[PRODUCTS] ERRO ao deletar produto:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao deletar produto.' });
    }
});

module.exports = router;
